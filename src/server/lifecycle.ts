// Service request lifecycle: explicit state machine (FRD §5, §53), immutable status events (FRD §30).
import { sql } from './db';
import { conflict, notFound, bad, Ctx } from './http';
import { actorOf, audit, randomDigits, randomToken } from './auth';
import { TRANSITIONS, SERVICE_EVENTS, STATUS_LABEL, isUrgent, TERMINAL } from '../shared/constants';
import { alertOps, notifyCustomer, notifyCompanion } from './notifications';
import { checkServiceArea, createLocation, geocode } from './geo';
import { findPricingRule, quote, computeCharge } from './pricing';
import { serviceTypeLabel, getSetting } from './settings';
import { createPaymentForRequest } from './payments';

export interface Actor { type: string; id: string | null; name: string }
export const SYSTEM: Actor = { type: 'system', id: null, name: 'System' };
export const actor = (ctx: Ctx | null): Actor => (ctx ? actorOf(ctx) : SYSTEM);

export async function insertEvent(
  tx: any,
  requestId: string,
  e: { type: string; label: string; from?: string | null; to?: string | null; actor: Actor; notes?: string | null; metadata?: any; customerVisible?: boolean },
) {
  const rows = await tx`
    INSERT INTO status_events (request_id, event_type, label, from_status, to_status, actor_type, actor_id, actor_name, notes, metadata, customer_visible)
    VALUES (${requestId}, ${e.type}, ${e.label}, ${e.from ?? null}, ${e.to ?? null}, ${e.actor.type}, ${e.actor.id}, ${e.actor.name},
            ${e.notes ?? null}, ${tx.json(e.metadata ?? {})}, ${e.customerVisible ?? true})
    RETURNING *`;
  return rows[0];
}

export async function lockRequest(tx: any, id: string) {
  const rows = await tx`SELECT * FROM service_requests WHERE id = ${id} FOR UPDATE`;
  if (!rows[0]) throw notFound('Request not found');
  return rows[0];
}

export function assertTransition(from: string, to: string) {
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw conflict(`Invalid transition: ${STATUS_LABEL[from] || from} → ${STATUS_LABEL[to] || to}`, { from, to, allowed: TRANSITIONS[from] });
  }
}

/** Core transition inside an existing transaction. */
export async function transitionTx(
  tx: any,
  r: any,
  to: string,
  a: Actor,
  opts: { type?: string; label?: string; notes?: string | null; metadata?: any; patch?: Record<string, any>; customerVisible?: boolean } = {},
) {
  assertTransition(r.current_status, to);
  const patch: Record<string, any> = { current_status: to, updated_at: new Date(), ...(opts.patch || {}) };
  await tx`UPDATE service_requests SET ${tx(patch)} WHERE id = ${r.id}`;
  const ev = await insertEvent(tx, r.id, {
    type: opts.type || 'status_changed',
    label: opts.label || STATUS_LABEL[to],
    from: r.current_status,
    to,
    actor: a,
    notes: opts.notes,
    metadata: opts.metadata,
    customerVisible: opts.customerVisible,
  });
  r.current_status = to;
  Object.assign(r, patch);
  return ev;
}

// ------------------------------------------------------------------ Request creation (FRD §11)
export interface CreateRequestInput {
  channel: 'whatsapp' | 'web' | 'phone' | 'ops';
  customer: { name?: string | null; phone: string; email?: string | null };
  patient: {
    name?: string | null; age?: number | null; gender?: string | null; relationship?: string | null; phone?: string | null;
    language?: string | null; consent?: boolean;
  };
  pickup: { address?: string | null; lat?: number | null; lng?: number | null; source?: string };
  destination?: { name?: string | null; address?: string | null; lat?: number | null; lng?: number | null } | null;
  destinationUndecided?: boolean;
  serviceType: string;
  urgency: 'ASAP' | 'WITHIN_2_HOURS' | 'LATER_TODAY' | 'SCHEDULED';
  requestedAt?: string | Date | null;
  mobility: 'INDEPENDENT' | 'NEEDS_ASSISTANCE' | 'BEDRIDDEN';
  specialInstructions?: string | null;
  source?: string | null;
  utm?: Record<string, any>;
  idempotencyKey?: string | null;
}

