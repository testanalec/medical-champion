// Customer app push notifications through Firebase Cloud Messaging (HTTP v1).
// Configure with FCM_SERVICE_ACCOUNT = the full service-account JSON of the Firebase project.
// Without it, tokens are still stored and sending is skipped quietly.
import crypto from 'node:crypto';
import { sql } from './db';

let tableReady: Promise<void> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS push_tokens (
        id bigserial PRIMARY KEY,
        request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        token text NOT NULL,
        platform text NOT NULL DEFAULT 'android',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (request_id, token)
      )`;
    })().catch((e) => {
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

export async function registerPushToken(requestId: string, token: string, platform: string) {
  await ensureTable();
  await sql`INSERT INTO push_tokens (request_id, token, platform) VALUES (${requestId}, ${token}, ${platform})
            ON CONFLICT (request_id, token) DO NOTHING`;
}

function serviceAccount(): any | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch {
    return null;
  }
}

export function pushConfigured() {
  return !!serviceAccount();
}

let cachedToken: { value: string; exp: number } | null = null;
async function accessToken(sa: any) {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`FCM auth failed: ${data.error_description || data.error || res.status}`);
  cachedToken = { value: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

/** Sends a push to every app install following this request. Never throws. */
export async function pushToRequest(requestId: string, title: string, body: string) {
  const sa = serviceAccount();
  if (!sa) return 0;
  try {
    await ensureTable();
    const rows = await sql`SELECT t.id, t.token, r.request_number FROM push_tokens t JOIN service_requests r ON r.id = t.request_id WHERE t.request_id = ${requestId}`;
    if (!rows.length) return 0;
    const auth = await accessToken(sa);
    let sent = 0;
    for (const row of rows) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: { title, body: body.slice(0, 900) },
            data: { request_number: row.request_number },
            android: { priority: 'high', notification: { channel_id: 'booking_updates' } },
          },
        }),
      });
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 400) await sql`DELETE FROM push_tokens WHERE id = ${row.id}`;
    }
    return sent;
  } catch (e: any) {
    console.error('[push] failed', e?.message || e);
    return 0;
  }
}
