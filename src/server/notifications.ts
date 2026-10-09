// Centralised notification engine (FRD §35). Inputs: event, recipient, channel, template, variables.
import { sql } from './db';
import { sendWhatsApp, OutMsg } from './wa';
import { getSetting } from './settings';
import { patientRef, fmtINR, fmtDuration } from '../shared/constants';
import { pushToRequest } from './push';
import { sendEmail, opsEmails, ensureEmailColumns, validEmail } from './email';

declare global {
  // eslint-disable-next-line no-var
  var __mcOrigin: string | undefined;
}

export function baseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (globalThis.__mcOrigin) return globalThis.__mcOrigin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function render(text: string, vars: Record<string, any>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (vars[k] ?? '').toString());
}

export async function renderTemplate(key: string, vars: Record<string, any>): Promise<OutMsg> {
  const rows = await sql`SELECT * FROM message_templates WHERE key = ${key} AND active`;
  const t = rows[0];
  if (!t) return { body: render(vars.fallback_body || key, vars) };
  const msg: OutMsg = { body: render(t.body, vars), template: key };
  const btns = (t.buttons || []) as any[];
  const replies = btns.filter((b) => b.type === 'reply');
  const actions = btns.filter((b) => b.type === 'url' || b.type === 'call');
  if (replies.length) msg.buttons = replies.map((b) => ({ id: b.id, title: render(b.title, vars) }));
  if (actions.length) msg.actions = actions.map((b) => ({ type: b.type, title: render(b.title, vars), url: render(b.url, vars) }));
  return msg;
}

export async function requestVars(requestId: string): Promise<Record<string, any>> {
  const rows = await sql`
    SELECT r.*, c.name AS customer_name, c.phone AS customer_phone, p.relationship, p.name AS patient_name,
           cmp.name AS companion_name, cmp.code AS companion_code, cmp.languages AS companion_languages,
           dl.place_name AS dest_place, dl.address AS dest_address
    FROM service_requests r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN patients p ON p.id = r.patient_id
    LEFT JOIN companions cmp ON cmp.id = r.assigned_companion_id
    LEFT JOIN locations dl ON dl.id = r.destination_location_id
    WHERE r.id = ${requestId}`;
  const r = rows[0];
  if (!r) return {};
  const contact = await getSetting('contact');
  const emergency = await getSetting('emergency');
  const origin = baseUrl();
  const track = `${origin}/track/${r.request_number}?t=${r.tracking_token}`;
  const pref = patientRef(r.relationship, r.patient_name);
  const pay = await sql`SELECT id, payment_link_url FROM payments WHERE request_id = ${r.id} AND status IN ('CREATED','PENDING','FAILED') ORDER BY created_at DESC LIMIT 1`;
  const eta = r.estimated_arrival
    ? new Date(r.estimated_arrival).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    : 'shortly';
  return {
    request_number: r.request_number,
    customer_name: r.customer_name || 'there',
    patient_ref: pref,
    patient_ref_cap: pref.charAt(0).toUpperCase() + pref.slice(1),
    companion_name: r.companion_name || 'Your companion',
    companion_first: (r.companion_name || 'Your companion').split(' ')[0],
    companion_code: r.companion_code || '',
    languages: (r.companion_languages || []).join(', '),
    eta,
    destination: r.dest_place || r.dest_address || 'the hospital',
    track_url: track,
    summary_url: `${track}&view=summary`,
    rate_url: `${track}&view=rate`,
    pay_url: pay[0]?.payment_link_url || `${track}&view=pay`,
    amount: fmtINR(r.final_amount ?? r.quoted_amount),
    duration: fmtDuration(r.service_duration_minutes),
    support_phone: contact.support_phone_display || contact.support_phone,
    support_tel: `tel:${contact.support_phone}`,
    emergency_number: emergency.primary_number,
    emergency_disclaimer: `This is not an emergency or ambulance service. If ${pref} has life-threatening symptoms, call ${emergency.primary_number} (${emergency.primary_label}) or ${emergency.ambulance_number} (${emergency.ambulance_label}) immediately.`,
  };
}

