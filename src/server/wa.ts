// WhatsApp Business Platform (Cloud API) provider adapter.
// When WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID are configured, messages are delivered via Meta's Graph API.
// Otherwise the platform runs in sandbox mode: messages are stored and shown in the in-app WhatsApp simulator.
import crypto from 'node:crypto';
import { sql } from './db';

export interface OutMsg {
  body: string;
  header?: string;
  buttons?: { id: string; title: string }[]; // max 3 reply buttons
  list?: { button: string; rows: { id: string; title: string; description?: string }[] };
  actions?: { type: 'url' | 'call'; title: string; url: string }[];
  template?: string;
}

export const waConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export async function upsertConversation(phone: string, extra: { source?: string; profileName?: string | null } = {}) {
  const rows = await sql`
    INSERT INTO wa_conversations (wa_phone_number, source, profile_name)
    VALUES (${phone}, ${extra.source ?? 'whatsapp'}, ${extra.profileName ?? null})
    ON CONFLICT (wa_phone_number) DO UPDATE SET profile_name = COALESCE(EXCLUDED.profile_name, wa_conversations.profile_name)
    RETURNING *`;
  return rows[0];
}

function toGraphPayload(to: string, msg: OutMsg, useTemplate: boolean) {
  const toNum = to.replace(/^\+/, '');
  if (useTemplate && msg.template) {
    // Outside the 24h customer-service window Meta requires an approved template.
    return {
      messaging_product: 'whatsapp', to: toNum, type: 'template',
      template: { name: msg.template, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: msg.body.slice(0, 1000) }] }] },
    };
  }
  if (msg.buttons?.length) {
    return {
      messaging_product: 'whatsapp', to: toNum, type: 'interactive',
      interactive: {
        type: 'button', body: { text: msg.body },
        action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    };
  }
  if (msg.list) {
    return {
      messaging_product: 'whatsapp', to: toNum, type: 'interactive',
      interactive: {
        type: 'list', body: { text: msg.body },
        action: { button: msg.list.button.slice(0, 20), sections: [{ title: 'Options', rows: msg.list.rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24), description: r.description?.slice(0, 72) })) }] },
      },
    };
  }
  const url = msg.actions?.find((a) => a.type === 'url');
  if (url) {
    return {
      messaging_product: 'whatsapp', to: toNum, type: 'interactive',
      interactive: { type: 'cta_url', body: { text: msg.body }, action: { name: 'cta_url', parameters: { display_text: url.title.slice(0, 20), url: url.url } } },
    };
  }
  return { messaging_product: 'whatsapp', to: toNum, type: 'text', text: { body: msg.body, preview_url: true } };
}

/** Sends a WhatsApp message and records it on the conversation. Returns provider id or throws. */
export async function sendWhatsApp(phone: string, msg: OutMsg, notificationId: string | null = null): Promise<{ id: string; simulated: boolean }> {
  const conv = await upsertConversation(phone);
  let providerId: string;
  let simulated = true;
  if (waConfigured() && conv.source !== 'simulator') {
    simulated = false;
    const outsideWindow = !conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > 23.5 * 3600 * 1000;
    const payload = toGraphPayload(phone, msg, outsideWindow);
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `WhatsApp API error ${res.status}`);
    providerId = data.messages?.[0]?.id;
  } else {
    if (process.env.WHATSAPP_SIMULATE_OUTAGE === '1') throw new Error('WhatsApp provider unavailable (simulated outage)');
    providerId = 'wamid.SIM' + crypto.randomBytes(10).toString('hex');
  }
  await sql`INSERT INTO wa_messages (conversation_id, direction, provider_message_id, msg_type, body, payload, status, notification_id)
            VALUES (${conv.id}, 'OUT', ${providerId}, ${msg.buttons ? 'buttons' : msg.list ? 'list' : 'text'}, ${msg.body}, ${sql.json(msg)}, 'SENT', ${notificationId})`;
  await sql`UPDATE wa_conversations SET last_outbound_at = now(), updated_at = now() WHERE id = ${conv.id}`;
  return { id: providerId, simulated };
}

export function verifyMetaSignature(raw: string, header: string | null): boolean | null {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return null; // not configured
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
