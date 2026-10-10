import { sql } from '../db';
import { Router, Ctx, bad, notFound, conflict, str, num, normalizePhone, rateLimit, HttpError } from '../http';
import { requireUser, can, audit, verifyPassword, createSession, destroySession, actorOf } from '../auth';
import { opsTransition, recordServiceEvent, completeService, setFlag, createEscalation, resolveEscalation, insertEvent, lockRequest, actor } from '../lifecycle';
import { eligibleCompanions, assignCompanion, companionStats } from '../dispatch';
import { createPaymentForRequest, markPaidManually, refundPayment } from '../payments';
import { notifyCustomer, retryNotification, alertOps } from '../notifications';
import { getSetting } from '../settings';
import { maybeTick, slaRisk } from '../sla';
import { geocode, mapsLink, checkServiceArea } from '../geo';
import { findPricingRule, computeCharge } from '../pricing';
import { createExpense, createIncident } from './shared';
import { TRANSITIONS, SERVICE_EVENTS, BOARD_COLUMNS, isUrgent } from '../../shared/constants';

export const listBase = () => sql`
  SELECT r.id, r.request_number, r.current_status, r.service_type, r.urgency, r.requested_datetime, r.created_at, r.updated_at,
         r.mobility_status, r.human_review_required, r.emergency_review, r.out_of_area, r.sla_risk, r.sla_risk_reason, r.incident_flag,
         r.payment_status, r.channel, r.estimated_arrival, r.actual_arrival, r.final_amount, r.quoted_amount, r.assigned_companion_id,
         c.name AS customer_name, c.phone AS customer_phone, p.relationship, p.name AS patient_name, p.age AS patient_age,
         pl.address AS pickup_address, dl.place_name AS destination_name, dl.address AS destination_address,
         cmp.name AS companion_name, cmp.code AS companion_code, sa.name AS zone
  FROM service_requests r
  JOIN customers c ON c.id = r.customer_id
  LEFT JOIN patients p ON p.id = r.patient_id
  LEFT JOIN locations pl ON pl.id = r.pickup_location_id
  LEFT JOIN locations dl ON dl.id = r.destination_location_id
  LEFT JOIN companions cmp ON cmp.id = r.assigned_companion_id
  LEFT JOIN service_areas sa ON sa.id = r.service_area_id`;

export async function requestDetail(id: string, ctx: Ctx) {
  const r = (await sql`
    SELECT r.*, sa.name AS zone,
      row_to_json(c.*) AS customer, row_to_json(p.*) AS patient, row_to_json(pl.*) AS pickup, row_to_json(dl.*) AS destination,
      CASE WHEN cmp.id IS NULL THEN NULL ELSE json_build_object('id', cmp.id, 'code', cmp.code, 'name', cmp.name, 'phone', cmp.phone,
        'languages', cmp.languages, 'availability', cmp.availability, 'photo_url', cmp.photo_url) END AS companion,
      row_to_json(pr.*) AS pricing_rule
    FROM service_requests r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN patients p ON p.id = r.patient_id
    LEFT JOIN locations pl ON pl.id = r.pickup_location_id
    LEFT JOIN locations dl ON dl.id = r.destination_location_id
    LEFT JOIN companions cmp ON cmp.id = r.assigned_companion_id
    LEFT JOIN service_areas sa ON sa.id = r.service_area_id
    LEFT JOIN pricing_rules pr ON pr.id = r.pricing_rule_id
    WHERE r.id = ${id} OR r.request_number = ${id}`)[0];
  if (!r) throw notFound('Request not found');
  const [events, assignments, payments, expenses, incidents, escalations, notifications, rating, trust, prior] = await Promise.all([
    sql`SELECT * FROM status_events WHERE request_id = ${r.id} ORDER BY created_at, id`,
    sql`SELECT a.*, c.name AS companion_name, c.code AS companion_code FROM assignments a JOIN companions c ON c.id = a.companion_id WHERE request_id = ${r.id} ORDER BY offered_at`,
    can(ctx, 'payment.view') ? sql`SELECT p.*, (SELECT json_agg(rf.* ORDER BY rf.created_at) FROM refunds rf WHERE rf.payment_id = p.id) AS refunds FROM payments p WHERE request_id = ${r.id} ORDER BY created_at` : [],
    sql`SELECT id, category, amount, description, receipt_file_id, bill_to_customer, submitted_by_type, submitted_by_name, approval_status, reviewed_by, reviewed_at, review_note, created_at FROM expenses WHERE request_id = ${r.id} ORDER BY created_at`,
    sql`SELECT * FROM incidents WHERE request_id = ${r.id} ORDER BY created_at`,
    sql`SELECT * FROM escalations WHERE request_id = ${r.id} ORDER BY created_at`,
    sql`SELECT id, event, recipient_type, channel, template, title, body, status, error, attempts, created_at FROM notifications WHERE request_id = ${r.id} AND recipient_type <> 'ops' ORDER BY created_at`,
    sql`SELECT * FROM ratings WHERE request_id = ${r.id}`,
    sql`SELECT * FROM trust_responses WHERE request_id = ${r.id}`,
    sql`SELECT request_number, current_status, created_at FROM service_requests WHERE customer_id = ${r.customer_id} AND id <> ${r.id} ORDER BY created_at DESC LIMIT 5`,
  ]);
  const sla = await getSetting('sla');
  const m = (a: any, b: any) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
  const accepted = assignments.find((a: any) => a.status === 'ACCEPTED' || a.status === 'COMPLETED');
  const metrics = {
    request_to_assignment: m(r.created_at, r.assigned_at),
    assignment_to_acceptance: m(r.assigned_at, r.accepted_at),
    acceptance_to_arrival: m(r.accepted_at, r.actual_arrival),
    request_to_arrival: m(r.created_at, r.actual_arrival),
    targets: sla,
    risk: slaRisk(r, sla),
  };
  if (!can(ctx, 'customer.view')) { r.customer.phone = r.customer.phone.slice(0, 5) + '•••••' + r.customer.phone.slice(-2); }
  delete r.tracking_token_hidden;
  const allowed = TRANSITIONS[r.current_status] || [];
  const allowedEvents = SERVICE_EVENTS.filter((e) => !e.requires || e.requires.includes(r.current_status)).map((e) => e.type);
  const openOffer = assignments.find((a: any) => a.status === 'OFFERED');
  return {
    ...r, events, assignments, payments, expenses, incidents, escalations, notifications, rating: rating[0] ?? null, trust: trust[0] ?? null,
    prior_requests: prior, metrics, allowed_transitions: allowed, allowed_events: allowedEvents, open_offer: openOffer ?? null,
    accepted_assignment: accepted ?? null, track_url: `/track/${r.request_number}?t=${r.tracking_token}`,
    pickup_nav: r.pickup ? mapsLink(r.pickup.lat, r.pickup.lng, r.pickup.address) : null,
    destination_nav: r.destination ? mapsLink(r.destination.lat, r.destination.lng, r.destination.place_name || r.destination.address) : null,
  };
}

