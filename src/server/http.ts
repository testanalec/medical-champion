import { sql } from './db';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: any;
  constructor(status: number, message: string, code = 'error', details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const bad = (msg: string, details?: any) => new HttpError(400, msg, 'bad_request', details);
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'not_found');
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg, 'forbidden');
export const unauthorized = (msg = 'Please sign in') => new HttpError(401, msg, 'unauthorized');
export const conflict = (msg: string, details?: any) => new HttpError(409, msg, 'conflict', details);

export interface Ctx {
  req: Request;
  url: URL;
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  rawBody: string;
  body: any;
  cookies: Record<string, string>;
  setCookies: string[];
  user?: AuthUser;
  companion?: AuthCompanion;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role_id: string;
  role_name: string;
  permissions: string[];
}
export interface AuthCompanion {
  id: string;
  code: string;
  name: string;
  phone: string;
}

type Handler = (ctx: Ctx) => Promise<any> | any;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  routes: Route[] = [];
  add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/\//g, '\\/').replace(/:(\w+)/g, (_m, k) => {
          keys.push(k);
          return '([^\\/]+)';
        }) +
        '\\/?$',
    );
    this.routes.push({ method, pattern, keys, handler });
  }
  get(p: string, h: Handler) { this.add('GET', p, h); }
  post(p: string, h: Handler) { this.add('POST', p, h); }
  patch(p: string, h: Handler) { this.add('PATCH', p, h); }
  put(p: string, h: Handler) { this.add('PUT', p, h); }
  delete(p: string, h: Handler) { this.add('DELETE', p, h); }
  match(method: string, path: string) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return { route: null, params: {}, pathMatched };
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name: string, value: string, opts: { maxAge?: number; secure?: boolean } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Simple fixed-window rate limiter stored in Postgres (works across serverless instances). */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const rows = await sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`;
  if (rows[0].count > limit) {
    throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', 'rate_limited');
  }
}

export function str(v: any, max = 500): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}
export function req<T>(v: T | null | undefined, name: string): T {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) throw bad(`${name} is required`);
  return v;
}
export function num(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  let d = String(p).replace(/[^\d]/g, '');
  if (d.length === 10) d = '91' + d;
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  if (d.length < 10 || d.length > 15) return null;
  return '+' + d;
}