export async function createServiceRequest(input: CreateRequestInput, a: Actor, ctx: Ctx | null = null) {
  if (input.idempotencyKey) {
    const existing = await sql`SELECT * FROM service_requests WHERE idempotency_key = ${input.idempotencyKey}`;
    if (existing[0]) return { request: existing[0], duplicate: true };
  }
  if (!['ASAP', 'WITHIN_2_HOURS', 'LATER_TODAY', 'SCHEDULED'].includes(input.urgency)) throw bad('Invalid urgency');
  if (!['INDEPENDENT', 'NEEDS_ASSISTANCE', 'BEDRIDDEN'].includes(input.mobility)) throw bad('Invalid mobility');
  if (!input.pickup.address && input.pickup.lat == null) throw bad('Pickup location is required');

  // Geocode pickup if only typed; maps failures are tolerated (typed address retained).
  let pLat = input.pickup.lat ?? null;
  let pLng = input.pickup.lng ?? null;
  let pSource = input.pickup.source || 'typed';
  if (pLat == null && input.pickup.address) {
    const g = await geocode(input.pickup.address);
    if (g) { pLat = g.lat; pLng = g.lng; pSource = `typed+${g.source}`; }
  }
  const area = await checkServiceArea(pLat, pLng, input.pickup.address ?? null);

  let dLat = input.destination?.lat ?? null;
  let dLng = input.destination?.lng ?? null;
  const destText = input.destination?.name || input.destination?.address || null;
  if (destText && dLat == null) {
    const g = await geocode(destText);
    if (g) { dLat = g.lat; dLng = g.lng; }
  }

  const requestedAt =
    input.urgency === 'ASAP' ? new Date()
    : input.urgency === 'WITHIN_2_HOURS' ? new Date(Date.now() + 2 * 3600e3)
    : input.requestedAt ? new Date(input.requestedAt)
    : new Date(Date.now() + 4 * 3600e3);
  if (input.urgency === 'SCHEDULED' && requestedAt.getTime() < Date.now() - 5 * 60e3) throw bad('Scheduled time must be in the future');

  const reviewReasons: string[] = [];
  if (input.mobility === 'BEDRIDDEN') reviewReasons.push('Patient cannot walk / bedridden – confirm a standard companion is appropriate');
  if (area.inArea === false) reviewReasons.push('Pickup appears to be outside the supported service area');
  if (area.inArea === null) reviewReasons.push('Service area could not be verified automatically');
  if (input.serviceType === 'not_sure') reviewReasons.push('Customer unsure of service type – call to clarify');

  const result = await sql.begin(async (tx: any) => {
    const cust = (await tx`
      INSERT INTO customers (name, phone, email, source, utm)
      VALUES (${input.customer.name ?? null}, ${input.customer.phone}, ${input.customer.email ?? null}, ${input.source ?? input.channel}, ${tx.json(input.utm ?? {})})
      ON CONFLICT (phone) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), email = COALESCE(EXCLUDED.email, customers.email), updated_at = now()
      RETURNING *`)[0];

    // Reuse patient profile for repeat bookings of the same relationship/name
    let patient = (await tx`
      SELECT * FROM patients WHERE customer_id = ${cust.id}
        AND lower(coalesce(relationship,'')) = lower(${input.patient.relationship ?? ''})
        AND lower(coalesce(name,'')) = lower(${input.patient.name ?? ''})
      ORDER BY created_at DESC LIMIT 1`)[0];
    if (patient) {
      patient = (await tx`UPDATE patients SET
          age = COALESCE(${input.patient.age ?? null}, age), phone = COALESCE(${input.patient.phone ?? null}, phone),
          address = COALESCE(${input.pickup.address ?? null}, address), mobility = ${input.mobility},
          language = COALESCE(${input.patient.language ?? null}, language), updated_at = now()
        WHERE id = ${patient.id} RETURNING *`)[0];
    } else {
      patient = (await tx`
        INSERT INTO patients (customer_id, name, age, gender, relationship, phone, address, mobility, language, special_instructions, consent_given, consent_at)
        VALUES (${cust.id}, ${input.patient.name ?? null}, ${input.patient.age ?? null}, ${input.patient.gender ?? null}, ${input.patient.relationship ?? null},
                ${input.patient.phone ?? null}, ${input.pickup.address ?? null}, ${input.mobility}, ${input.patient.language ?? null},
                ${input.specialInstructions ?? null}, ${!!input.patient.consent}, ${input.patient.consent ? new Date() : null})
        RETURNING *`)[0];
    }

    const pickupId = await createLocation(tx, { address: input.pickup.address ?? null, lat: pLat, lng: pLng, source: pSource });
    const destId = destText || dLat != null
      ? await createLocation(tx, { address: input.destination?.address ?? null, place_name: input.destination?.name ?? null, lat: dLat, lng: dLng, source: 'typed' })
      : null;

    const rule = await findPricingRule(input.serviceType, area.areaId, tx);
    const q = rule ? quote(rule, input.urgency) : null;
    const seq = (await tx`SELECT nextval('request_number_seq') AS n`)[0].n;
    const requestNumber = `MC-${seq}`;

    const r = (await tx`
      INSERT INTO service_requests (
        request_number, customer_id, patient_id, channel, source, utm, service_type, urgency, requested_datetime,
        pickup_location_id, destination_location_id, destination_undecided, mobility_status, special_instructions,
        current_status, human_review_required, human_review_reason, out_of_area, service_area_id,
        pricing_rule_id, quoted_amount, booking_code, tracking_token, idempotency_key
      ) VALUES (
        ${requestNumber}, ${cust.id}, ${patient.id}, ${input.channel}, ${input.source ?? null}, ${tx.json(input.utm ?? {})},
        ${input.serviceType}, ${input.urgency}, ${requestedAt}, ${pickupId}, ${destId}, ${!!input.destinationUndecided && !destText},
        ${input.mobility}, ${input.specialInstructions ?? null}, 'NEW', ${reviewReasons.length > 0}, ${reviewReasons.join('; ') || null},
        ${area.inArea === false}, ${area.areaId}, ${rule?.id ?? null}, ${q?.total ?? null}, ${randomDigits(4)}, ${randomToken(18)},
        ${input.idempotencyKey ?? null}
      ) RETURNING *`)[0];

    const ev = await insertEvent(tx, r.id, {
      type: 'request_created', label: 'Request received', from: 'DRAFT', to: 'NEW', actor: a,
      metadata: { channel: input.channel, review_reasons: reviewReasons, area: area.areaName },
    });
    if (reviewReasons.length) {
      await insertEvent(tx, r.id, { type: 'flag_set', label: 'Flagged for human review', actor: SYSTEM, notes: reviewReasons.join('; '), customerVisible: false, metadata: { flag: 'HUMAN_REVIEW' } });
    }
    await audit(ctx, 'request.create', 'service_request', r.id, `Created ${requestNumber} via ${input.channel}`, null, { request_number: requestNumber }, tx);
    return { request: r, event: ev, reviewReasons, customer: cust, patient };
  });

  const r = result.request;
  // Operations alert (FRD §12) – urgent requests are visually distinguished
  const urgent = isUrgent(r.urgency);
  const sev = result.reviewReasons.length ? 'CRITICAL' : urgent ? 'URGENT' : 'INFO';
  await alertOps(
    r.id, 'new_request', `NEW REQUEST ${r.request_number}${urgent ? ' · URGENT' : ''}`,
    `${serviceTypeLabel(r.service_type)} for ${result.patient.relationship || 'loved one'}${result.patient.age ? ` (${result.patient.age})` : ''} · ${input.pickup.address || 'pinned location'}` +
      (result.reviewReasons.length ? ` · ⚠ ${result.reviewReasons.join('; ')}` : ''),
    sev as any,
  );
  await notifyCustomer(r.id, 'request_received', 'request_created', {}, result.event.id);
  if (input.mobility === 'BEDRIDDEN') await notifyCustomer(r.id, 'human_review', 'human_review');
  if (r.out_of_area) await notifyCustomer(r.id, 'out_of_area', 'out_of_area');
  return { request: r, duplicate: false, reviewReasons: result.reviewReasons };
}

