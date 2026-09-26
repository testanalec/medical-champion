import crypto from 'node:crypto';
import { sql } from './db';
import { Ctx, cookie, forbidden, unauthorized, HttpError, AuthUser } from './http';
import { getSetting } from './settings';

export const PERMISSIONS = [
  'request.view', 'request.create', 'request.edit', 'request.transition', 'request.cancel', 'request.escalate',
  'companion.view', 'companion.assign', 'companion.manage', 'companion.verify', 'companion.financial.view',
  'customer.view', 'customer.edit',
  'payment.view', 'payment.manage', 'payment.refund',
  'expense.create', 'expense.approve',
  'incident.create', 'incident.close',
  'notification.send',
  'pricing.edit', 'service_area.edit', 'settings.edit',
  'user.manage', 'report.view', 'report.export', 'audit.view', 'whatsapp.view', 'data.reset',
] as const;

export const ROLE_DEFS: { id: string; name: string; description: string; permissions: string[] }[] = [
  { id: 'super_admin', name: 'Super Admin', description: 'Full system access', permissions: [...PERMISSIONS] },
  {
    id: 'ops_manager', name: 'Operations Manager', description: 'Operations + reporting + configuration',
    permissions: PERMISSIONS.filter((p) => !['companion.financial.view', 'data.reset'].includes(p)),
  },
  {
    id: 'ops_agent', name: 'Operations Agent', description: 'Requests + dispatch',
    permissions: ['request.view', 'request.create', 'request.edit', 'request.transition', 'request.cancel', 'request.escalate',
      'companion.view', 'companion.assign', 'customer.view', 'customer.edit', 'payment.view', 'payment.manage',
      'expense.create', 'incident.create', 'notification.send', 'whatsapp.view'],
  },
  {
    id: 'finance', name: 'Finance', description: 'Payments, refunds, expenses and payouts',
    permissions: ['request.view', 'customer.view', 'companion.view', 'companion.financial.view', 'payment.view', 'payment.manage',
      'payment.refund', 'expense.approve', 'report.view', 'report.export'],
  },
  {
    id: 'support', name: 'Support', description: 'Customer support scope',
    permissions: ['request.view', 'customer.view', 'incident.create', 'notification.send', 'payment.view', 'whatsapp.view'],
  },
];