// Staff logins moved from the old @medicalchampion.in addresses to @champoncall.com (Oct 2026).
const OLD_STAFF_DOMAIN = '@medicalchampion.in';
const NEW_STAFF_DOMAIN = '@champoncall.com';
let staffEmailsMoved: Promise<void> | null = null;
function moveStaffEmails() {
  if (!staffEmailsMoved) {
    staffEmailsMoved = (async () => {
      await sql`UPDATE users u SET email = replace(lower(u.email), ${OLD_STAFF_DOMAIN}, ${NEW_STAFF_DOMAIN})
                WHERE lower(u.email) LIKE ${'%' + OLD_STAFF_DOMAIN}
                  AND NOT EXISTS (SELECT 1 FROM users x WHERE lower(x.email) = replace(lower(u.email), ${OLD_STAFF_DOMAIN}, ${NEW_STAFF_DOMAIN}))`;
    })().catch((e) => {
      staffEmailsMoved = null;
      console.error('[auth] could not move staff emails', e?.message);
    });
  }
  return staffEmailsMoved;
}

export function registerOps(r: Router) {
  // ---------------- auth
  r.post('/api/v1/auth/login', async (ctx) => {
    await rateLimit(`login:${ctx.ip}`, 20, 900);
    await moveStaffEmails();
    let email = String(ctx.body.email || '').trim().toLowerCase();
    // Old addresses keep working: admin@medicalchampion.in signs in as admin@champoncall.com
    if (email.endsWith(OLD_STAFF_DOMAIN)) email = email.slice(0, -OLD_STAFF_DOMAIN.length) + NEW_STAFF_DOMAIN;
    const u = (await sql`SELECT * FROM users WHERE lower(email) = ${email}`)[0];
    if (u?.locked_until && new Date(u.locked_until) > new Date()) throw new HttpError(423, 'Account temporarily locked after failed attempts. Try again in 15 minutes.');
    if (!u || !u.active || !verifyPassword(String(ctx.body.password || ''), u.password_hash)) {
      if (u) await sql`UPDATE users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END WHERE id = ${u.id}`;
      throw new HttpError(401, 'Incorrect email or password');
    }
    await sql`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = ${u.id}`;
    await createSession(ctx, 'user', u.id);
    ctx.user = { id: u.id, name: u.name, email: u.email, role_id: u.role_id, role_name: '', permissions: [] };
    await audit(ctx, 'auth.login', 'user', u.id, `${u.email} signed in`);
    return { ok: true };
  });
  r.post('/api/v1/auth/logout', async (ctx) => {
    if (ctx.user) await audit(ctx, 'auth.logout', 'user', ctx.user.id, `${ctx.user.email} signed out`);
    await destroySession(ctx, 'user');
    return { ok: true };
  });
  r.get('/api/v1/auth/me', async (ctx) => {
    const u = requireUser(ctx);
    return { user: u };
  });

  // ---------------- board & lists (FRD §13)
  r.get('/api/v1/board', async (ctx) => {
    requireUser(ctx, 'request.view');
    await maybeTick();
    const showDays = Number(ctx.query.get('closed_days') || 1);
    const rows = await sql`${listBase()} 
      WHERE r.current_status NOT IN ('COMPLETED','CANCELLED','UNFULFILLED')
         OR r.updated_at > now() - make_interval(days => ${showDays})
      ORDER BY (r.urgency IN ('ASAP','WITHIN_2_HOURS')) DESC, r.created_at DESC`;
    const alerts = await sql`SELECT count(*)::int AS n FROM notifications WHERE channel = 'INTERNAL' AND recipient_type = 'ops' AND acknowledged_at IS NULL`;
    const companions = await sql`SELECT availability, count(*)::int AS n FROM companions WHERE active AND NOT suspended GROUP BY availability`;
    return { requests: rows, columns: BOARD_COLUMNS, unacked_alerts: alerts[0].n, companions, server_time: new Date().toISOString() };
  });

  r.get('/api/v1/requests', async (ctx) => {
    requireUser(ctx, 'request.view');
    const q = ctx.query;
    const f = {
      status: q.get('status'), urgency: q.get('urgency'), from: q.get('from'), to: q.get('to'), zone: q.get('zone'),
      companion: q.get('companion'), type: q.get('service_type'), incident: q.get('incident'), payment: q.get('payment_status'),
      search: q.get('q'), flag: q.get('flag'), customer: q.get('customer_id'),
    };
    const limit = Math.min(Number(q.get('limit') || 200), 500);
    const rows = await sql`${listBase()} 
      WHERE true
      ${f.status ? sql`AND r.current_status = ANY(${f.status.split(',')})` : sql``}
      ${f.urgency === 'urgent' ? sql`AND r.urgency IN ('ASAP','WITHIN_2_HOURS')` : f.urgency === 'scheduled' ? sql`AND r.urgency IN ('LATER_TODAY','SCHEDULED')` : f.urgency ? sql`AND r.urgency = ${f.urgency}` : sql``}
      ${f.from ? sql`AND r.created_at >= ${f.from}::date` : sql``}
      ${f.to ? sql`AND r.created_at < ${f.to}::date + 1` : sql``}
      ${f.zone ? sql`AND sa.name = ${f.zone}` : sql``}
      ${f.zone === 'none' ? sql`AND r.service_area_id IS NULL` : sql``}
      ${f.companion ? sql`AND r.assigned_companion_id = ${f.companion}` : sql``}
      ${f.type ? sql`AND r.service_type = ${f.type}` : sql``}
      ${f.incident === '1' ? sql`AND r.incident_flag` : sql``}
      ${f.payment ? sql`AND r.payment_status = ${f.payment}` : sql``}
      ${f.customer ? sql`AND r.customer_id = ${f.customer}` : sql``}
      ${f.flag === 'emergency' ? sql`AND r.emergency_review` : f.flag === 'review' ? sql`AND r.human_review_required` : f.flag === 'sla' ? sql`AND r.sla_risk` : f.flag === 'out_of_area' ? sql`AND r.out_of_area` : sql``}
      ${f.search ? sql`AND (r.request_number ILIKE ${'%' + f.search + '%'} OR c.name ILIKE ${'%' + f.search + '%'} OR c.phone ILIKE ${'%' + f.search + '%'} OR p.name ILIKE ${'%' + f.search + '%'})` : sql``}
      ORDER BY r.created_at DESC LIMIT ${limit}`;
    return rows;
  });

  r.get('/api/v1/requests/:id', async (ctx) => {
    requireUser(ctx, 'request.view');
    return requestDetail(ctx.params.id, ctx);
  });
  r.get('/api/v1/requests/:id/timeline', async (ctx) => {
    requireUser(ctx, 'request.view');
    return sql`SELECT * FROM status_events WHERE request_id = ${ctx.params.id} ORDER BY created_at, id`;
  });

  // FR-OPS: modify/complete request information
  r.patch('/api/v1/requests/:id', async (ctx) => {
    requireUser(ctx, 'request.edit');
    const b = ctx.body;
    const a = actor(ctx);
    const before = await requestDetail(ctx.params.id, ctx);
    const changes: string[] = [];
    await sql.begin(async (tx: any) => {
      const r = await lockRequest(tx, before.id);
      if (['COMPLETED', 'CANCELLED', 'UNFULFILLED'].includes(r.current_status) && !can(ctx, 'settings.edit')) throw conflict('Closed requests can only be edited by a manager');
      const patch: any = {};
      for (const k of ['service_type', 'urgency', 'mobility_status', 'special_instructions'] as const) {
        if (b[k] !== undefined && b[k] !== r[k]) { patch[k] = str(b[k], 300); changes.push(k); }
      }
      if (b.requested_datetime !== undefined) { patch.requested_datetime = b.requested_datetime ? new Date(b.requested_datetime) : null; changes.push('requested_datetime'); }
      if (b.estimated_arrival !== undefined) { patch.estimated_arrival = b.estimated_arrival ? new Date(b.estimated_arrival) : null; changes.push('estimated_arrival'); }
      if (b.mobility_status === 'BEDRIDDEN' && !r.human_review_required) { patch.human_review_required = true; patch.human_review_reason = 'Mobility updated to bedridden'; }
      if (b.destination_name !== undefined) {
        const name = str(b.destination_name, 150);
        const g = name ? await geocode(name) : null;
        const loc = (await tx`INSERT INTO locations (place_name, address, lat, lng, source) VALUES (${name}, ${g?.address ?? null}, ${g?.lat ?? null}, ${g?.lng ?? null}, 'ops') RETURNING id`)[0];
        patch.destination_location_id = loc.id;
        patch.destination_undecided = !name;
        changes.push('destination');
      }
      if (b.pickup_address !== undefined && str(b.pickup_address)) {
        const g = await geocode(b.pickup_address);
        const loc = (await tx`INSERT INTO locations (address, lat, lng, source) VALUES (${str(b.pickup_address, 300)}, ${num(b.pickup_lat) ?? g?.lat ?? null}, ${num(b.pickup_lng) ?? g?.lng ?? null}, 'ops') RETURNING *`)[0];
        patch.pickup_location_id = loc.id;
        const area = await checkServiceArea(loc.lat, loc.lng, loc.address);
        patch.out_of_area = area.inArea === false;
        patch.service_area_id = area.areaId;
        changes.push('pickup');
      }
      if (b.service_type && b.service_type !== r.service_type) {
        const rule = await findPricingRule(b.service_type, patch.service_area_id ?? r.service_area_id, tx);
        if (rule) { patch.pricing_rule_id = rule.id; patch.quoted_amount = computeCharge(rule, rule.included_minutes, b.urgency || r.urgency).total; }
      }
      if (Object.keys(patch).length) await tx`UPDATE service_requests SET ${tx({ ...patch, updated_at: new Date() })} WHERE id = ${r.id}`;
      const pp: any = {};
      for (const [k, col] of [['patient_name', 'name'], ['patient_age', 'age'], ['patient_gender', 'gender'], ['patient_language', 'language'], ['relationship', 'relationship']] as const) {
        if (b[k] !== undefined) { pp[col] = k === 'patient_age' ? num(b[k]) : str(b[k], 80); changes.push(k); }
      }
      if (b.patient_phone !== undefined) { pp.phone = normalizePhone(b.patient_phone); changes.push('patient_phone'); }
      if (Object.keys(pp).length && r.patient_id) await tx`UPDATE patients SET ${tx({ ...pp, updated_at: new Date() })} WHERE id = ${r.patient_id}`;
      const cp: any = {};
      if (b.customer_name !== undefined) { cp.name = str(b.customer_name, 80); changes.push('customer_name'); }
      if (b.customer_email !== undefined) { cp.email = str(b.customer_email, 120); changes.push('customer_email'); }
      if (Object.keys(cp).length) await tx`UPDATE customers SET ${tx({ ...cp, updated_at: new Date() })} WHERE id = ${r.customer_id}`;
      if (changes.length) {
        await insertEvent(tx, r.id, { type: 'details_updated', label: 'Request details updated', actor: a, customerVisible: false, notes: changes.join(', ') });
        await audit(ctx, 'request.edit', 'service_request', r.id, `${r.request_number}: updated ${changes.join(', ')}`, pickAudit(before), b, tx);
      }
    });
    return requestDetail(before.id, ctx);
  });

  // Status changes (ops transitions) and predefined service events (FRD §17)
  r.post('/api/v1/requests/:id/status', async (ctx) => {
    const b = ctx.body;
    if (b.event_type) {
      requireUser(ctx, 'request.transition');
      await recordServiceEvent(ctx, ctx.params.id, b.event_type, { notes: str(b.notes, 500), verification: b.verification });
    } else {
      const to = String(b.to || '');
      requireUser(ctx, to === 'CANCELLED' || to === 'UNFULFILLED' ? 'request.cancel' : 'request.transition');
      await opsTransition(ctx, ctx.params.id, to, str(b.notes, 500), { reason: str(b.reason, 200) ?? undefined });
    }
    return requestDetail(ctx.params.id, ctx);
  });
  r.post('/api/v1/requests/:id/complete', async (ctx) => {
    requireUser(ctx, 'request.transition');
    await completeService(ctx, ctx.params.id, String(ctx.body.completion_type || ''), str(ctx.body.notes, 500));
    return requestDetail(ctx.params.id, ctx);
  });
  r.post('/api/v1/requests/:id/notes', async (ctx) => {
    requireUser(ctx, 'request.view');
    const note = str(ctx.body.note, 1000);
    if (!note) throw bad('Note is empty');
    await sql.begin((tx: any) => insertEvent(tx, ctx.params.id, { type: 'note', label: 'Internal note', actor: actor(ctx), notes: note, customerVisible: false }));
    return requestDetail(ctx.params.id, ctx);
  });
  r.post('/api/v1/requests/:id/flags', async (ctx) => {
    requireUser(ctx, 'request.escalate');
    const flag = ctx.body.flag;
    if (!['emergency_review', 'human_review_required', 'sla_risk'].includes(flag)) throw bad('Unknown flag');
    await setFlag(ctx, ctx.params.id, flag, !!ctx.body.value, str(ctx.body.reason, 300));
    return requestDetail(ctx.params.id, ctx);
  });
  r.post('/api/v1/requests/:id/escalations', async (ctx) => {
    requireUser(ctx, 'request.escalate');
    const reason = str(ctx.body.reason, 500);
    if (!reason) throw bad('Reason is required');
    await createEscalation(ctx, ctx.params.id, { reason, action_taken: str(ctx.body.action_taken, 500), notes: str(ctx.body.notes, 1000) });
    return requestDetail(ctx.params.id, ctx);
  });
  r.post('/api/v1/escalations/:id/resolve', async (ctx) => {
    requireUser(ctx, 'request.escalate');
    const res = str(ctx.body.resolution, 1000);
    if (!res) throw bad('Resolution is required');
    await resolveEscalation(ctx, ctx.params.id, res, ctx.body.clear_flag !== false);
    return { ok: true };
  });

  // Dispatch (FRD §14)
  r.get('/api/v1/requests/:id/candidates', async (ctx) => {
    requireUser(ctx, 'companion.assign');
    return eligibleCompanions(ctx.params.id);
  });
  r.post('/api/v1/requests/:id/assign', async (ctx) => {
    requireUser(ctx, 'companion.assign');
    await assignCompanion(ctx, ctx.params.id, String(ctx.body.companion_id || ''), str(ctx.body.note, 300));
    return requestDetail(ctx.params.id, ctx);
  });

  // Customer updates (manual trigger/review)
  r.post('/api/v1/requests/:id/notify', async (ctx) => {
    requireUser(ctx, 'notification.send');
    const tpl = String(ctx.body.template || '');
    const exists = (await sql`SELECT key FROM message_templates WHERE key = ${tpl} AND active`)[0];
    if (!exists) throw bad('Unknown template');
    await notifyCustomer(ctx.params.id, tpl, 'manual_update', { update_label: str(ctx.body.label, 100) || 'Update from our team', notes_line: ctx.body.notes ? `\n${str(ctx.body.notes, 500)}` : '' });
    await audit(ctx, 'notification.manual', 'service_request', ctx.params.id, `Sent ${tpl} to customer`);
    return requestDetail(ctx.params.id, ctx);
  });
  r.post('/api/v1/notifications/:id/retry', async (ctx) => {
    requireUser(ctx, 'notification.send');
    return retryNotification(ctx.params.id);
  });

  // Payments
  r.post('/api/v1/requests/:id/payments', async (ctx) => {
    requireUser(ctx, 'payment.manage');
    const req = (await sql`SELECT current_status, final_amount FROM service_requests WHERE id = ${ctx.params.id}`)[0];
    if (!req) throw notFound();
    if (req.current_status !== 'COMPLETED' && !ctx.body.advance) throw conflict('Payment is collected after completion (or tick "advance payment")');
    const p = await createPaymentForRequest(ctx.params.id, ctx.user!.name);
    await audit(ctx, 'payment.link', 'payment', p.id, `Payment link generated ₹${p.amount}`);
    return requestDetail(ctx.params.id, ctx);
  });
  r.post('/api/v1/payments', async (ctx) => {
    requireUser(ctx, 'payment.manage');
    const p = await createPaymentForRequest(String(ctx.body.request_id), ctx.user!.name);
    return p;
  });
  r.get('/api/v1/payments', async (ctx) => {
    requireUser(ctx, 'payment.view');
    const st = ctx.query.get('status');
    return sql`SELECT p.*, r.request_number, c.name AS customer_name FROM payments p JOIN service_requests r ON r.id = p.request_id JOIN customers c ON c.id = r.customer_id
               WHERE p.status <> 'CANCELLED' ${st ? sql`AND p.status = ${st}` : sql``} ORDER BY p.created_at DESC LIMIT 300`;
  });
  r.post('/api/v1/payments/:id/mark-paid', async (ctx) => {
    requireUser(ctx, 'payment.manage');
    const method = str(ctx.body.method, 30);
    const ref = str(ctx.body.reference, 100);
    if (!method || !ref) throw bad('Method and reference are required');
    await markPaidManually(ctx, ctx.params.id, method, ref);
    return { ok: true };
  });
  r.post('/api/v1/payments/:id/refund', async (ctx) => {
    requireUser(ctx, 'payment.refund');
    const reason = str(ctx.body.reason, 300);
    if (!reason) throw bad('Refund reason is required');
    await refundPayment(ctx, ctx.params.id, Number(ctx.body.amount), reason);
    return { ok: true };
  });

  // Expenses (FRD §26)
  r.post('/api/v1/requests/:id/expenses', async (ctx) => {
    if (ctx.companion && !ctx.user) {
      const owns = (await sql`SELECT 1 FROM service_requests WHERE id = ${ctx.params.id} AND assigned_companion_id = ${ctx.companion.id}`)[0];
      if (!owns) throw notFound();
    } else requireUser(ctx, 'expense.create');
    return createExpense(ctx, ctx.params.id, ctx.body);
  });
  r.get('/api/v1/expenses', async (ctx) => {
    requireUser(ctx, 'request.view');
    const st = ctx.query.get('status');
    return sql`SELECT e.*, r.request_number, r.current_status, r.payment_status FROM expenses e JOIN service_requests r ON r.id = e.request_id
               ${st ? sql`WHERE e.approval_status = ${st}` : sql``} ORDER BY e.created_at DESC LIMIT 300`;
  });
  r.post('/api/v1/expenses/:id/review', async (ctx) => {
    requireUser(ctx, 'expense.approve');
    const decision = ctx.body.decision === 'APPROVED' ? 'APPROVED' : ctx.body.decision === 'REJECTED' ? 'REJECTED' : null;
    if (!decision) throw bad('Decision must be APPROVED or REJECTED');
    const e = (await sql`UPDATE expenses SET approval_status = ${decision}, reviewed_by = ${ctx.user!.name}, reviewed_at = now(), review_note = ${str(ctx.body.note, 300)},
                 bill_to_customer = COALESCE(${typeof ctx.body.bill_to_customer === 'boolean' ? ctx.body.bill_to_customer : null}, bill_to_customer)
               WHERE id = ${ctx.params.id} RETURNING *`)[0];
    if (!e) throw notFound();
    await sql.begin((tx: any) => insertEvent(tx, e.request_id, { type: 'expense_reviewed', label: `Expense ${decision.toLowerCase()}: ${e.category} ₹${e.amount}`, actor: actor(ctx), customerVisible: false, notes: e.review_note }));
    await audit(ctx, 'expense.review', 'expense', e.id, `${decision} ₹${e.amount} ${e.category}`);
    await recalcIfUnpaid(e.request_id, ctx.user!.name);
    return e;
  });
  r.get('/api/v1/files/:id', async (ctx) => {
    if (!ctx.user && !ctx.companion) throw new HttpError(401, 'Sign in required');
    if (ctx.user) requireUser(ctx, 'request.view');
    const f = (await sql`SELECT * FROM files WHERE id = ${ctx.params.id}`)[0];
    if (!f) throw notFound();
    if (!ctx.user && !(f.uploaded_by_type === 'companion' && f.uploaded_by_id === ctx.companion!.id)) throw notFound();
    return new Response(f.data, { headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=300', 'content-disposition': `inline; filename="${(f.filename || 'receipt').replace(/"/g, '')}"`, 'x-content-type-options': 'nosniff' } });
  });

  // Incidents (FRD §29)
  r.post('/api/v1/requests/:id/incidents', async (ctx) => {
    if (ctx.companion && !ctx.user) {
      const owns = (await sql`SELECT 1 FROM service_requests WHERE id = ${ctx.params.id} AND assigned_companion_id = ${ctx.companion.id}`)[0];
      if (!owns) throw notFound();
    } else requireUser(ctx, 'incident.create');
    return createIncident(ctx, ctx.params.id, ctx.body);
  });
  r.post('/api/v1/incidents', async (ctx) => {
    requireUser(ctx, 'incident.create');
    return createIncident(ctx, str(ctx.body.request_id) || null, ctx.body);
  });
  r.get('/api/v1/incidents', async (ctx) => {
    requireUser(ctx, 'request.view');
    const st = ctx.query.get('status');
    return sql`SELECT i.*, r.request_number, c.name AS companion_name FROM incidents i LEFT JOIN service_requests r ON r.id = i.request_id LEFT JOIN companions c ON c.id = i.companion_id
               ${st === 'open' ? sql`WHERE i.status <> 'CLOSED'` : st ? sql`WHERE i.status = ${st}` : sql``}
               ORDER BY (i.status = 'CLOSED'), CASE i.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, i.created_at DESC LIMIT 300`;
  });
  r.patch('/api/v1/incidents/:id', async (ctx) => {
    requireUser(ctx, 'incident.create');
    const b = ctx.body;
    const before = (await sql`SELECT * FROM incidents WHERE id = ${ctx.params.id}`)[0];
    if (!before) throw notFound();
    const closing = b.status === 'CLOSED' && before.status !== 'CLOSED';
    if (closing) {
      requireUser(ctx, 'incident.close');
      if (!str(b.resolution ?? before.resolution)) throw bad('Resolution is required to close an incident');
    }
    const patch: any = { updated_at: new Date() };
    for (const k of ['status', 'severity', 'actions', 'escalation', 'resolution', 'category']) if (b[k] !== undefined) patch[k] = str(b[k], 2000);
    if (closing) { patch.closed_by = ctx.user!.name; patch.closed_at = new Date(); }
    if (b.status && b.status !== 'CLOSED' && before.status === 'CLOSED') { patch.closed_by = null; patch.closed_at = null; }
    const i = (await sql`UPDATE incidents SET ${sql(patch)} WHERE id = ${before.id} RETURNING *`)[0];
    if (i.request_id) {
      const open = (await sql`SELECT count(*)::int AS n FROM incidents WHERE request_id = ${i.request_id} AND status <> 'CLOSED'`)[0].n;
      await sql`UPDATE service_requests SET incident_flag = ${open > 0} WHERE id = ${i.request_id}`;
      await sql.begin((tx: any) => insertEvent(tx, i.request_id, { type: closing ? 'incident_closed' : 'incident_updated', label: `${i.incident_number} ${closing ? 'closed' : 'updated'}`, actor: actor(ctx), customerVisible: false, notes: closing ? i.resolution : null }));
    }
    await audit(ctx, closing ? 'incident.close' : 'incident.update', 'incident', i.id, `${i.incident_number} ${closing ? 'closed' : 'updated'}`, before, i);
    return i;
  });

  // Ops alerts feed (FRD §12)
  r.get('/api/v1/alerts', async (ctx) => {
    requireUser(ctx, 'request.view');
    const unacked = ctx.query.get('unacked') === '1';
    return sql`SELECT n.id, n.request_id, n.event, n.title, n.body, n.severity, n.created_at, n.acknowledged_at, n.acknowledged_by, r.request_number
               FROM notifications n LEFT JOIN service_requests r ON r.id = n.request_id
               WHERE n.channel = 'INTERNAL' AND n.recipient_type = 'ops' ${unacked ? sql`AND n.acknowledged_at IS NULL` : sql``}
               ORDER BY n.created_at DESC LIMIT 100`;
  });
  r.post('/api/v1/alerts/:id/ack', async (ctx) => {
    requireUser(ctx, 'request.view');
    await sql`UPDATE notifications SET acknowledged_at = now(), acknowledged_by = ${ctx.user!.name} WHERE id = ${ctx.params.id} AND acknowledged_at IS NULL`;
    return { ok: true };
  });
  r.post('/api/v1/alerts/ack-all', async (ctx) => {
    requireUser(ctx, 'request.view');
    await sql`UPDATE notifications SET acknowledged_at = now(), acknowledged_by = ${ctx.user!.name} WHERE channel = 'INTERNAL' AND recipient_type = 'ops' AND acknowledged_at IS NULL`;
    return { ok: true };
  });
  r.get('/api/v1/notifications', async (ctx) => {
    requireUser(ctx, 'request.view');
    const st = ctx.query.get('status');
    return sql`SELECT n.*, r.request_number FROM notifications n LEFT JOIN service_requests r ON r.id = n.request_id
               WHERE n.recipient_type <> 'ops' ${st ? sql`AND n.status = ${st}` : sql``} ORDER BY n.created_at DESC LIMIT 300`;
  });

  // Customers & patients (FRD §48 – customer/patient profiles)
  r.get('/api/v1/customers', async (ctx) => {
    requireUser(ctx, 'customer.view');
    const q = ctx.query.get('q');
    return sql`SELECT c.*, (SELECT count(*)::int FROM service_requests r WHERE r.customer_id = c.id) AS requests,
                 (SELECT count(*)::int FROM service_requests r WHERE r.customer_id = c.id AND r.current_status = 'COMPLETED') AS completed,
                 (SELECT max(created_at) FROM service_requests r WHERE r.customer_id = c.id) AS last_request_at,
                 (SELECT count(*)::int FROM patients p WHERE p.customer_id = c.id) AS patients
               FROM customers c ${q ? sql`WHERE c.name ILIKE ${'%' + q + '%'} OR c.phone ILIKE ${'%' + q + '%'}` : sql``}
               ORDER BY last_request_at DESC NULLS LAST LIMIT 300`;
  });
  r.get('/api/v1/customers/:id', async (ctx) => {
    requireUser(ctx, 'customer.view');
    const c = (await sql`SELECT * FROM customers WHERE id = ${ctx.params.id}`)[0];
    if (!c) throw notFound();
    const patients = await sql`SELECT * FROM patients WHERE customer_id = ${c.id} ORDER BY created_at`;
    const requests = await sql`${listBase()} WHERE r.customer_id = ${c.id} ORDER BY r.created_at DESC`;
    const conv = await sql`SELECT id, current_step, last_inbound_at, source FROM wa_conversations WHERE wa_phone_number = ${c.phone}`;
    const ltv = (await sql`SELECT COALESCE(sum(amount - refunded_amount),0) AS v FROM payments p JOIN service_requests r ON r.id = p.request_id WHERE r.customer_id = ${c.id} AND p.status IN ('PAID','PARTIALLY_REFUNDED')`)[0].v;
    await audit(ctx, 'customer.view', 'customer', c.id, `Viewed customer profile ${c.phone.slice(-4)}`);
    return { ...c, patients, requests, conversation: conv[0] ?? null, lifetime_value: ltv };
  });
  r.patch('/api/v1/customers/:id', async (ctx) => {
    requireUser(ctx, 'customer.edit');
    const b = ctx.body;
    const patch: any = { updated_at: new Date() };
    for (const k of ['name', 'email', 'city', 'notes']) if (b[k] !== undefined) patch[k] = str(b[k], 500);
    const before = (await sql`SELECT * FROM customers WHERE id = ${ctx.params.id}`)[0];
    const c = (await sql`UPDATE customers SET ${sql(patch)} WHERE id = ${ctx.params.id} RETURNING *`)[0];
    await audit(ctx, 'customer.edit', 'customer', c.id, 'Customer profile updated', before, c);
    return c;
  });
  r.patch('/api/v1/patients/:id', async (ctx) => {
    requireUser(ctx, 'customer.edit');
    const b = ctx.body;
    const patch: any = { updated_at: new Date() };
    for (const k of ['name', 'gender', 'relationship', 'address', 'mobility', 'language', 'special_instructions']) if (b[k] !== undefined) patch[k] = str(b[k], 500);
    if (b.age !== undefined) patch.age = num(b.age);
    if (b.phone !== undefined) patch.phone = normalizePhone(b.phone);
    if (b.consent_given !== undefined) { patch.consent_given = !!b.consent_given; patch.consent_at = b.consent_given ? new Date() : null; }
    const before = (await sql`SELECT * FROM patients WHERE id = ${ctx.params.id}`)[0];
    const p = (await sql`UPDATE patients SET ${sql(patch)} WHERE id = ${ctx.params.id} RETURNING *`)[0];
    await audit(ctx, 'patient.edit', 'patient', p.id, 'Patient profile updated', before, p);
    return p;
  });

  // WhatsApp conversations (ops visibility)
  r.get('/api/v1/whatsapp/conversations', async (ctx) => {
    requireUser(ctx, 'whatsapp.view');
    return sql`SELECT w.*, c.name AS customer_name, r.request_number,
                 (SELECT body FROM wa_messages m WHERE m.conversation_id = w.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                 (SELECT count(*)::int FROM wa_messages m WHERE m.conversation_id = w.id) AS message_count
               FROM wa_conversations w LEFT JOIN customers c ON c.id = w.customer_id LEFT JOIN service_requests r ON r.id = w.active_request_id
               ORDER BY w.updated_at DESC LIMIT 200`;
  });
  r.get('/api/v1/whatsapp/conversations/:id', async (ctx) => {
    requireUser(ctx, 'whatsapp.view');
    const conv = (await sql`SELECT * FROM wa_conversations WHERE id = ${ctx.params.id}`)[0];
    if (!conv) throw notFound();
    const messages = await sql`SELECT id, direction, provider_message_id, msg_type, body, payload, status, created_at FROM wa_messages WHERE conversation_id = ${conv.id} ORDER BY created_at, id`;
    return { ...conv, messages };
  });
}

async function recalcIfUnpaid(requestId: string, by: string) {
  const r = (await sql`SELECT * FROM service_requests WHERE id = ${requestId}`)[0];
  if (!r || r.current_status !== 'COMPLETED' || ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(r.payment_status)) return;
  const rule = (await sql`SELECT * FROM pricing_rules WHERE id = ${r.pricing_rule_id}`)[0];
  if (!rule) return;
  const exp = (await sql`SELECT COALESCE(sum(amount),0) AS s FROM expenses WHERE request_id = ${r.id} AND bill_to_customer AND approval_status <> 'REJECTED'`)[0].s;
  const charge = computeCharge(rule, r.service_duration_minutes || 0, r.urgency, Number(exp));
  if (Math.abs(charge.total - Number(r.final_amount)) < 0.01) return;
  await sql`UPDATE service_requests SET final_amount = ${charge.total}, charge_breakdown = ${sql.json(charge)} WHERE id = ${r.id}`;
  await createPaymentForRequest(r.id, by);
}

function pickAudit(d: any) {
  return {
    service_type: d.service_type, urgency: d.urgency, requested_datetime: d.requested_datetime, mobility_status: d.mobility_status,
    special_instructions: d.special_instructions, pickup: d.pickup?.address, destination: d.destination?.place_name,
    patient: d.patient && { name: d.patient.name, age: d.patient.age }, customer: d.customer && { name: d.customer.name },
  };
}

export { isUrgent, alertOps, companionStats, actorOf };