interface NotifyOpts {
  requestId?: string | null;
  statusEventId?: number | null;
  event: string;
  recipientType: 'customer' | 'companion' | 'ops';
  recipient: string;
  channel: 'WHATSAPP' | 'SMS' | 'INTERNAL';
  template?: string;
  variables?: Record<string, any>;
  title?: string;
  body?: string;
  severity?: 'INFO' | 'WARNING' | 'URGENT' | 'CRITICAL';
}

export async function notify(o: NotifyOpts) {
  const vars = o.variables ?? {};
  let msg: OutMsg | null = null;
  let body = o.body ?? null;
  if (o.channel === 'WHATSAPP' && o.template) {
    msg = await renderTemplate(o.template, vars);
    body = msg.body;
  }
  const rows = await sql`
    INSERT INTO notifications (request_id, status_event_id, event, recipient_type, recipient, channel, template, variables, title, body, severity, status)
    VALUES (${o.requestId ?? null}, ${o.statusEventId ?? null}, ${o.event}, ${o.recipientType}, ${o.recipient}, ${o.channel},
            ${o.template ?? null}, ${sql.json(vars)}, ${o.title ?? null}, ${body}, ${o.severity ?? 'INFO'},
            ${o.channel === 'INTERNAL' ? 'SENT' : 'QUEUED'})
    RETURNING *`;
  const n = rows[0];
  if (o.channel === 'INTERNAL') return n;
  return deliver(n, msg);
}

async function deliver(n: any, msg: OutMsg | null) {
  try {
    let providerId: string;
    if (n.channel === 'WHATSAPP') {
      const m = msg ?? (n.template ? await renderTemplate(n.template, n.variables) : { body: n.body });
      providerId = (await sendWhatsApp(n.recipient, m, n.id)).id;
    } else {
      // SMS/OTP provider adapter. Without a configured provider the message is recorded as sent (sandbox).
      providerId = 'sms-sim-' + Date.now();
    }
    await sql`UPDATE notifications SET status = 'SENT', provider_message_id = ${providerId}, attempts = attempts + 1, error = NULL, updated_at = now() WHERE id = ${n.id}`;
    if (n.status_event_id) await sql`UPDATE status_events SET notification_status = 'SENT' WHERE id = ${n.status_event_id}`;
    return { ...n, status: 'SENT', provider_message_id: providerId };
  } catch (e: any) {
    const attempts = n.attempts + 1;
    const backoff = Math.min(15 * 60, 30 * 2 ** attempts);
    await sql`UPDATE notifications SET status = 'FAILED', error = ${String(e.message).slice(0, 500)}, attempts = ${attempts},
              next_attempt_at = ${attempts < 4 ? sql`now() + make_interval(secs => ${backoff})` : null}, updated_at = now() WHERE id = ${n.id}`;
    if (n.status_event_id) await sql`UPDATE status_events SET notification_status = 'FAILED' WHERE id = ${n.status_event_id}`;
    // Surface failure to operations (FRD §46)
    if (n.recipient_type === 'customer') {
      await sql`INSERT INTO notifications (request_id, event, recipient_type, recipient, channel, title, body, severity, status)
                VALUES (${n.request_id}, 'notification_failed', 'ops', 'ops', 'INTERNAL', 'Customer notification failed',
                        ${`${n.channel} "${n.template || n.event}" failed: ${String(e.message).slice(0, 200)}. Retrying automatically; consider a phone/SMS fallback.`},
                        'WARNING', 'SENT')`;
    }
    return { ...n, status: 'FAILED', error: e.message };
  }
}

export async function retryFailedNotifications() {
  const rows = await sql`SELECT * FROM notifications WHERE status = 'FAILED' AND next_attempt_at IS NOT NULL AND next_attempt_at <= now() AND attempts < 4 LIMIT 10`;
  for (const n of rows) await deliver(n, null);
  return rows.length;
}

export async function retryNotification(id: string) {
  const rows = await sql`SELECT * FROM notifications WHERE id = ${id}`;
  if (!rows[0]) return null;
  return deliver(rows[0], null);
}

