// Payments (FRD §25). Razorpay when configured; otherwise a sandbox gateway that follows the exact same
// server-side webhook verification path, so payment status is never trusted from the browser.
import crypto from 'node:crypto';
import { sql } from './db';
import { Ctx, bad, notFound, conflict } from './http';
import { audit } from './auth';
import { baseUrl, notifyCustomer, alertOps } from './notifications';
import { insertEvent } from './lifecycle';

const SANDBOX_SECRET = process.env.PAYMENT_SANDBOX_SECRET || 'mc-sandbox-webhook-secret';
export const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const webhookSecret = () => (razorpayConfigured() ? process.env.RAZORPAY_WEBHOOK_SECRET || '' : SANDBOX_SECRET);

function rzpAuth() {
  return 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
}

async function syncRequestPaymentStatus(requestId: string, tx: any = sql) {
  const ps = await tx`SELECT status, amount, refunded_amount FROM payments WHERE request_id = ${requestId} AND status <> 'CANCELLED' ORDER BY created_at DESC`;
  let status = 'NOT_DUE';
  if (ps.some((p: any) => p.status === 'PAID')) status = 'PAID';
  else if (ps.some((p: any) => p.status === 'PARTIALLY_REFUNDED')) status = 'PARTIALLY_REFUNDED';
  else if (ps.some((p: any) => p.status === 'REFUNDED')) status = 'REFUNDED';
  else if (ps[0]?.status === 'FAILED') status = 'FAILED';
  else if (ps[0]) status = 'PENDING';
  await tx`UPDATE service_requests SET payment_status = ${status}, updated_at = now() WHERE id = ${requestId}`;
  return status;
}

export async function createPaymentForRequest(requestId: string, createdBy: string) {
  const r = (await sql`SELECT r.*, c.phone, c.name AS cname, c.email FROM service_requests r JOIN customers c ON c.id = r.customer_id WHERE r.id = ${requestId}`)[0];
  if (!r) throw notFound();
  const amount = Number(r.final_amount ?? r.quoted_amount ?? 0);
  if (amount <= 0) throw bad('Nothing to charge');
  const paid = await sql`SELECT 1 FROM payments WHERE request_id = ${requestId} AND status = 'PAID'`;
  if (paid[0]) throw conflict('This request is already paid');
  await sql`UPDATE payments SET status = 'CANCELLED', updated_at = now() WHERE request_id = ${requestId} AND status IN ('CREATED','PENDING','FAILED')`;
  const provider = razorpayConfigured() ? 'razorpay' : 'sandbox';
  const p = (await sql`INSERT INTO payments (request_id, amount, status, provider, created_by)
                       VALUES (${requestId}, ${amount}, 'CREATED', ${provider}, ${createdBy}) RETURNING *`)[0];
  let link: string | null = null;
  let orderId: string | null = null;
  let failure: string | null = null;
  const track = `${baseUrl()}/track/${r.request_number}?t=${r.tracking_token}`;
  if (provider === 'razorpay') {
    try {
      const res = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: { authorization: rzpAuth(), 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(amount * 100), currency: 'INR', reference_id: p.id,
          description: `ChampOnCall companion service ${r.request_number}`,
          customer: { name: r.cname || undefined, contact: r.phone, email: r.email || undefined },
          notify: { sms: false, email: false }, reminder_enable: true,
          notes: { payment_id: p.id, request_number: r.request_number },
          callback_url: `${track}&view=summary`, callback_method: 'get',
        }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.description || 'Razorpay error');
      link = data.short_url;
      orderId = data.id;
    } catch (e: any) {
      failure = `Gateway unavailable: ${e.message}`; // preserve booking, keep payment pending (FRD §46)
    }
  } else {
    link = `${baseUrl()}/pay/${p.id}?t=${r.tracking_token}`;
    orderId = 'order_sbx_' + crypto.randomBytes(7).toString('hex');
  }
  const upd = (await sql`UPDATE payments SET status = 'PENDING', payment_link_url = ${link}, provider_order_id = ${orderId}, failure_reason = ${failure}, updated_at = now()
                          WHERE id = ${p.id} RETURNING *`)[0];
  await syncRequestPaymentStatus(requestId);
  if (failure) await alertOps(requestId, 'payment_link_failed', `${r.request_number}: payment link could not be created`, failure + ' – regenerate the link or collect manually', 'WARNING');
  return upd;
}

