// Manual dispatch (FRD §14). V1 never auto-assigns – ops selects a companion.
import { sql } from './db';
import { Ctx, bad, conflict, notFound } from './http';
import { audit } from './auth';
import { actor, lockRequest, transitionTx, insertEvent } from './lifecycle';
import { alertOps, notifyCustomer, notifyCompanion } from './notifications';
import { haversineKm, etaMinutes, GAZETTEER } from './geo';
import { getSetting } from './settings';

export async function companionStats() {
  return sql`
    SELECT c.id,
      (SELECT count(*)::int FROM assignments a WHERE a.companion_id = c.id AND a.status = 'COMPLETED') AS jobs_completed,
      (SELECT round(avg(overall)::numeric, 2) FROM ratings rt WHERE rt.companion_id = c.id) AS rating,
      (SELECT count(*)::int FROM ratings rt WHERE rt.companion_id = c.id) AS rating_count,
      (SELECT count(*)::int FROM assignments a WHERE a.companion_id = c.id) AS offers,
      (SELECT count(*)::int FROM assignments a WHERE a.companion_id = c.id AND a.status IN ('ACCEPTED','COMPLETED')) AS accepted,
      (SELECT count(*)::int FROM assignments a WHERE a.companion_id = c.id AND a.status = 'CANCELLED') AS cancelled,
      (SELECT round(avg(extract(epoch FROM (a.responded_at - a.offered_at)))::numeric, 0) FROM assignments a WHERE a.companion_id = c.id AND a.responded_at IS NOT NULL) AS avg_response_sec,
      (SELECT count(*)::int FROM incidents i WHERE i.companion_id = c.id) AS incidents
    FROM companions c`;
}

export async function verificationComplete(c: any) {
  const req = (await getSetting('verification')).required as string[];
  return req.every((k) => c[k] === true);
}

export async function eligibleCompanions(requestId: string) {
  const r = (await sql`SELECT r.*, l.lat, l.lng FROM service_requests r LEFT JOIN locations l ON l.id = r.pickup_location_id WHERE r.id = ${requestId}`)[0];
  if (!r) throw notFound();
  const comps = await sql`
    SELECT c.*, sa.name AS zone_name,
      (SELECT sr.request_number FROM service_requests sr WHERE sr.assigned_companion_id = c.id
         AND sr.current_status IN ('COMPANION_ASSIGNED','COMPANION_ACCEPTED','EN_ROUTE','WITH_PATIENT','AT_HOSPITAL','RETURNING') LIMIT 1) AS active_request
    FROM companions c LEFT JOIN service_areas sa ON sa.id = c.service_area_id
    WHERE NOT c.suspended`;
  const stats = new Map((await companionStats()).map((s: any) => [s.id, s]));
  const required = (await getSetting('verification')).required as string[];
  const lang = (await sql`SELECT language FROM patients WHERE id = ${r.patient_id}`)[0]?.language;
  const list = comps.map((c: any) => {
    const home = GAZETTEER.find((g) => g.name === c.home_area);
    const cLat = c.current_lat ?? home?.lat ?? null;
    const cLng = c.current_lng ?? home?.lng ?? null;
    const distance = r.lat != null && cLat != null ? Math.round(haversineKm(cLat, cLng, r.lat, r.lng) * 10) / 10 : null;
    const s: any = stats.get(c.id) || {};
    const missing = required.filter((k) => !c[k]);
    return {
      id: c.id, code: c.code, name: c.name, photo_url: c.photo_url, availability: c.availability, active: c.active,
      zone: c.zone_name, same_zone: !!r.service_area_id && c.service_area_id === r.service_area_id,
      languages: c.languages, speaks_patient_language: lang ? (c.languages as string[]).includes(lang) : null,
      skills: c.skills, distance_km: distance, eta_minutes: distance != null ? etaMinutes(distance) : null,
      training_complete: c.hospital_navigation_training && c.escalation_training,
      verification_missing: missing, eligible: c.active && missing.length === 0 && !c.active_request,
      active_request: c.active_request, rating: s.rating, jobs_completed: s.jobs_completed ?? 0,
      acceptance_rate: s.offers ? Math.round((s.accepted / s.offers) * 100) : null, gender: c.gender,
      last_seen_at: c.last_seen_at,
    };
  });
  const order = (x: any) => (x.eligible ? 0 : 1) * 1000 + (x.availability === 'AVAILABLE' ? 0 : 500) + (x.distance_km ?? 400);
  return list.sort((a: any, b: any) => order(a) - order(b));
}

