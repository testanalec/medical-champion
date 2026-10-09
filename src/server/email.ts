// Email notifications (customers, operations team, companions) sent through Resend (resend.com).
// Configure in Vercel: RESEND_API_KEY and EMAIL_FROM (e.g. "ChampOnCall <updates@champoncall.com>").
// Without RESEND_API_KEY nothing is sent and nothing breaks. Every email is logged in `notifications`.
import { sql } from './db';
import { getSetting } from './settings';

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

let columnReady: Promise<void> | null = null;
/** Companions get an optional email address (added without a schema version bump). */
export function ensureEmailColumns() {
  if (!columnReady) {
    columnReady = (async () => {
      await sql`ALTER TABLE companions ADD COLUMN IF NOT EXISTS email text`;
    })().catch((e) => {
      columnReady = null;
      throw e;
    });
  }
  return columnReady;
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const validEmail = (e: any) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Branded HTML wrapper: navy header, gold accent, optional button. Text keeps WhatsApp-style *bold*. */
export function emailHtml(o: { heading: string; text: string; buttonText?: string; buttonUrl?: string; footer?: string }) {
  const body = esc(o.text)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  const button = o.buttonUrl
    ? `<p style="margin:24px 0 8px"><a href="${esc(o.buttonUrl)}" style="background:#13213c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(o.buttonText || 'Open')}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#fbf8f2;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf8f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8dcc4">
<tr><td style="background:#13213c;padding:18px 24px;font-family:Georgia,serif;font-size:22px;font-weight:bold"><span style="color:#ffffff">Champ</span><span style="color:#c9a24a">OnCall</span>
<div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;color:#bfcadd;margin-top:4px">TRUSTED HELP, ANY TIME</div></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;color:#0b1426">${esc(o.heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#334155">${body}</div>${button}
</td></tr>
<tr><td style="padding:16px 24px;background:#f5efe3;font-size:12px;line-height:1.5;color:#64748b">${esc(o.footer || 'ChampOnCall is not an emergency service. In an emergency call 112 or 108.')}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Sends one email. Never throws: failures are logged and recorded. */
export async function sendEmail(o: {
  to: string | string[];
  subject: string;
  heading: string;
  text: string;
  buttonText?: string;
  buttonUrl?: string;
  recipientType: 'customer' | 'companion' | 'ops';
  requestId?: string | null;
  event: string;
}) {
  const to = (Array.isArray(o.to) ? o.to : [o.to]).map((x) => x.trim()).filter(validEmail);
  if (!to.length || !emailConfigured()) return null;
  const contact = await getSetting('contact').catch(() => ({} as any));
  const from = process.env.EMAIL_FROM || 'ChampOnCall <updates@champoncall.com>';
  let status = 'SENT';
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: o.subject,
        html: emailHtml({ heading: o.heading, text: o.text, buttonText: o.buttonText, buttonUrl: o.buttonUrl }),
        text: `${o.heading}\n\n${o.text.replace(/\*/g, '')}${o.buttonUrl ? `\n\n${o.buttonText || 'Open'}: ${o.buttonUrl}` : ''}`,
        ...(validEmail(contact?.support_email) ? { reply_to: contact.support_email } : {}),
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Email API error ${res.status}`);
    providerId = data.id || null;
  } catch (e: any) {
    status = 'FAILED';
    error = String(e?.message || e).slice(0, 500);
    console.error('[email] send failed', error);
  }
  try {
    await sql`INSERT INTO notifications (request_id, event, recipient_type, recipient, channel, title, body, severity, status, provider_message_id, error, attempts)
              VALUES (${o.requestId ?? null}, ${o.event}, ${o.recipientType}, ${to.join(', ')}, 'EMAIL', ${o.subject}, ${o.text.slice(0, 2000)}, 'INFO',
                      ${status}, ${providerId}, ${error}, 1)`;
  } catch (e: any) {
    console.error('[email] could not record notification', e?.message);
  }
  return status;
}

/** The operations inbox(es) from Settings → Contact → "Operations email(s)". */
export async function opsEmails(): Promise<string[]> {
  const s = await getSetting('email');
  return String(s.ops_emails || '').split(/[,;\s]+/).filter(validEmail);
}