// ---------- hashing ----------
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(keyB64, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomDigits = (n: number) => {
  let s = '';
  for (let i = 0; i < n; i++) s += crypto.randomInt(0, 10);
  return s;
};

// ---------- sessions ----------
const USER_COOKIE = 'mc_ops';
const COMPANION_COOKIE = 'mc_cmp';
const isSecure = () => !!process.env.VERCEL;

export async function createSession(ctx: Ctx, type: 'user' | 'companion', id: string) {
  const token = randomToken();
  const hours = type === 'user' ? 12 : 72; // session expiration (FRD §37)
  await sql`INSERT INTO sessions (token_hash, subject_type, subject_id, expires_at, ip, user_agent)
            VALUES (${sha256(token)}, ${type}, ${id}, now() + make_interval(hours => ${hours}), ${ctx.ip}, ${ctx.req.headers.get('user-agent')?.slice(0, 200) ?? null})`;
  ctx.setCookies.push(cookie(type === 'user' ? USER_COOKIE : COMPANION_COOKIE, token, { maxAge: hours * 3600, secure: isSecure() }));
}

export async function destroySession(ctx: Ctx, type: 'user' | 'companion') {
  const name = type === 'user' ? USER_COOKIE : COMPANION_COOKIE;
  const token = ctx.cookies[name];
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  ctx.setCookies.push(cookie(name, '', { maxAge: 0, secure: isSecure() }));
}

export async function loadAuth(ctx: Ctx) {
  const ut = ctx.cookies[USER_COOKIE];
  if (ut) {
    const rows = await sql`
      SELECT u.id, u.name, u.email, u.role_id, r.name AS role_name, r.permissions
      FROM sessions s JOIN users u ON u.id = s.subject_id JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = ${sha256(ut)} AND s.subject_type = 'user' AND s.expires_at > now() AND u.active`;
    if (rows[0]) {
      ctx.user = rows[0];
      sql`UPDATE sessions SET last_seen_at = now() WHERE token_hash = ${sha256(ut)}`.catch(() => {});
    }
  }
  const ct = ctx.cookies[COMPANION_COOKIE];
  if (ct) {
    const rows = await sql`
      SELECT c.id, c.code, c.name, c.phone FROM sessions s JOIN companions c ON c.id = s.subject_id
      WHERE s.token_hash = ${sha256(ct)} AND s.subject_type = 'companion' AND s.expires_at > now() AND NOT c.suspended`;
    if (rows[0]) {
      ctx.companion = rows[0];
      sql`UPDATE companions SET last_seen_at = now() WHERE id = ${rows[0].id}`.catch(() => {});
    }
  }
}

export function requireUser(ctx: Ctx, ...perms: string[]): AuthUser {
  if (!ctx.user) throw unauthorized();
  for (const p of perms) if (!ctx.user.permissions.includes(p)) throw forbidden(`Missing permission: ${p}`);
  return ctx.user;
}
export const can = (ctx: Ctx, perm: string) => !!ctx.user?.permissions.includes(perm);

export function requireCompanion(ctx: Ctx) {
  if (!ctx.companion) throw unauthorized('Please sign in to the companion app');
  return ctx.companion;
}

export function actorOf(ctx: Ctx): { type: string; id: string | null; name: string } {
  if (ctx.user) return { type: 'ops', id: ctx.user.id, name: ctx.user.name };
  if (ctx.companion) return { type: 'companion', id: ctx.companion.id, name: ctx.companion.name };
  return { type: 'system', id: null, name: 'System' };
}

// ---------- OTP ----------
export async function issueOtp(phone: string, purpose: string) {
  const recent = await sql`SELECT count(*)::int AS n FROM otp_codes WHERE phone = ${phone} AND purpose = ${purpose} AND created_at > now() - interval '10 minutes'`;
  if (recent[0].n >= 5) throw new HttpError(429, 'Too many OTP requests. Please try again in a few minutes.', 'rate_limited');
  const code = randomDigits(6);
  const ttl = Number((await getSetting('security')).otp_ttl_seconds || 300);
  await sql`INSERT INTO otp_codes (phone, purpose, code_hash, expires_at)
            VALUES (${phone}, ${purpose}, ${sha256(phone + ':' + code)}, now() + make_interval(secs => ${ttl}))`;
  return { code, ttl };
}

export async function verifyOtp(phone: string, purpose: string, code: string) {
  const rows = await sql`SELECT * FROM otp_codes WHERE phone = ${phone} AND purpose = ${purpose} AND consumed_at IS NULL
                         ORDER BY created_at DESC LIMIT 1`;
  const otp = rows[0];
  if (!otp) throw new HttpError(400, 'Please request a new OTP', 'otp_invalid');
  if (new Date(otp.expires_at) < new Date()) throw new HttpError(400, 'OTP has expired. Please request a new one.', 'otp_expired');
  if (otp.attempts >= 5) throw new HttpError(400, 'Too many attempts. Please request a new OTP.', 'otp_locked');
  if (otp.code_hash !== sha256(phone + ':' + String(code).trim())) {
    await sql`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ${otp.id}`;
    throw new HttpError(400, 'Incorrect OTP', 'otp_invalid');
  }
  await sql`UPDATE otp_codes SET consumed_at = now() WHERE id = ${otp.id}`;
}

// ---------- audit ----------
export async function audit(
  ctx: Ctx | null,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  before?: any,
  after?: any,
  tx: any = sql,
) {
  const actor = ctx ? actorOf(ctx) : { type: 'system', id: null, name: 'System' };
  await tx`INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, entity_type, entity_id, summary, before, after, ip)
           VALUES (${actor.type}, ${actor.id}, ${actor.name}, ${action}, ${entityType}, ${entityId}, ${summary},
                   ${before ? tx.json(before) : null}, ${after ? tx.json(after) : null}, ${ctx?.ip ?? null})`;
}