// ------------------------------------------------------------------ Ops status actions
const OPS_TEMPLATES: Record<string, string> = {
  SEARCHING_COMPANION: 'request_confirmed',
};

export async function opsTransition(ctx: Ctx, requestId: string, to: string, notes?: string | null, extra: { reason?: string } = {}) {
  const a = actor(ctx);
  let ev: any;
  const r = await sql.begin(async (tx: any) => {
    const r = await lockRequest(tx, requestId);
    const patch: Record<string, any> = {};
    if (to === 'SEARCHING_COMPANION' && !r.confirmed_at) patch.confirmed_at = new Date();
    if (to === 'CANCELLED' || to === 'UNFULFILLED') {
      if (!extra.reason) throw bad('A cancellation reason is required');
      patch.cancellation_reason = extra.reason;
      patch.cancelled_by = a.name;
      patch.sla_risk = false;
    }
    if (to === 'SEARCHING_COMPANION' && ['COMPANION_ASSIGNED', 'COMPANION_ACCEPTED'].includes(r.current_status)) {
      patch.assigned_companion_id = null;
      patch.estimated_arrival = null;
      const asg = await tx`UPDATE assignments SET status = 'CANCELLED', cancelled_at = now()
                           WHERE request_id = ${r.id} AND status IN ('OFFERED','ACCEPTED') RETURNING companion_id`;
      for (const x of asg) await tx`UPDATE companions SET availability = 'AVAILABLE' WHERE id = ${x.companion_id} AND availability = 'BUSY'`;
    }
    if (TERMINAL.includes(to)) {
      const asg = await tx`UPDATE assignments SET status = 'CANCELLED', cancelled_at = now()
                           WHERE request_id = ${r.id} AND status IN ('OFFERED','ACCEPTED') RETURNING companion_id`;
      for (const x of asg) await tx`UPDATE companions SET availability = 'AVAILABLE' WHERE id = ${x.companion_id} AND availability = 'BUSY'`;
    }
    ev = await transitionTx(tx, r, to, a, {
      type: to === 'CANCELLED' ? 'cancelled' : to === 'SEARCHING_COMPANION' && !r.confirmed_at ? 'confirmed' : 'status_changed',
      label: to === 'CANCELLED' ? 'Request cancelled' : to === 'AWAITING_CONFIRMATION' ? 'Operations reviewing' : to === 'SEARCHING_COMPANION' ? 'Operations confirmed – finding companion' : undefined,
      notes: [extra.reason, notes].filter(Boolean).join(' – ') || null,
      patch,
    });
    await audit(ctx, 'request.transition', 'service_request', r.id, `${r.request_number}: → ${to}`, null, { to, reason: extra.reason }, tx);
    return r;
  });
  if (to === 'CANCELLED') await notifyCustomer(r.id, 'request_cancelled', 'cancelled', { reason: extra.reason || '' }, ev.id);
  else if (OPS_TEMPLATES[to] && ev.event_type === 'confirmed') await notifyCustomer(r.id, OPS_TEMPLATES[to], 'confirmed', {}, ev.id);
  if (to === 'UNFULFILLED') await notifyCustomer(r.id, 'request_cancelled', 'unfulfilled', { reason: extra.reason || '' }, ev.id);
  return r;
}

