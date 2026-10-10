import { sql } from '../db';
import { Router, Ctx, bad, notFound, str, num, normalizePhone, rateLimit, HttpError } from '../http';
import { requireCompanion, requireUser, issueOtp, verifyOtp, createSession, destroySession, audit, verifyPassword } from '../auth';
import { respondToOffer, setAvailability, verificationComplete } from '../dispatch';
import { recordServiceEvent, completeService } from '../lifecycle';
import { getSetting, serviceTypeLabel } from '../settings';
import { mapsLink } from '../geo';
import { withIdempotency, createExpense, createIncident } from './shared';
import { SERVICE_EVENTS, ACTIVE_SERVICE } from '../../shared/constants';
import { maybeTick } from '../sla';
import { waConfigured, sendAuthCode } from '../wa';

// Champs can sign in with mobile + password (set by Operations) as well as a WhatsApp code.
let pwColumns: Promise<void> | null = null;
export function ensureCompanionPasswordColumns() {
  if (!pwColumns) {
    pwColumns = (async () => {
      await sql`ALTER TABLE companions ADD COLUMN IF NOT EXISTS password_hash text`;
      await sql`ALTER TABLE companions ADD COLUMN IF NOT EXISTS password_set_at timestamptz`;
      await sql`ALTER TABLE companions ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE companions ADD COLUMN IF NOT EXISTS locked_until timestamptz`;
    })().catch((e) => { pwColumns = null; throw e; });
  }
  return pwColumns;
}

async function jobView(requestId: string, companionId: string, full: boolean) {
  const r = (await sql`
    SELECT r.*, p.name AS patient_name, p.age AS patient_age, p.gender AS patient_gender, p.language AS patient_language, p.relationship,
           pl.address AS pickup_address, pl.lat AS pickup_lat, pl.lng AS pickup_lng,
           dl.place_name AS dest_name, dl.address AS dest_address, dl.lat AS dest_lat, dl.lng AS dest_lng
    FROM service_requests r LEFT JOIN patients p ON p.id = r.patient_id
    LEFT JOIN locations pl ON pl.id = r.pickup_location_id LEFT JOIN locations dl ON dl.id = r.destination_location_id
    WHERE r.id = ${requestId}`)[0];
  if (!r) throw notFound();
  const contact = await getSetting('contact');
  const locality = (r.pickup_address || '').split(',').slice(-2).join(',').trim();
  // Least privilege (FRD §15 FR-CMP-003): only what is needed to fulfil; full address after acceptance.
  const base = {
    id: r.id, request_number: r.request_number, status: r.current_status, service_type: serviceTypeLabel(r.service_type),
    urgency: r.urgency, requested_datetime: r.requested_datetime, mobility: r.mobility_status,
    destination: r.dest_name || r.dest_address || 'Not decided – Operations will confirm',
    pickup_area: locality || 'Gurugram', ops_phone: contact.support_phone, ops_phone_display: contact.support_phone_display,
  };
  if (!full) return base;
  const events = await sql`SELECT id, event_type, label, notes, actor_name, created_at FROM status_events WHERE request_id = ${r.id} AND event_type NOT IN ('details_updated','flag_set','flag_cleared') ORDER BY created_at, id`;
  const expenses = await sql`SELECT id, category, amount, description, approval_status, receipt_file_id, created_at FROM expenses WHERE request_id = ${r.id} AND submitted_by_id = ${companionId}::text ORDER BY created_at`;
  const done = new Set(events.map((e: any) => e.event_type));
  const next = SERVICE_EVENTS.filter((e) => (!e.requires || e.requires.includes(r.current_status)) && !(done.has(e.type) && !['tests', 'pharmacy', 'consultation_underway'].includes(e.type)));
  return {
    ...base,
    patient_name: r.patient_name, patient_age: r.patient_age, patient_gender: r.patient_gender, patient_language: r.patient_language,
    relationship: r.relationship, pickup_address: r.pickup_address, special_instructions: r.special_instructions,
    pickup_nav: mapsLink(r.pickup_lat, r.pickup_lng, r.pickup_address),
    destination_nav: r.dest_name || r.dest_address ? mapsLink(r.dest_lat, r.dest_lng, r.dest_name || r.dest_address) : null,
    estimated_arrival: r.estimated_arrival, actual_arrival: r.actual_arrival, verified: !!r.verified_at,
    service_start_time: r.service_start_time, service_end_time: r.service_end_time, duration_minutes: r.service_duration_minutes,
    completion_type: r.completion_type, events, expenses, done: [...done], next_events: next.map((e) => ({ type: e.type, label: e.label })),
    can_complete: ['AT_HOSPITAL', 'RETURNING'].includes(r.current_status),
  };
}

