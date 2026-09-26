import { ready } from './db';
import { Router, Ctx, HttpError, parseCookies, json } from './http';
import { loadAuth } from './auth';
import { registerPublic } from './routes/public';
import { registerOps } from './routes/ops';
import { registerCompanion } from './routes/companion';
import { registerAdmin } from './routes/admin';

const router = new Router();
registerPublic(router);
registerOps(router);
registerCompanion(router);
registerAdmin(router);

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};
const WEBHOOKS = ['/api/v1/whatsapp/webhook', '/api/v1/payments/webhook'];

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Vercel rewrite /api/:path* → /api/index?__p=:path* (in case the original path isn't preserved)
  if (url.pathname.replace(/\/$/, '') === '/api/index' || url.searchParams.has('__p')) {
    const p = url.searchParams.get('__p');
    if (p != null && url.pathname.replace(/\/$/, '') === '/api/index') url.pathname = '/api/' + p.replace(/^\/+/, '');
    url.searchParams.delete('__p');
  }
  const method = req.method.toUpperCase();
  const started = Date.now();
  if (!globalThis.__mcOrigin && !/localhost|127\.0\.0\.1/.test(url.host)) globalThis.__mcOrigin = `${url.protocol}//${url.host}`;
  if (!globalThis.__mcOrigin) globalThis.__mcOrigin = `${url.protocol}//${url.host}`;
  const ctx: Ctx = {
    req, url, method, params: {}, query: url.searchParams,
    ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local',
    rawBody: '', body: {}, cookies: parseCookies(req.headers.get('cookie')), setCookies: [],
  };
  let res: Response;
  try {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    const { route, params, pathMatched } = router.match(method, url.pathname) as any;
    if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found');
    ctx.params = params;
    // CSRF defence in depth: state-changing cookie requests must be same-origin
    if (method !== 'GET' && !WEBHOOKS.includes(url.pathname)) {
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-origin request blocked');
    }
    if (method !== 'GET' && method !== 'HEAD') {
      const len = Number(req.headers.get('content-length') || 0);
      if (len > 6 * 1024 * 1024) throw new HttpError(413, 'Request too large');
      ctx.rawBody = await req.text();
      if (ctx.rawBody.length > 6 * 1024 * 1024) throw new HttpError(413, 'Request too large');
      if (ctx.rawBody) {
        try { ctx.body = JSON.parse(ctx.rawBody); } catch { throw new HttpError(400, 'Invalid JSON body'); }
      }
      if (typeof ctx.body !== 'object' || ctx.body === null) ctx.body = {};
    }
    await ready();
    await loadAuth(ctx);
    const out = await route.handler(ctx);
    res = out instanceof Response ? out : json(out ?? { ok: true });
  } catch (e: any) {
    if (e instanceof HttpError) {
      res = json({ error: e.message, code: e.code, details: e.details }, e.status);
    } else if (e?.code === '23505') {
      res = json({ error: 'This record already exists', code: 'duplicate' }, 409);
    } else if (e?.code === '22P02') {
      res = json({ error: 'Invalid identifier', code: 'bad_request' }, 400);
    } else {
      console.error('[api error]', method, url.pathname, e);
      res = json({ error: 'Something went wrong on our side. Our team has been notified.', code: 'server_error' }, 500);
    }
  }
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  for (const c of ctx.setCookies) headers.append('set-cookie', c);
  headers.set('server-timing', `app;dur=${Date.now() - started}`);
  return new Response(res.body, { status: res.status, headers });
}

// Vercel Node.js runtime – Web handler signature
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