export async function notifyCustomer(requestId: string, template: string, event: string, extra: Record<string, any> = {}, statusEventId: number | null = null) {
  const vars = { ...(await requestVars(requestId)), ...extra };
  const r = (await sql`SELECT c.phone FROM service_requests r JOIN customers c ON c.id = r.customer_id WHERE r.id = ${requestId}`)[0];
  if (!r) return null;
  if (statusEventId) await sql`UPDATE status_events SET notification_status = 'QUEUED' WHERE id = ${statusEventId}`;
  const n: any = await notify({ requestId, statusEventId, event, recipientType: 'customer', recipient: r.phone, channel: 'WHATSAPP', template, variables: vars });
  // Mirror the update to the customer app (no-op unless push is configured and the app is following this request)
  const text = String(n?.body || '').replace(/\*/g, '').trim();
  if (text) await pushToRequest(requestId, `ChampOnCall · ${vars.request_number || 'Booking update'}`, text);
  // ...and to the customer's email, when they gave one
  try {
    const s = await getSetting('email');
    const c = (await sql`SELECT c.email FROM service_requests r JOIN customers c ON c.id = r.customer_id WHERE r.id = ${requestId}`)[0];
    if (s.customer_updates !== false && text && validEmail(c?.email)) {
      const heading = EVENT_HEADINGS[event] || humanize(event);
      await sendEmail({
        to: c.email, subject: `${heading} · ${vars.request_number || 'ChampOnCall'}`, heading, text: String(n?.body || text),
        buttonText: 'Track your request', buttonUrl: vars.track_url, recipientType: 'customer', requestId, event,
      });
    }
  } catch (e: any) {
    console.error('[email] customer update failed', e?.message);
  }
  return n;
}

const EVENT_HEADINGS: Record<string, string> = {
  request_created: 'We’ve received your request',
  human_review: 'Our care team will call you',
};
const humanize = (e: string) => e.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export async function alertOps(requestId: string | null, event: string, title: string, body: string, severity: 'INFO' | 'WARNING' | 'URGENT' | 'CRITICAL' = 'INFO') {
  const n = await notify({ requestId, event, recipientType: 'ops', recipient: 'ops', channel: 'INTERNAL', title, body, severity });
  // Email copy to the operations inbox(es)
  try {
    const s = await getSetting('email');
    const to = await opsEmails();
    if (s.ops_updates !== false && to.length) {
      await sendEmail({
        to, subject: `${severity === 'INFO' ? '' : `[${severity}] `}${title}`, heading: title, text: body,
        buttonText: requestId ? 'Open in Operations' : 'Open Operations', buttonUrl: `${baseUrl()}/ops${requestId ? `/requests/${requestId}` : ''}`,
        recipientType: 'ops', requestId, event,
      });
    }
  } catch (e: any) {
    console.error('[email] ops alert failed', e?.message);
  }
  return n;
}

export async function notifyCompanion(companionId: string, requestId: string | null, event: string, title: string, body: string) {
  const c = (await sql`SELECT phone FROM companions WHERE id = ${companionId}`)[0];
  if (!c) return;
  // In-app (PWA) notification record + SMS fallback
  await notify({ requestId, event, recipientType: 'companion', recipient: companionId, channel: 'INTERNAL', title, body, severity: 'URGENT' });
  await notify({ requestId, event, recipientType: 'companion', recipient: c.phone, channel: 'SMS', title, body: `${title}: ${body}` });
  // Email copy when the companion has an email address on file
  try {
    await ensureEmailColumns();
    const s = await getSetting('email');
    const e = (await sql`SELECT email FROM companions WHERE id = ${companionId}`)[0]?.email;
    if (s.companion_updates !== false && validEmail(e)) {
      await sendEmail({
        to: e, subject: `ChampOnCall · ${title}`, heading: title, text: body,
        buttonText: 'Open the companion app', buttonUrl: `${baseUrl()}/companion`, recipientType: 'companion', requestId, event,
      });
    }
  } catch (err: any) {
    console.error('[email] companion update failed', err?.message);
  }
}