export function signSandbox(raw: string) {
  return crypto.createHmac('sha256', SANDBOX_SECRET).update(raw).digest('hex');
}

/** Webhook processor. Idempotent on provider event id. */
export async function processPaymentWebhook(raw: string, signature: string | null, eventId: string | null) {
  const secret = webhookSecret();
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const valid = !!signature && signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  let payload: any;
  try { payload = JSON.parse(raw); } catch { throw bad('Invalid JSON'); }
  const evId = eventId || payload.id || crypto.createHash('sha256').update(raw).digest('hex');
  const dupe = await sql`SELECT id FROM payment_events WHERE provider_event_id = ${evId}`;
  if (dupe[0]) return { ok: true, duplicate: true };

  const ent = payload.payload || {};
  const pl = ent.payment_link?.entity;
  const pay = ent.payment?.entity;
  const refund = ent.refund?.entity;
  const paymentId: string | null = pl?.reference_id || pay?.notes?.payment_id || refund?.notes?.payment_id || null;
  const p = paymentId && /^[0-9a-f-]{36}$/.test(paymentId) ? (await sql`SELECT * FROM payments WHERE id = ${paymentId}`)[0] : null;
  await sql`INSERT INTO payment_events (payment_id, provider_event_id, event_type, signature_valid, payload)
            VALUES (${p?.id ?? null}, ${evId}, ${payload.event || 'unknown'}, ${valid}, ${sql.json(payload)})`;
  if (!valid) throw bad('Invalid signature');
  if (!p) return { ok: true, ignored: true };

  let newStatus: string | null = null;
  const event: string = payload.event;
  if (event === 'payment_link.paid' || event === 'payment.captured' || event === 'order.paid') newStatus = 'PAID';
  else if (event === 'payment.authorized') newStatus = 'AUTHORIZED';
  else if (event === 'payment.failed') newStatus = 'FAILED';
  if (!newStatus) return { ok: true, ignored: true };
  if (p.status === 'PAID' || p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED') return { ok: true, alreadyFinal: true };

  await sql.begin(async (tx: any) => {
    await tx`UPDATE payments SET status = ${newStatus}, provider_payment_id = COALESCE(${pay?.id ?? null}, provider_payment_id),
              method = COALESCE(${pay?.method ?? null}, method), failure_reason = ${newStatus === 'FAILED' ? pay?.error_description || 'Payment failed' : null},
              paid_at = ${newStatus === 'PAID' ? new Date() : null}, updated_at = now() WHERE id = ${p.id}`;
    const st = await syncRequestPaymentStatus(p.request_id, tx);
    await insertEvent(tx, p.request_id, {
      type: newStatus === 'PAID' ? 'payment_received' : newStatus === 'FAILED' ? 'payment_failed' : 'payment_authorized',
      label: newStatus === 'PAID' ? 'Payment received' : newStatus === 'FAILED' ? 'Payment failed' : 'Payment authorized',
      actor: { type: 'gateway', id: null, name: p.provider === 'razorpay' ? 'Razorpay' : 'Payment gateway (sandbox)' },
      metadata: { payment_id: p.id, amount: p.amount, method: pay?.method, request_payment_status: st },
      customerVisible: newStatus === 'PAID',
    });
    await audit(null, 'payment.webhook', 'payment', p.id, `Webhook ${event} → ${newStatus}`, { status: p.status }, { status: newStatus }, tx);
  });
  if (newStatus === 'PAID') await notifyCustomer(p.request_id, 'payment_received', 'payment_received', { amount: '₹' + Number(p.amount).toLocaleString('en-IN') });
  if (newStatus === 'FAILED') await alertOps(p.request_id, 'payment_failed', 'Payment failed', `Payment of ₹${p.amount} failed – follow up with the customer`, 'WARNING');
  return { ok: true, status: newStatus };
}

/** Sandbox checkout: simulates the gateway calling our webhook (signed). */
export async function sandboxCheckout(paymentId: string, token: string, method: string, outcome: 'success' | 'failure') {
  const p = (await sql`SELECT p.*, r.tracking_token FROM payments p JOIN service_requests r ON r.id = p.request_id WHERE p.id = ${paymentId}`)[0];
  if (!p || p.tracking_token !== token) throw notFound('Payment not found');
  if (p.provider !== 'sandbox') throw bad('This payment uses the live gateway');
  if (p.status === 'PAID') return { ok: true, status: 'PAID' };
  if (p.status === 'CANCELLED') throw conflict('This payment link is no longer valid – please use the latest link.');
  const payId = 'pay_sbx_' + crypto.randomBytes(7).toString('hex');
  const body = JSON.stringify({
    entity: 'event', event: outcome === 'success' ? 'payment_link.paid' : 'payment.failed', created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment_link: { entity: { id: p.provider_order_id, reference_id: p.id, status: outcome === 'success' ? 'paid' : 'created' } },
      payment: { entity: { id: payId, amount: Math.round(Number(p.amount) * 100), currency: 'INR', method, status: outcome === 'success' ? 'captured' : 'failed',
        error_description: outcome === 'failure' ? 'Payment declined by bank (sandbox)' : null, notes: { payment_id: p.id } } },
    },
  });
  return processPaymentWebhook(body, signSandbox(body), 'evt_sbx_' + crypto.randomBytes(8).toString('hex'));
}