// ------------------------------------------------------------------ Service events (FRD §16, §17)
export async function recordServiceEvent(
  ctx: Ctx,
  requestId: string,
  type: string,
  opts: { notes?: string | null; lat?: number | null; lng?: number | null; verification?: { method: string; code?: string } } = {},
) {
  const def = SERVICE_EVENTS.find((e) => e.type === type);
  if (!def) throw bad('Unknown event type');
  const a = actor(ctx);
  let ev: any;
  const r = await sql.begin(async (tx: any) => {
    const r = await lockRequest(tx, requestId);
    if (ctx.companion && r.assigned_companion_id !== ctx.companion.id) throw notFound('Job not found');
    if (def.requires && !def.requires.includes(r.current_status)) {
      throw conflict(`"${def.label}" is not allowed while the request is ${STATUS_LABEL[r.current_status]}`);
    }
    // Duplicate protection for flaky networks (FRD §46)
    const dup = await tx`SELECT id FROM status_events WHERE request_id = ${r.id} AND event_type = ${type} AND created_at > now() - interval '2 minutes'`;
    if (dup[0] && !['tests', 'pharmacy', 'consultation_underway'].includes(type)) {
      ev = null;
      return r;
    }
    const patch: Record<string, any> = {};
    const metadata: any = {};
    if (opts.lat != null && opts.lng != null) metadata.location = { lat: opts.lat, lng: opts.lng };
    if (type === 'reached_parent') patch.actual_arrival = new Date();
    if (type === 'patient_verified') {
      const method = opts.verification?.method || 'booking_code';
      let result = 'VERIFIED';
      if (method === 'booking_code') {
        if (String(opts.verification?.code || '').trim() !== r.booking_code) throw bad('Booking code does not match. Ask the family for the 4-digit code or call Operations.');
      }
      patch.verified_at = new Date();
      patch.verification_method = method;
      patch.verification_result = result;
      metadata.verification = { method, result };
    }
    if (type === 'service_started') {
      if (r.service_start_time) throw conflict('Service already started');
      patch.service_start_time = new Date();
    }
    if (def.toStatus) {
      ev = await transitionTx(tx, r, def.toStatus, a, { type, label: def.label, notes: opts.notes, metadata, patch, customerVisible: def.customer });
    } else {
      if (Object.keys(patch).length) await tx`UPDATE service_requests SET ${tx({ ...patch, updated_at: new Date() })} WHERE id = ${r.id}`;
      ev = await insertEvent(tx, r.id, { type, label: def.label, actor: a, notes: opts.notes, metadata, customerVisible: def.customer });
    }
    return r;
  });
  if (ev && def.template) {
    await notifyCustomer(r.id, def.template, type, { update_label: def.label, notes_line: opts.notes && def.template === 'status_update' ? `\n${opts.notes}` : '' }, ev.id);
  }
  if (type === 'reached_parent') await alertOps(r.id, 'arrived', `${r.request_number}: companion arrived`, `${a.name} reached the patient`, 'INFO');
  return { request: r, event: ev, duplicate: !ev };
}

