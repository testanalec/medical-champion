// Customer booking history for the mobile app.
// The customer proves they own a mobile number with a one-time code (sent on WhatsApp), and the app then
// receives a long-lived history token for that number. Every request made with that number — in the app,
// on the website, on WhatsApp or by phone — is listed.
import crypto from 'node:crypto';
import { sql } from './db';
import { HttpError } from './http';
import { issueOtp, verifyOtp, sha256 } from './auth';
import { getSetting, serviceTypeLabel } from './settings';
import { waConfigured, sendAuthCode, sendWhatsApp } from './wa';
import { STATUS_LABEL, patientRef } from '../shared/constants';

const PURPOSE = 'customer_history';

let tableReady: Promise<void> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS customer_app_tokens (
        id bigserial PRIMARY KEY,
        token_hash text NOT NULL UNIQUE,
        phone text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now()
      )`;
    })().catch((e) => {
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

/** Sends a login code. Returns demo_code only while the platform is in demo mode. */
export async function sendHistoryCode(phone: string) {
  const { code, ttl } = await issueOtp(phone, PURPOSE);
  // Customer booking history is private: once real WhatsApp is connected the code is ONLY sent on WhatsApp,
  // never shown on screen (even while demo mode is on for the staff/companion demo logins).
  if (!waConfigured()) {
    const demo = (await getSetting('security')).demo_mode;
    return { sent: true, ttl, demo_code: demo ? code : null, channel: demo ? 'demo' : 'none' };
  }
  try {
    await sendAuthCode(phone, code);
    return { sent: true, ttl, demo_code: null, channel: 'whatsapp' };
  } catch (e: any) {
    console.error('[history otp] template delivery failed', e?.message);
  }
  // Fallback: a normal message works when the customer has chatted with us in the last 24 hours
  try {
    await sendWhatsApp(phone, { body: `Your ChampOnCall code is *${code}*. It expires in ${Math.round(ttl / 60)} minutes. Do not share it with anyone.` });
    return { sent: true, ttl, demo_code: null, channel: 'whatsapp' };
  } catch (e: any) {
    console.error('[history otp] text delivery failed', e?.message);
    throw new HttpError(502, 'We could not send the code on WhatsApp. Send "Hi" to us on WhatsApp first, then try again.', 'otp_delivery_failed');
  }
}

export async function verifyHistoryCode(phone: string, code: string) {
  await verifyOtp(phone, PURPOSE, code);
  await ensureTable();
  const token = crypto.randomBytes(32).toString('base64url');
  await sql`INSERT INTO customer_app_tokens (token_hash, phone) VALUES (${sha256(token)}, ${phone})`;
  return token;
}

export async function phoneForToken(token: string): Promise<string> {
  await ensureTable();
  const row = (await sql`SELECT id, phone FROM customer_app_tokens WHERE token_hash = ${sha256(token)}`)[0];
  if (!row) throw new HttpError(401, 'Please verify your mobile number again.', 'history_token_invalid');
  await sql`UPDATE customer_app_tokens SET last_used_at = now() WHERE id = ${row.id}`;
  return row.phone;
}

export async function revokeToken(token: string) {
  await ensureTable();
  await sql`DELETE FROM customer_app_tokens WHERE token_hash = ${sha256(token)}`;
}

/** Every request made with this mobile number, newest first. */
export async function historyFor(phone: string) {
  const rows = await sql`
    SELECT r.request_number, r.tracking_token, r.current_status, r.service_type, r.urgency, r.requested_datetime, r.created_at,
           r.channel, r.final_amount, r.quoted_amount, p.relationship, p.name AS patient_name, l.place_name, l.address
    FROM service_requests r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN patients p ON p.id = r.patient_id
    LEFT JOIN locations l ON l.id = r.destination_location_id
    WHERE c.phone = ${phone}
    ORDER BY r.created_at DESC
    LIMIT 100`;
  return rows.map((r: any) => ({
    request_number: r.request_number,
    track_url: `/track/${r.request_number}?t=${r.tracking_token}`,
    status: r.current_status,
    status_label: STATUS_LABEL[r.current_status] || r.current_status,
    service_type: serviceTypeLabel(r.service_type),
    urgency: r.urgency,
    requested_datetime: r.requested_datetime,
    created_at: r.created_at,
    channel: r.channel,
    amount: r.final_amount ?? r.quoted_amount,
    patient_ref: patientRef(r.relationship, r.patient_name),
    destination: r.place_name || r.address || null,
  }));
}
