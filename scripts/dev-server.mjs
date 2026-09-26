// Local server: serves public/ with SPA fallback and routes /api/* to the same handler Vercel runs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };
let api;
async function loadApi() {
  api = await import(path.join(root, 'api/index.js') + '?v=' + fs.statSync(path.join(root, 'api/index.js')).mtimeMs);
}
await loadApi();

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
    const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const fn = api[req.method] || api.GET;
    const r = await fn(request);
    const hs = {};
    r.headers.forEach((v, k) => { if (k !== 'set-cookie') hs[k] = v; });
    const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (cookies.length) hs['set-cookie'] = cookies;
    res.writeHead(r.status, hs);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let file = path.join(root, 'public', decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(root, 'public'))) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'public/index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Medical Champion running on http://localhost:${port}`));