// ------------------------------------------------------------------ Completion (FRD §21, §22)
export async function completeService(ctx: Ctx, requestId: string, completionType: string, notes?: string | null) {
  const types = (await getSetting('lists')).completion_types as string[];
  if (!types.includes(completionType)) throw bad('Select a completion outcome');
  if (completionType === 'Other' && !notes) throw bad('Please add a note describing the outcome');
  const a = actor(ctx);
  let ev: any;
  const r = await sql.begin(async (tx: any) => {
    const r = await lockRequest(tx, requestId);
    if (ctx.companion && r.assigned_companion_id !== ctx.companion.id) throw notFound('Job not found');
    if (r.current_status === 'COMPLETED') return r;
    assertTransition(r.current_status, 'COMPLETED');
    const end = new Date();
    const start = r.service_start_time ? new Date(r.service_start_time) : r.actual_arrival ? new Date(r.actual_arrival) : end;
    const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
    const rule = r.pricing_rule_id
      ? (await tx`SELECT * FROM pricing_rules WHERE id = ${r.pricing_rule_id}`)[0]
      : await findPricingRule(r.service_type, r.service_area_id, tx);
    const exp = (await tx`SELECT COALESCE(sum(amount),0) AS s FROM expenses WHERE request_id = ${r.id} AND bill_to_customer AND approval_status <> 'REJECTED'`)[0].s;
    const charge = rule ? computeCharge(rule, duration, r.urgency, Number(exp)) : null;
    ev = await transitionTx(tx, r, 'COMPLETED', a, {
      type: 'service_completed', label: 'Service completed', notes: [completionType, notes].filter(Boolean).join(' – '),
      patch: {
        service_end_time: end, service_duration_minutes: duration, completion_type: completionType, completion_notes: notes ?? null,
        final_amount: charge?.total ?? r.quoted_amount, charge_breakdown: charge ? tx.json(charge) : null, payment_status: 'PENDING', sla_risk: false,
        pricing_rule_id: rule?.id ?? r.pricing_rule_id,
      },
    });
    await tx`UPDATE assignments SET status = 'COMPLETED', completed_at = now() WHERE request_id = ${r.id} AND status = 'ACCEPTED'`;
    if (r.assigned_companion_id) await tx`UPDATE companions SET availability = 'AVAILABLE' WHERE id = ${r.assigned_companion_id} AND availability = 'BUSY'`;
    await audit(ctx, 'request.complete', 'service_request', r.id, `${r.request_number} completed (${completionType}), ${duration} min, ₹${charge?.total}`, null, charge, tx);
    return r;
  });
  if (ev) {
    await createPaymentForRequest(r.id, a.name);
    await notifyCustomer(r.id, 'service_completed', 'service_completed', {}, ev.id);
    await alertOps(r.id, 'completed', `${r.request_number} completed`, `Outcome: ${completionType}`, 'INFO');
  }
  return r;
}