export async function markPaidManually(ctx: Ctx, paymentId: string, method: string, reference: string) {
  const p = (await sql`SELECT * FROM payments WHERE id = ${paymentId}`)[0];
  if (!p) throw notFound();
  if (!['CREATED', 'PENDING', 'FAILED'].includes(p.status)) throw conflict(`Payment is ${p.status}`);
  await sql.begin(async (tx: any) => {
    await tx`UPDATE payments SET status = 'PAID', method = ${method}, provider_payment_id = ${reference}, paid_at = now(), updated_at = now() WHERE id = ${p.id}`;
    await syncRequestPaymentStatus(p.request_id, tx);
    await insertEvent(tx, p.request_id, { type: 'payment_received', label: 'Payment received', actor: { type: 'ops', id: ctx.user!.id, name: ctx.user!.name }, notes: `Manual: ${method} ${reference}`, metadata: { payment_id: p.id } });
    await audit(ctx, 'payment.mark_paid', 'payment', p.id, `Marked paid manually via ${method} (${reference})`, { status: p.status }, { status: 'PAID' }, tx);
  });
  await notifyCustomer(p.request_id, 'payment_received', 'payment_received', { amount: '₹' + Number(p.amount).toLocaleString('en-IN') });
}

export async function refundPayment(ctx: Ctx, paymentId: string, amount: number, reason: string) {
  const p = (await sql`SELECT * FROM payments WHERE id = ${paymentId}`)[0];
  if (!p) throw notFound();
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(p.status)) throw conflict('Only paid payments can be refunded');
  const remaining = Number(p.amount) - Number(p.refunded_amount);
  if (!(amount > 0) || amount > remaining + 0.001) throw bad(`Refund must be between ₹1 and ₹${remaining}`);
  let providerRefundId = 'rfnd_sbx_' + crypto.randomBytes(6).toString('hex');
  if (p.provider === 'razorpay' && p.provider_payment_id) {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${p.provider_payment_id}/refund`, {
      method: 'POST', headers: { authorization: rzpAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(amount * 100), notes: { reason, payment_id: p.id } }),
    });
    const data: any = await res.json();
    if (!res.ok) throw bad(data?.error?.description || 'Refund failed at gateway');
    providerRefundId = data.id;
  }
  const total = Number(p.refunded_amount) + amount;
  const status = total >= Number(p.amount) - 0.001 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  await sql.begin(async (tx: any) => {
    await tx`INSERT INTO refunds (payment_id, amount, reason, provider_refund_id, created_by) VALUES (${p.id}, ${amount}, ${reason}, ${providerRefundId}, ${ctx.user!.name})`;
    await tx`UPDATE payments SET refunded_amount = ${total}, status = ${status}, updated_at = now() WHERE id = ${p.id}`;
    await syncRequestPaymentStatus(p.request_id, tx);
    await insertEvent(tx, p.request_id, { type: 'refund_issued', label: `Refund issued ₹${amount}`, actor: { type: 'ops', id: ctx.user!.id, name: ctx.user!.name }, notes: reason, metadata: { payment_id: p.id } });
    await audit(ctx, 'payment.refund', 'payment', p.id, `Refunded ₹${amount}: ${reason}`, { status: p.status, refunded: p.refunded_amount }, { status, refunded: total }, tx);
  });
}

export { syncRequestPaymentStatus };