export async function assignCompanion(ctx: Ctx, requestId: string, companionId: string, note?: string | null) {
  const a = actor(ctx);
  const sla = await getSetting('sla');
  const res = await sql.begin(async (tx: any) => {
    const r = await lockRequest(tx, requestId);
    const c = (await tx`SELECT * FROM companions WHERE id = ${companionId} FOR UPDATE`)[0];
    if (!c) throw notFound('Companion not found');
    if (c.suspended) throw bad('Companion is suspended');
    if (!c.active || !(await verificationComplete(c))) throw bad(`${c.name} is not operationally active – verification/onboarding incomplete`);
    const busy = await tx`SELECT request_number FROM service_requests WHERE assigned_companion_id = ${c.id}
      AND current_status IN ('COMPANION_ASSIGNED','COMPANION_ACCEPTED','EN_ROUTE','WITH_PATIENT','AT_HOSPITAL','RETURNING') AND id <> ${r.id}`;
    if (busy[0]) throw conflict(`${c.name} is already on ${busy[0].request_number}`);

    // Ops can confirm + assign in one step from NEW / AWAITING_CONFIRMATION
    if (r.current_status === 'NEW') await transitionTx(tx, r, 'AWAITING_CONFIRMATION', a, { label: 'Operations reviewing' });
    if (r.current_status === 'AWAITING_CONFIRMATION') {
      await transitionTx(tx, r, 'SEARCHING_COMPANION', a, { type: 'confirmed', label: 'Operations confirmed – finding companion', patch: { confirmed_at: new Date() } });
    }
    const pickup = (await tx`SELECT lat, lng FROM locations WHERE id = ${r.pickup_location_id}`)[0];
    const home = GAZETTEER.find((g) => g.name === c.home_area);
    const cLat = c.current_lat ?? home?.lat;
    const cLng = c.current_lng ?? home?.lng;
    const dist = pickup?.lat != null && cLat != null ? haversineKm(cLat, cLng, pickup.lat, pickup.lng) : null;
    const eta = dist != null ? etaMinutes(dist) : 45;
    const asg = (await tx`
      INSERT INTO assignments (request_id, companion_id, status, offered_by, offered_by_name, expires_at, eta_minutes, distance_km)
      VALUES (${r.id}, ${c.id}, 'OFFERED', ${a.id}, ${a.name}, now() + make_interval(mins => ${sla.offer_expiry_minutes}), ${eta}, ${dist})
      RETURNING *`)[0];
    const ev = await transitionTx(tx, r, 'COMPANION_ASSIGNED', a, {
      label: `Companion offered: ${c.name}`, notes: note ?? null, customerVisible: false,
      metadata: { assignment_id: asg.id, companion_id: c.id, eta_minutes: eta },
      patch: { assigned_companion_id: c.id, assigned_at: new Date() },
    });
    await audit(ctx, 'companion.assign', 'service_request', r.id, `${r.request_number} offered to ${c.name} (${c.code})`, null, { assignment_id: asg.id }, tx);
    return { r, c, asg, ev };
  });
  await notifyCompanion(res.c.id, res.r.id, 'job_offer', 'New Job', `${res.r.request_number} – please accept within ${sla.offer_expiry_minutes} min`);
  return res.asg;
}