// ------------------------------------------------------------------ Flags & escalations (FRD §7)
export async function setFlag(ctx: Ctx, requestId: string, flag: 'emergency_review' | 'human_review_required' | 'sla_risk', value: boolean, reason?: string | null) {
  const a = actor(ctx);
  await sql.begin(async (tx: any) => {
    const r = await lockRequest(tx, requestId);
    await tx`UPDATE service_requests SET ${tx({ [flag]: value, updated_at: new Date() })} WHERE id = ${r.id}`;
    await insertEvent(tx, r.id, {
      type: value ? 'flag_set' : 'flag_cleared', label: `${value ? 'Flag set' : 'Flag cleared'}: ${flag.replace(/_/g, ' ').toUpperCase()}`,
      actor: a, notes: reason ?? null, customerVisible: false, metadata: { flag, value },
    });
    await audit(ctx, value ? 'flag.set' : 'flag.clear', 'service_request', r.id, `${r.request_number}: ${flag}=${value}`, null, { reason }, tx);
  });
}

export async function createEscalation(ctx: Ctx, requestId: string, input: { reason: string; action_taken?: string | null; notes?: string | null }) {
  const a = actor(ctx);
  const esc = await sql.begin(async (tx: any) => {
    const r = await lockRequest(tx, requestId);
    const e = (await tx`
      INSERT INTO escalations (request_id, reason, action_taken, notes, agent_id, agent_name)
      VALUES (${r.id}, ${input.reason}, ${input.action_taken ?? null}, ${input.notes ?? null}, ${a.id}, ${a.name}) RETURNING *`)[0];
    await tx`UPDATE service_requests SET emergency_review = true, updated_at = now() WHERE id = ${r.id}`;
    await insertEvent(tx, r.id, {
      type: 'escalation_raised', label: 'Medical/Emergency escalation raised', actor: a, customerVisible: false,
      notes: `${input.reason}${input.action_taken ? ` · Action: ${input.action_taken}` : ''}`, metadata: { escalation_id: e.id },
    });
    await audit(ctx, 'escalation.create', 'escalation', e.id, `Escalation on ${r.request_number}: ${input.reason}`, null, e, tx);
    return { e, r };
  });
  await alertOps(requestId, 'escalation', `🚨 EMERGENCY ESCALATION ${esc.r.request_number}`, `${input.reason} — raised by ${a.name}`, 'CRITICAL');
  return esc.e;
}

export async function resolveEscalation(ctx: Ctx, escalationId: string, resolution: string, clearFlag: boolean) {
  const a = actor(ctx);
  await sql.begin(async (tx: any) => {
    const e = (await tx`UPDATE escalations SET status = 'RESOLVED', resolution = ${resolution}, resolved_by = ${a.name}, resolved_at = now()
                        WHERE id = ${escalationId} AND status = 'OPEN' RETURNING *`)[0];
    if (!e) throw notFound('Open escalation not found');
    const open = await tx`SELECT count(*)::int AS n FROM escalations WHERE request_id = ${e.request_id} AND status = 'OPEN'`;
    if (clearFlag && open[0].n === 0) await tx`UPDATE service_requests SET emergency_review = false WHERE id = ${e.request_id}`;
    await insertEvent(tx, e.request_id, { type: 'escalation_resolved', label: 'Escalation resolved', actor: a, notes: resolution, customerVisible: false });
    await audit(ctx, 'escalation.resolve', 'escalation', e.id, `Resolved: ${resolution}`, null, null, tx);
  });
}

export { notifyCompanion };
