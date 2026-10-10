import crypto from 'node:crypto';
import { sql } from '../db';
import { Router, Ctx, bad, notFound, rateLimit, str, num, normalizePhone, cookie, HttpError, conflict } from '../http';
import { getAllSettings, getSetting, SERVICE_TYPES, integrationStatus, serviceTypeLabel } from '../settings';
import { searchGazetteer, geocode, checkServiceArea } from '../geo';
import { findPricingRule, quote } from '../pricing';
import { createServiceRequest } from '../lifecycle';
import { processWebhookPayload, buildInboundPayload } from '../whatsapp';
import { verifyMetaSignature } from '../wa';
import { processPaymentWebhook, sandboxCheckout, razorpayConfigured } from '../payments';
import { baseUrl, alertOps } from '../notifications';
import { sha256, can } from '../auth';
import { tick } from '../sla';
import { STATUS_LABEL, patientRef } from '../../shared/constants';
import { DEMO_USERS } from '../seed';
import { registerPushToken } from '../push';
import { sendHistoryCode, verifyHistoryCode, phoneForToken, historyFor, revokeToken } from '../history';

export function registerPublic(r: Router) {
  r.get('/api/v1/health', async () => {
    const t = Date.now();
    await sql`SELECT 1`;
    return { ok: true, db_ms: Date.now() - t, integrations: integrationStatus(), time: new Date().toISOString() };
  });

  r.get('/api/v1/public/config', async () => {
    const s = await getAllSettings();
    const rules = await sql`SELECT id, name, service_type, base_fee, included_minutes, extension_rate_per_hour, tax_percent, urgent_surcharge
                            FROM pricing_rules WHERE active AND effective_from <= CURRENT_DATE ORDER BY service_type = '*' DESC, base_fee`;
    const areas = await sql`SELECT name, city FROM service_areas WHERE active`;
    return {
      brand: s.brand, contact: s.contact, emergency: s.emergency, service_types: SERVICE_TYPES,
      pricing: rules, service_areas: areas, verification_claims: s.verification.public_claims,
      lists: { languages: s.lists.languages }, demo_mode: !!s.security.demo_mode,
      analytics: { ga_id: (String(s.analytics?.ga_measurement_id || process.env.GA_MEASUREMENT_ID || '').trim().match(/^G-[A-Z0-9]+$/i) || [null])[0] },
      // Demo sign-in shortcuts are only published while demo mode is on
      demo_accounts: s.security.demo_mode ? DEMO_USERS.map((u) => [u.email.split('@')[0].replace(/^./, (c) => c.toUpperCase()), u.email, u.password]) : [],
      integrations: integrationStatus(),
    };
  });

  r.get('/api/v1/public/places', async (ctx) => {
    const q = ctx.query.get('q') || '';
    const type = ctx.query.get('type');
    let places: any[] = searchGazetteer(q, 10, type);
    if (places.length === 0 && q.length >= 4) {
      const g = await geocode(q);
      if (g) places = [{ name: q, type: 'locality', lat: g.lat, lng: g.lng, address: g.address }];
    }
    const withArea: any[] = [];
    for (const p of places) withArea.push({ ...p, in_area: (await checkServiceArea(p.lat, p.lng, p.address)).inArea });
    return withArea;
  });

  r.post('/api/v1/public/quote', async (ctx) => {
    const st = str(ctx.body.service_type) || 'hospital_opd';
    const rule = await findPricingRule(st, null);
    if (!rule) throw notFound('No pricing configured');
    return { rule, quote: quote(rule, str(ctx.body.urgency) || 'ASAP') };
  });

  // Web booking (also used by ops phone booking when signed in)
  r.post('/api/v1/requests', async (ctx) => {
    const b = ctx.body;
    const opsBooking = !!ctx.user && can(ctx, 'request.create');
    if (!opsBooking) await rateLimit(`book:${ctx.ip}`, 6, 3600);
    const phone = normalizePhone(b.customer_phone);
    if (!phone) throw bad('Please enter a valid mobile number');
    if (!opsBooking && !b.consent) throw bad('Please accept the privacy notice and terms to continue');
    if (!opsBooking && !b.emergency_acknowledged) throw bad('Please confirm this is not a medical emergency');
    const urgency = str(b.urgency) as any;
    const res = await createServiceRequest(
      {
        channel: opsBooking ? (str(b.channel) === 'ops' ? 'ops' : 'phone') : 'web',
        customer: { name: str(b.customer_name, 80), phone, email: str(b.customer_email, 120) },
        patient: {
          name: str(b.patient_name, 80), age: num(b.patient_age), gender: str(b.patient_gender, 20), relationship: str(b.relationship, 40),
          phone: normalizePhone(b.patient_phone), language: str(b.patient_language, 30), consent: !!b.consent || opsBooking,
        },
        pickup: { address: str(b.pickup_address, 300), lat: num(b.pickup_lat), lng: num(b.pickup_lng), source: str(b.pickup_source, 30) || 'typed' },
        destination: b.destination_name || b.destination_lat ? { name: str(b.destination_name, 150), address: str(b.destination_address, 300), lat: num(b.destination_lat), lng: num(b.destination_lng) } : null,
        destinationUndecided: !b.destination_name,
        serviceType: SERVICE_TYPES.some((s) => s.id === b.service_type) ? b.service_type : 'not_sure',
        urgency,
        requestedAt: b.requested_at || null,
        mobility: str(b.mobility) as any,
        specialInstructions: str(b.special_instructions, 300),
        source: opsBooking ? 'phone' : str(b.utm?.utm_source, 60) || 'website',
        utm: typeof b.utm === 'object' && b.utm ? b.utm : {},
        idempotencyKey: str(b.idempotency_key, 80),
      },
      opsBooking ? { type: 'ops', id: ctx.user!.id, name: ctx.user!.name } : { type: 'customer', id: null, name: str(b.customer_name, 80) || phone },
      ctx,
    );
    const r = res.request;
    return {
      id: r.id, request_number: r.request_number, status: r.current_status, human_review_required: r.human_review_required,
      review_reasons: res.reviewReasons, track_url: `/track/${r.request_number}?t=${r.tracking_token}`, duplicate: res.duplicate,
    };
  });

  // ---------------- customer tracking (FRD §20) – token protected, minimal data
  async function loadTracked(ctx: Ctx) {
    const t = ctx.query.get('t') || ctx.body?.t;
    const rows = await sql`SELECT r.*, p.relationship, p.name AS patient_name, c.name AS customer_name
                           FROM service_requests r JOIN customers c ON c.id = r.customer_id LEFT JOIN patients p ON p.id = r.patient_id
                           WHERE r.request_number = ${ctx.params.number}`;
    const r = rows[0];
    if (!r || !t || r.tracking_token.length !== String(t).length || !crypto.timingSafeEqual(Buffer.from(r.tracking_token), Buffer.from(String(t)))) {
      throw notFound('We could not find this request. Please use the link from your WhatsApp messages.');
    }
    return r;
  }

  r.get('/api/v1/public/track/:number', async (ctx) => {
    const r = await loadTracked(ctx);
    const comp = r.assigned_companion_id && !['COMPANION_ASSIGNED'].includes(r.current_status)
      ? (await sql`SELECT code, name, photo_url, languages, gender FROM companions WHERE id = ${r.assigned_companion_id}`)[0]
      : null;
    const events = await sql`SELECT event_type, label, notes, created_at FROM status_events WHERE request_id = ${r.id} AND customer_visible ORDER BY created_at, id`;
    const dest = r.destination_location_id ? (await sql`SELECT place_name, address FROM locations WHERE id = ${r.destination_location_id}`)[0] : null;
    const pay = (await sql`SELECT id, amount, status, payment_link_url, provider, method, paid_at FROM payments WHERE request_id = ${r.id} AND status <> 'CANCELLED' ORDER BY created_at DESC LIMIT 1`)[0] ?? null;
    const rating = (await sql`SELECT overall, comment FROM ratings WHERE request_id = ${r.id}`)[0] ?? null;
    const trust = (await sql`SELECT trust_again FROM trust_responses WHERE request_id = ${r.id}`)[0] ?? null;
    const expenses = await sql`SELECT category, amount, description, approval_status FROM expenses WHERE request_id = ${r.id} AND bill_to_customer AND approval_status <> 'REJECTED' ORDER BY created_at`;
    const contact = await getSetting('contact');
    const emergency = await getSetting('emergency');
    return {
      request_number: r.request_number, status: r.current_status, status_label: STATUS_LABEL[r.current_status],
      service_type: serviceTypeLabel(r.service_type), urgency: r.urgency, requested_datetime: r.requested_datetime,
      patient_ref: patientRef(r.relationship, r.patient_name), customer_name: r.customer_name,
      destination: dest ? dest.place_name || dest.address : null,
      companion: comp ? { first_name: comp.name.split(' ')[0], name: comp.name, code: comp.code, photo_url: comp.photo_url, languages: comp.languages, verified: true } : null,
      eta: r.estimated_arrival, actual_arrival: r.actual_arrival, service_start_time: r.service_start_time, service_end_time: r.service_end_time,
      duration_minutes: r.service_duration_minutes, completion_type: r.completion_type,
      quoted_amount: r.quoted_amount, final_amount: r.final_amount, charge_breakdown: r.charge_breakdown, payment_status: r.payment_status,
      payment: pay ? { id: pay.id, amount: pay.amount, status: pay.status, url: pay.payment_link_url, provider: pay.provider, method: pay.method, paid_at: pay.paid_at } : null,
      expenses, timeline: events, rating, trust_again: trust?.trust_again ?? null, can_rate: r.current_status === 'COMPLETED' && !rating,
      human_review_required: r.human_review_required, cancellation_reason: r.cancellation_reason,
      support: { phone: contact.support_phone, phone_display: contact.support_phone_display, whatsapp: contact.whatsapp_number, hours: contact.support_hours },
      emergency: { number: emergency.primary_number, ambulance: emergency.ambulance_number },
    };
  });

  r.post('/api/v1/public/track-lookup', async (ctx) => {
    await rateLimit(`lookup:${ctx.ip}`, 10, 900);
    const phone = normalizePhone(ctx.body.phone);
    const rn = String(ctx.body.request_number || '').trim().toUpperCase();
    const r = phone ? (await sql`SELECT r.request_number, r.tracking_token FROM service_requests r JOIN customers c ON c.id = r.customer_id
                                 WHERE r.request_number = ${rn} AND c.phone = ${phone}`)[0] : null;
    if (!r) throw notFound('No request found for that ID and mobile number');
    return { track_url: `/track/${r.request_number}?t=${r.tracking_token}` };
  });

  // Customer app: booking history for a verified mobile number (all channels: app, website, WhatsApp, phone)
  r.post('/api/v1/public/history/code', async (ctx) => {
    await rateLimit(`hist-otp:${ctx.ip}`, 10, 900);
    const phone = normalizePhone(ctx.body.phone);
    if (!phone) throw bad('Please enter a valid mobile number');
    return sendHistoryCode(phone);
  });
  r.post('/api/v1/public/history/verify', async (ctx) => {
    await rateLimit(`hist-verify:${ctx.ip}`, 30, 900);
    const phone = normalizePhone(ctx.body.phone);
    if (!phone) throw bad('Please enter a valid mobile number');
    const token = await verifyHistoryCode(phone, String(ctx.body.code || ''));
    return { token, phone, requests: await historyFor(phone) };
  });
  r.post('/api/v1/public/history', async (ctx) => {
    await rateLimit(`hist:${ctx.ip}`, 120, 900);
    const phone = await phoneForToken(String(ctx.body.token || ''));
    return { phone, requests: await historyFor(phone) };
  });
  r.post('/api/v1/public/history/logout', async (ctx) => {
    await revokeToken(String(ctx.body.token || ''));
    return { ok: true };
  });

  // Customer app: follow a request with push notifications (token protected like tracking)
  r.post('/api/v1/public/track/:number/push', async (ctx) => {
    const r = await loadTracked(ctx);
    await rateLimit(`push:${ctx.ip}`, 30, 3600);
    const token = str(ctx.body.token, 4096);
    if (!token || token.length < 20) throw bad('Missing device token');
    await registerPushToken(r.id, token, str(ctx.body.platform, 20) || 'android');
    return { ok: true };
  });

  // FRD §23 – ratings with separate trust-again metric
  r.post('/api/v1/public/track/:number/rating', async (ctx) => {
    const r = await loadTracked(ctx);
    await rateLimit(`rate:${ctx.ip}`, 20, 3600);
    if (r.current_status !== 'COMPLETED') throw conflict('You can rate once the service is completed');
    const overall = Number(ctx.body.overall);
    if (!(overall >= 1 && overall <= 5)) throw bad('Please choose 1–5 stars');
    if (typeof ctx.body.trust_again !== 'boolean') throw bad('Please answer: would you trust us to help your parent again?');
    const exists = await sql`SELECT 1 FROM ratings WHERE request_id = ${r.id}`;
    if (exists[0]) throw conflict('Thank you – you have already rated this service');
    await sql.begin(async (tx: any) => {
      await tx`INSERT INTO ratings (request_id, companion_id, overall, comment) VALUES (${r.id}, ${r.assigned_companion_id}, ${overall}, ${str(ctx.body.comment, 1000)})`;
      await tx`INSERT INTO trust_responses (request_id, trust_again, reason, referral_intent) VALUES (${r.id}, ${ctx.body.trust_again}, ${str(ctx.body.reason, 500)}, ${typeof ctx.body.would_refer === 'boolean' ? ctx.body.would_refer : null})`;
      await tx`INSERT INTO status_events (request_id, event_type, label, actor_type, actor_name, notes, customer_visible)
               VALUES (${r.id}, 'rated', ${`Rated ${overall}★`}, 'customer', ${r.customer_name || 'Customer'}, ${ctx.body.trust_again ? 'Would trust again' : 'Would NOT trust again'}, false)`;
    });
    if (overall <= 2 || ctx.body.trust_again === false) {
      await alertOps(r.id, 'low_rating', `⚠ Low rating on ${r.request_number}`, `${overall}★ · trust again: ${ctx.body.trust_again ? 'yes' : 'NO'} ${ctx.body.comment ? '· ' + ctx.body.comment : ''}`, 'WARNING');
    }
    return { ok: true };
  });

  // ---------------- payment page
  r.get('/api/v1/public/pay/:id', async (ctx) => {
    const p = (await sql`SELECT p.*, r.request_number, r.tracking_token, r.charge_breakdown, r.service_duration_minutes FROM payments p JOIN service_requests r ON r.id = p.request_id WHERE p.id = ${ctx.params.id}`)[0];
    if (!p || p.tracking_token !== ctx.query.get('t')) throw notFound('Payment link not found');
    return {
      id: p.id, amount: p.amount, currency: p.currency, status: p.status, provider: p.provider, request_number: p.request_number,
      breakdown: p.charge_breakdown, duration_minutes: p.service_duration_minutes, method: p.method, paid_at: p.paid_at,
      track_url: `/track/${p.request_number}?t=${p.tracking_token}`, gateway_live: razorpayConfigured(), link: p.payment_link_url, failure_reason: p.failure_reason,
    };
  });
  r.post('/api/v1/public/pay/:id/checkout', async (ctx) => {
    await rateLimit(`pay:${ctx.ip}`, 30, 3600);
    const method = ['upi', 'card', 'netbanking'].includes(ctx.body.method) ? ctx.body.method : 'upi';
    return sandboxCheckout(ctx.params.id, String(ctx.query.get('t') || ''), method, ctx.body.outcome === 'failure' ? 'failure' : 'success');
  });

  // ---------------- webhooks (FRD §34, §25)
  r.get('/api/v1/whatsapp/webhook', async (ctx) => {
    const mode = ctx.query.get('hub.mode');
    const token = ctx.query.get('hub.verify_token');
    if (mode === 'subscribe' && token && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'mc-verify-token')) {
      return new Response(ctx.query.get('hub.challenge') || '', { status: 200 });
    }
    throw new HttpError(403, 'Verification failed');
  });
  r.post('/api/v1/whatsapp/webhook', async (ctx) => {
    const sig = verifyMetaSignature(ctx.rawBody, ctx.req.headers.get('x-hub-signature-256'));
    if (sig === false) throw new HttpError(401, 'Invalid signature');
    if (sig === null && process.env.VERCEL_ENV === 'production' && process.env.WHATSAPP_TOKEN) throw new HttpError(401, 'Webhook secret not configured');
    const results = await processWebhookPayload(ctx.body, { source: 'whatsapp' });
    return { ok: true, processed: results.length };
  });
  r.post('/api/v1/payments/webhook', async (ctx) => {
    return processPaymentWebhook(ctx.rawBody, ctx.req.headers.get('x-razorpay-signature'), ctx.req.headers.get('x-razorpay-event-id'));
  });

  // ---------------- WhatsApp simulator (sandbox channel exercising the real webhook processor)
  const simOwner = (ctx: Ctx) => {
    let id = ctx.cookies.mc_sim;
    if (!id) {
      id = crypto.randomBytes(18).toString('base64url');
      ctx.setCookies.push(cookie('mc_sim', id, { maxAge: 30 * 86400, secure: !!process.env.VERCEL }));
      ctx.cookies.mc_sim = id;
    }
    return sha256('sim:' + id);
  };
  async function simConv(ctx: Ctx, phone: string) {
    const owner = simOwner(ctx);
    const c = (await sql`SELECT * FROM wa_conversations WHERE wa_phone_number = ${phone}`)[0];
    if (c && (c.source !== 'simulator' || (c.sim_owner && c.sim_owner !== owner))) {
      throw new HttpError(403, 'This number is already in use by another WhatsApp session. Please use a different number.');
    }
    return { conv: c, owner };
  }
  r.post('/api/v1/whatsapp/simulator/send', async (ctx) => {
    await rateLimit(`sim:${ctx.ip}`, 120, 600);
    const phone = normalizePhone(ctx.body.phone);
    if (!phone) throw bad('Enter a valid mobile number to start');
    const { owner } = await simConv(ctx, phone);
    const b = ctx.body;
    let message: any;
    if (b.reply?.id) message = { type: 'interactive', interactive: { type: b.reply.kind === 'list' ? 'list_reply' : 'button_reply', [b.reply.kind === 'list' ? 'list_reply' : 'button_reply']: { id: b.reply.id, title: b.reply.title } } };
    else if (b.location) message = { type: 'location', location: { latitude: b.location.lat, longitude: b.location.lng, name: b.location.name, address: b.location.address } };
    else if (str(b.text, 1000)) message = { type: 'text', text: { body: str(b.text, 1000) } };
    else throw bad('Empty message');
    const payload = buildInboundPayload(phone, str(b.name, 60), message);
    if (b.utm && typeof b.utm === 'object') {
      await sql`INSERT INTO wa_conversations (wa_phone_number, source, sim_owner, draft) VALUES (${phone}, 'simulator', ${owner}, ${sql.json({ utm: b.utm })})
                ON CONFLICT (wa_phone_number) DO NOTHING`;
    }
    // Duplicate-delivery test hook: resend the exact same provider message id
    const times = b.duplicate ? 2 : 1;
    let res: any;
    for (let i = 0; i < times; i++) res = await processWebhookPayload(payload, { source: 'simulator', simOwner: owner });
    return { ok: true, result: res };
  });
  r.get('/api/v1/whatsapp/simulator/messages', async (ctx) => {
    const phone = normalizePhone(ctx.query.get('phone'));
    if (!phone) return { messages: [] };
    const { conv, owner } = await simConv(ctx, phone);
    if (!conv) return { messages: [] };
    if (conv.sim_owner !== owner) throw new HttpError(403, 'Not your conversation');
    const messages = await sql`SELECT id, direction, msg_type, body, payload, status, created_at FROM wa_messages WHERE conversation_id = ${conv.id} ORDER BY created_at, id`;
    return {
      step: conv.current_step,
      active_request: conv.active_request_id ? (await sql`SELECT request_number, tracking_token FROM service_requests WHERE id = ${conv.active_request_id}`)[0] : null,
      messages: messages.map((m: any) => ({
        id: m.id, direction: m.direction, body: m.body, status: m.status, created_at: m.created_at,
        buttons: m.direction === 'OUT' ? m.payload.buttons : undefined, list: m.direction === 'OUT' ? m.payload.list : undefined,
        actions: m.direction === 'OUT' ? m.payload.actions : undefined, location: m.msg_type === 'location' ? m.payload.location : undefined,
      })),
    };
  });
  r.post('/api/v1/whatsapp/simulator/reset', async (ctx) => {
    const phone = normalizePhone(ctx.body.phone);
    if (!phone) throw bad('Invalid phone');
    const { conv, owner } = await simConv(ctx, phone);
    if (conv && conv.sim_owner === owner) {
      await sql`UPDATE wa_conversations SET current_step = 'START', draft = '{}', active_request_id = NULL WHERE id = ${conv.id}`;
    }
    return { ok: true };
  });

  // Vercel cron / external scheduler
  r.get('/api/v1/cron/tick', async (ctx) => {
    const secret = process.env.CRON_SECRET;
    if (secret && ctx.req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
    await tick();
    return { ok: true };
  });

  r.get('/api/v1/public/base-url', async () => ({ base: baseUrl() }));
}
