import { sql } from '../db';
import { Ctx, bad, str, num, notFound } from '../http';
import { audit, actorOf } from '../auth';
import { insertEvent } from '../lifecycle';
import { alertOps } from '../notifications';
import { getSetting } from '../settings';
import { INCIDENT_SEVERITIES } from '../../shared/constants';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const MAX_BYTES = 3 * 1024 * 1024;

export async function withIdempotency<T>(key: string | null | undefined, scope: string, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const k = `${scope}:${String(key).slice(0, 100)}`;
  const existing = (await sql`SELECT response FROM idempotency_keys WHERE key = ${k}`)[0];
  if (existing) return existing.response as T;
  const res = await fn();
  await sql`INSERT INTO idempotency_keys (key, scope, response) VALUES (${k}, ${scope}, ${sql.json(res ?? null)}) ON CONFLICT DO NOTHING`;
  return res;
}

/** Secure upload handling: type allow-list, size limit, magic-byte sniffing, stored privately. */
export async function saveUpload(ctx: Ctx, file: any, purpose: string): Promise<string | null> {
  if (!file?.data) return null;
  const mime = String(file.mime || '').toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) throw bad('Receipt must be a JPG, PNG, WEBP, HEIC or PDF file');
  const b64 = String(file.data).replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0 || buf.length > MAX_BYTES) throw bad('Receipt must be smaller than 3 MB');
  const sig = buf.subarray(0, 12).toString('hex');
  const ok =
    (mime === 'image/jpeg' && sig.startsWith('ffd8ff')) ||
    (mime === 'image/png' && sig.startsWith('89504e47')) ||
    (mime === 'image/webp' && buf.subarray(8, 12).toString() === 'WEBP') ||
    (mime === 'application/pdf' && buf.subarray(0, 4).toString() === '%PDF') ||
    mime === 'image/heic';
  if (!ok) throw bad('The file content does not match its type');
  const a = actorOf(ctx);
  const row = (await sql`INSERT INTO files (purpose, mime, size, filename, data, uploaded_by_type, uploaded_by_id)
    VALUES (${purpose}, ${mime}, ${buf.length}, ${str(file.name, 120)}, ${buf}, ${a.type}, ${a.id}) RETURNING id`)[0];
  return row.id;
}

export async function createExpense(ctx: Ctx, requestId: string, b: any) {
  return withIdempotency(b.idempotency_key, 'expense', async () => {
    const r = (await sql`SELECT id, request_number, current_status FROM service_requests WHERE id = ${requestId}`)[0];
    if (!r) throw notFound();
    const cats = (await getSetting('lists')).expense_categories as string[];
    const category = str(b.category, 60);
    if (!category || !cats.includes(category)) throw bad('Choose an expense category');
    const amount = num(b.amount);
    if (!amount || amount <= 0 || amount > 50000) throw bad('Enter a valid amount');
    const fileId = await saveUpload(ctx, b.receipt, 'expense_receipt');
    const a = actorOf(ctx);
    const e = (await sql`INSERT INTO expenses (request_id, category, amount, description, receipt_file_id, bill_to_customer, submitted_by_type, submitted_by_id, submitted_by_name, approval_status, reviewed_by, reviewed_at)
      VALUES (${r.id}, ${category}, ${amount}, ${str(b.description, 300)}, ${fileId}, ${b.bill_to_customer !== false}, ${a.type}, ${a.id}, ${a.name},
              ${ctx.user && b.auto_approve ? 'APPROVED' : 'PENDING'}, ${ctx.user && b.auto_approve ? a.name : null}, ${ctx.user && b.auto_approve ? new Date() : null})
      RETURNING *`)[0];
    await sql.begin((tx: any) => insertEvent(tx, r.id, { type: 'expense_recorded', label: `Expense recorded: ${category} ₹${amount}`, actor: a, customerVisible: false, notes: e.description }));
    await audit(ctx, 'expense.create', 'expense', e.id, `${r.request_number}: ${category} ₹${amount}${fileId ? ' (receipt)' : ''}`);
    return e;
  });
}

export async function createIncident(ctx: Ctx, requestId: string | null, b: any) {
  return withIdempotency(b.idempotency_key, 'incident', async () => {
    const cats = (await getSetting('lists')).incident_categories as string[];
    const category = str(b.category, 60);
    if (!category || !cats.includes(category)) throw bad('Choose an incident category');
    const severity = INCIDENT_SEVERITIES.includes(b.severity) ? b.severity : 'MEDIUM';
    const description = str(b.description, 2000);
    if (!description) throw bad('Please describe what happened');
    const a = actorOf(ctx);
    let reqRow: any = null;
    if (requestId) {
      reqRow = (await sql`SELECT id, request_number, assigned_companion_id FROM service_requests WHERE id = ${requestId} OR request_number = ${requestId}`)[0];
      if (!reqRow) throw notFound('Request not found');
    }
    const n = (await sql`SELECT nextval('incident_number_seq') AS n`)[0].n;
    const i = (await sql`INSERT INTO incidents (incident_number, request_id, companion_id, severity, category, description, reporter_type, reporter_id, reporter_name, escalation)
      VALUES (${'INC-' + n}, ${reqRow?.id ?? null}, ${ctx.companion?.id ?? reqRow?.assigned_companion_id ?? null}, ${severity}, ${category}, ${description}, ${a.type}, ${a.id}, ${a.name}, ${str(b.escalation, 500)})
      RETURNING *`)[0];
    if (reqRow) {
      await sql`UPDATE service_requests SET incident_flag = true, emergency_review = emergency_review OR ${category === 'Patient health deterioration' || category === 'Fall/injury'} WHERE id = ${reqRow.id}`;
      await sql.begin((tx: any) => insertEvent(tx, reqRow.id, { type: 'incident_opened', label: `Incident ${i.incident_number} (${severity})`, actor: a, customerVisible: false, notes: `${category}: ${description}` }));
    }
    await audit(ctx, 'incident.create', 'incident', i.id, `${i.incident_number} ${severity} ${category}`);
    const sev = severity === 'CRITICAL' ? 'CRITICAL' : severity === 'HIGH' ? 'URGENT' : 'WARNING';
    await alertOps(reqRow?.id ?? null, 'incident', `${severity === 'CRITICAL' ? '🚨 CRITICAL ' : ''}Incident ${i.incident_number}${reqRow ? ' on ' + reqRow.request_number : ''}`, `${category} – ${description.slice(0, 160)} (by ${a.name})`, sev as any);
    return i;
  });
}