export async function respondToOffer(ctx: Ctx, assignmentId: string, accept: boolean, reason?: string | null) {
  const cmp = ctx.companion!;
  let ev: any;
  const out = await sql.begin(async (tx: any) => {
    const asg = (await tx`SELECT * FROM assignments WHERE id = ${assignmentId} FOR UPDATE`)[0];
    if (!asg || asg.companion_id !== cmp.id) throw notFound('Offer not found');
    if (asg.status !== 'OFFERED') {
      if ((accept && asg.status === 'ACCEPTED') || (!accept && asg.status === 'DECLINED')) return { asg, r: null, idempotent: true };
      throw conflict(asg.status === 'EXPIRED' ? 'This offer has expired – Operations has been notified.' : `Offer is ${asg.status.toLowerCase()}`);
    }
    if (new Date(asg.expires_at) < new Date()) throw conflict('This offer has expired – please contact Operations.');
    const r = await lockRequest(tx, asg.request_id);
    const a = { type: 'companion', id: cmp.id, name: cmp.name };
    if (accept) {
      await tx`UPDATE assignments SET status = 'ACCEPTED', responded_at = now() WHERE id = ${asg.id}`;
      await tx`UPDATE companions SET availability = 'BUSY' WHERE id = ${cmp.id}`;
      const eta = new Date(Date.now() + (asg.eta_minutes ?? 45) * 60000);
      const scheduled = r.requested_datetime && new Date(r.requested_datetime) > eta ? new Date(r.requested_datetime) : eta;
      ev = await transitionTx(tx, r, 'COMPANION_ACCEPTED', a, {
        type: 'companion_accepted', label: `Companion assigned: ${cmp.name}`,
        patch: { accepted_at: new Date(), estimated_arrival: scheduled }, metadata: { assignment_id: asg.id },
      });
    } else {
      await tx`UPDATE assignments SET status = 'DECLINED', responded_at = now(), decline_reason = ${reason ?? null} WHERE id = ${asg.id}`;
      ev = await transitionTx(tx, r, 'SEARCHING_COMPANION', a, {
        type: 'companion_declined', label: `${cmp.name} declined`, notes: reason ?? null, customerVisible: false,
        patch: { assigned_companion_id: null },
      });
    }
    await audit(ctx, accept ? 'assignment.accept' : 'assignment.decline', 'assignment', asg.id, `${r.request_number}: ${cmp.name} ${accept ? 'accepted' : 'declined'}`, null, { reason }, tx);
    return { asg, r, idempotent: false };
  });
  if (!out.idempotent && out.r) {
    if (accept) {
      await notifyCustomer(out.r.id, 'companion_assigned', 'companion_assigned', {}, ev.id);
      await alertOps(out.r.id, 'accepted', `${out.r.request_number}: ${cmp.name} accepted`, 'Companion confirmed', 'INFO');
    } else {
      await alertOps(out.r.id, 'declined', `${out.r.request_number}: ${cmp.name} declined`, `Reason: ${reason || 'not given'} – please offer to another companion`, 'URGENT');
    }
  }
  return out;
}

/** Expire stale offers and alert operations (FRD §14 FR-DSP-003). */
export async function expireOffers() {
  const expired = await sql`
    SELECT a.*, r.request_number, c.name AS companion_name FROM assignments a
    JOIN service_requests r ON r.id = a.request_id JOIN companions c ON c.id = a.companion_id
    WHERE a.status = 'OFFERED' AND a.expires_at < now()`;
  for (const a of expired) {
    await sql.begin(async (tx: any) => {
      const upd = await tx`UPDATE assignments SET status = 'EXPIRED', responded_at = NULL WHERE id = ${a.id} AND status = 'OFFERED' RETURNING id`;
      if (!upd[0]) return;
      const r = await lockRequest(tx, a.request_id);
      if (r.current_status === 'COMPANION_ASSIGNED' && r.assigned_companion_id === a.companion_id) {
        await transitionTx(tx, r, 'SEARCHING_COMPANION', { type: 'system', id: null, name: 'System' }, {
          type: 'offer_expired', label: `Offer to ${a.companion_name} expired`, customerVisible: false, patch: { assigned_companion_id: null },
        });
      } else {
        await insertEvent(tx, r.id, { type: 'offer_expired', label: `Offer to ${a.companion_name} expired`, actor: { type: 'system', id: null, name: 'System' }, customerVisible: false });
      }
    });
    await alertOps(a.request_id, 'offer_expired', `${a.request_number}: no response from ${a.companion_name}`, 'Offer expired – please offer to another companion', 'URGENT');
  }
  return expired.length;
}

export async function setAvailability(companionId: string, availability: 'AVAILABLE' | 'OFFLINE', lat?: number | null, lng?: number | null) {
  const c = (await sql`SELECT * FROM companions WHERE id = ${companionId}`)[0];
  if (!c) throw notFound();
  const active = await sql`SELECT 1 FROM service_requests WHERE assigned_companion_id = ${companionId}
    AND current_status IN ('COMPANION_ACCEPTED','EN_ROUTE','WITH_PATIENT','AT_HOSPITAL','RETURNING') LIMIT 1`;
  if (active[0] && availability === 'OFFLINE') throw conflict('You cannot go offline during an active job. Contact Operations if you need help.');
  const next = active[0] ? 'BUSY' : availability;
  await sql`UPDATE companions SET availability = ${next},
            current_lat = COALESCE(${lat ?? null}, current_lat), current_lng = COALESCE(${lng ?? null}, current_lng),
            last_seen_at = now(), updated_at = now() WHERE id = ${companionId}`;
  return next;
}

export { notifyCustomer };