async function ownJob(ctx: Ctx, id: string) {
  const c = requireCompanion(ctx);
  const r = (await sql`SELECT id FROM service_requests WHERE id = ${id} AND assigned_companion_id = ${c.id}`)[0];
  if (r) return r.id as string;
  // completed jobs remain visible through assignments history
  const a = (await sql`SELECT request_id FROM assignments WHERE request_id = ${id} AND companion_id = ${c.id} AND status IN ('ACCEPTED','COMPLETED')`)[0];
  if (!a) throw notFound('Job not found');
  return a.request_id as string;
}

export function registerCompanion(r: Router) {
  r.post('/api/v1/companion/auth/otp', async (ctx) => {
    await rateLimit(`otp:${ctx.ip}`, 15, 900);
    const phone = normalizePhone(ctx.body.phone);
    if (!phone) throw bad('Enter your registered mobile number');
    const c = (await sql`SELECT id, suspended FROM companions WHERE phone = ${phone}`)[0];
    const demo = (await getSetting('security')).demo_mode;
    if (!c || c.suspended) {
      // Don't reveal whether a number is registered
      return { sent: true, ttl: 300, demo_code: null, message: 'If this number is registered, an OTP has been sent.' };
    }
    const { code, ttl } = await issueOtp(phone, 'companion_login');
    // Demo mode shows the code on screen for testing only. In production the code is delivered on
    // WhatsApp through the approved authentication template.
    if (demo) return { sent: true, ttl, demo_code: code, message: 'OTP sent' };
    if (!waConfigured()) throw new HttpError(503, 'Login codes cannot be delivered right now. Please contact Operations.', 'otp_delivery_unavailable');
    try {
      await sendAuthCode(phone, code);
    } catch (e: any) {
      console.error('[companion otp] WhatsApp delivery failed', e?.message);
      throw new HttpError(502, 'We could not send the code on WhatsApp. Please try again in a minute or contact Operations.', 'otp_delivery_failed');
    }
    return { sent: true, ttl, demo_code: null, message: 'Code sent to your WhatsApp' };
  });
  r.post('/api/v1/companion/auth/password', async (ctx) => {
    await rateLimit(`cpw:${ctx.ip}`, 20, 900);
    await ensureCompanionPasswordColumns();
    const phone = normalizePhone(ctx.body.phone);
    const password = String(ctx.body.password || '');
    if (!phone || !password) throw bad('Enter your registered mobile number and password');
    const c = (await sql`SELECT * FROM companions WHERE phone = ${phone}`)[0];
    if (c?.locked_until && new Date(c.locked_until) > new Date()) throw new HttpError(423, 'Too many wrong attempts. Try again in 15 minutes or call Operations.');
    if (!c || !c.password_hash || !verifyPassword(password, c.password_hash)) {
      if (c) await sql`UPDATE companions SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END WHERE id = ${c.id}`;
      throw new HttpError(401, c && !c.password_hash ? 'No password has been set for this number yet. Please ask Operations.' : 'Incorrect mobile number or password');
    }
    if (c.suspended) throw new HttpError(403, 'Account not active. Please contact Operations.');
    await sql`UPDATE companions SET failed_logins = 0, locked_until = NULL WHERE id = ${c.id}`;
    await createSession(ctx, 'companion', c.id);
    ctx.companion = { id: c.id, code: c.code, name: c.name, phone: c.phone };
    await audit(ctx, 'auth.companion_login', 'companion', c.id, `${c.name} signed in with password`);
    return { ok: true };
  });
  r.post('/api/v1/companion/auth/verify', async (ctx) => {
    await rateLimit(`otpv:${ctx.ip}`, 30, 900);
    const phone = normalizePhone(ctx.body.phone);
    if (!phone) throw bad('Invalid phone');
    await verifyOtp(phone, 'companion_login', String(ctx.body.code || ''));
    const c = (await sql`SELECT * FROM companions WHERE phone = ${phone}`)[0];
    if (!c || c.suspended) throw new HttpError(403, 'Account not active. Please contact Operations.');
    await createSession(ctx, 'companion', c.id);
    ctx.companion = { id: c.id, code: c.code, name: c.name, phone: c.phone };
    await audit(ctx, 'auth.companion_login', 'companion', c.id, `${c.name} signed in`);
    return { ok: true };
  });
  r.post('/api/v1/companion/auth/logout', async (ctx) => {
    await destroySession(ctx, 'companion');
    return { ok: true };
  });

  r.get('/api/v1/companion/home', async (ctx) => {
    const c = requireCompanion(ctx);
    await maybeTick();
    const me = (await sql`SELECT c.*, sa.name AS zone FROM companions c LEFT JOIN service_areas sa ON sa.id = c.service_area_id WHERE c.id = ${c.id}`)[0];
    const offersRaw = await sql`SELECT * FROM assignments WHERE companion_id = ${c.id} AND status = 'OFFERED' AND expires_at > now() ORDER BY offered_at`;
    const offers: any[] = [];
    for (const o of offersRaw) offers.push({ assignment_id: o.id, expires_at: o.expires_at, eta_minutes: o.eta_minutes, distance_km: o.distance_km, job: await jobView(o.request_id, c.id, false) });
    const active = (await sql`SELECT id FROM service_requests WHERE assigned_companion_id = ${c.id} AND current_status = ANY(${ACTIVE_SERVICE}) ORDER BY accepted_at LIMIT 1`)[0];
    const stats = (await sql`SELECT count(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
        count(*) FILTER (WHERE a.status = 'COMPLETED' AND a.completed_at > date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')::int AS today,
        (SELECT round(avg(overall)::numeric,1) FROM ratings WHERE companion_id = ${c.id}) AS rating
      FROM assignments a WHERE a.companion_id = ${c.id}`)[0];
    const alerts = await sql`SELECT id, title, body, created_at FROM notifications WHERE recipient_type = 'companion' AND recipient = ${c.id} AND channel = 'INTERNAL' ORDER BY created_at DESC LIMIT 5`;
    const contact = await getSetting('contact');
    const emergency = await getSetting('emergency');
    return {
      me: { id: me.id, code: me.code, name: me.name, phone: me.phone, availability: me.availability, languages: me.languages, zone: me.zone,
        active: me.active, verification_complete: await verificationComplete(me), photo_url: me.photo_url },
      offers, active_job: active ? await jobView(active.id, c.id, true) : null, stats, alerts,
      ops_phone: contact.support_phone, ops_phone_display: contact.support_phone_display, emergency,
      lists: { completion_types: (await getSetting('lists')).completion_types, expense_categories: (await getSetting('lists')).expense_categories, incident_categories: (await getSetting('lists')).incident_categories },
    };
  });

  // FRD §15 FR-CMP-002 / §52 PATCH /companions/:id/availability
  r.post('/api/v1/companion/availability', async (ctx) => {
    const c = requireCompanion(ctx);
    const av = ctx.body.availability === 'AVAILABLE' ? 'AVAILABLE' : 'OFFLINE';
    const me = (await sql`SELECT * FROM companions WHERE id = ${c.id}`)[0];
    if (av === 'AVAILABLE' && (!me.active || !(await verificationComplete(me)))) throw bad('Your onboarding/verification is not complete yet. Please contact Operations.');
    const next = await setAvailability(c.id, av, num(ctx.body.lat), num(ctx.body.lng));
    await audit(ctx, 'companion.availability', 'companion', c.id, `${c.name} → ${next}`);
    return { availability: next };
  });
  r.patch('/api/v1/companions/:id/availability', async (ctx) => {
    if (ctx.companion && ctx.companion.id === ctx.params.id) {
      return { availability: await setAvailability(ctx.params.id, ctx.body.availability === 'AVAILABLE' ? 'AVAILABLE' : 'OFFLINE', num(ctx.body.lat), num(ctx.body.lng)) };
    }
    requireUser(ctx, 'companion.manage');
    const next = await setAvailability(ctx.params.id, ctx.body.availability === 'AVAILABLE' ? 'AVAILABLE' : 'OFFLINE');
    await audit(ctx, 'companion.availability', 'companion', ctx.params.id, `Set by ops → ${next}`);
    return { availability: next };
  });

  // FRD §52 accept/decline
  r.post('/api/v1/assignments/:id/accept', async (ctx) => {
    requireCompanion(ctx);
    const out = await withIdempotency(ctx.body.idempotency_key, `accept:${ctx.params.id}`, async () => {
      const res = await respondToOffer(ctx, ctx.params.id, true);
      return { ok: true, request_id: res.asg.request_id };
    });
    return out;
  });
  r.post('/api/v1/assignments/:id/decline', async (ctx) => {
    requireCompanion(ctx);
    return withIdempotency(ctx.body.idempotency_key, `decline:${ctx.params.id}`, async () => {
      await respondToOffer(ctx, ctx.params.id, false, str(ctx.body.reason, 200));
      return { ok: true };
    });
  });

  r.get('/api/v1/companion/jobs/:id', async (ctx) => {
    const c = requireCompanion(ctx);
    const id = await ownJob(ctx, ctx.params.id);
    return jobView(id, c.id, true);
  });
  r.post('/api/v1/companion/jobs/:id/event', async (ctx) => {
    const c = requireCompanion(ctx);
    const id = await ownJob(ctx, ctx.params.id);
    return withIdempotency(ctx.body.idempotency_key, `evt:${c.id}`, async () => {
      const res = await recordServiceEvent(ctx, id, String(ctx.body.event_type || ''), {
        notes: str(ctx.body.notes, 500), lat: num(ctx.body.lat), lng: num(ctx.body.lng), verification: ctx.body.verification,
      });
      if (num(ctx.body.lat) != null) await sql`UPDATE companions SET current_lat = ${num(ctx.body.lat)}, current_lng = ${num(ctx.body.lng)} WHERE id = ${c.id}`;
      return { ok: true, duplicate: res.duplicate };
    });
  });
  r.post('/api/v1/companion/jobs/:id/complete', async (ctx) => {
    const c = requireCompanion(ctx);
    const id = await ownJob(ctx, ctx.params.id);
    return withIdempotency(ctx.body.idempotency_key, `done:${c.id}`, async () => {
      await completeService(ctx, id, String(ctx.body.completion_type || ''), str(ctx.body.notes, 500));
      return { ok: true };
    });
  });
  r.post('/api/v1/companion/jobs/:id/expenses', async (ctx) => {
    requireCompanion(ctx);
    const id = await ownJob(ctx, ctx.params.id);
    return createExpense(ctx, id, { ...ctx.body, auto_approve: false });
  });
  r.post('/api/v1/companion/jobs/:id/incidents', async (ctx) => {
    requireCompanion(ctx);
    const id = await ownJob(ctx, ctx.params.id);
    return createIncident(ctx, id, ctx.body);
  });
  r.post('/api/v1/companion/jobs/:id/notes', async (ctx) => {
    const c = requireCompanion(ctx);
    const id = await ownJob(ctx, ctx.params.id);
    const note = str(ctx.body.note, 1000);
    if (!note) throw bad('Note is empty');
    return withIdempotency(ctx.body.idempotency_key, `note:${c.id}`, async () => {
      await sql`INSERT INTO status_events (request_id, event_type, label, actor_type, actor_id, actor_name, notes, customer_visible)
                VALUES (${id}, 'note', 'Companion note', 'companion', ${c.id}, ${c.name}, ${note}, false)`;
      return { ok: true };
    });
  });
  r.get('/api/v1/companion/history', async (ctx) => {
    const c = requireCompanion(ctx);
    return sql`SELECT r.id, r.request_number, r.service_type, r.current_status, r.service_start_time, r.service_end_time, r.service_duration_minutes,
                      r.completion_type, a.status AS assignment_status, a.offered_at, rt.overall AS rating
               FROM assignments a JOIN service_requests r ON r.id = a.request_id LEFT JOIN ratings rt ON rt.request_id = r.id
               WHERE a.companion_id = ${c.id} AND a.status IN ('ACCEPTED','COMPLETED','DECLINED','EXPIRED')
               ORDER BY a.offered_at DESC LIMIT 50`;
  });
}
