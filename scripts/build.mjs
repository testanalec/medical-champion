// Builds the API bundle (api/index.js) and the SPA (public/assets). Output is committed so Vercel needs no install step.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH || '/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild');
const TAILWIND = process.env.TAILWIND_BIN || '/home/claude/tools/tailwindcss';
const watch = process.argv.includes('--watch');
const prod = !watch;

const server = {
  entryPoints: [path.join(root, 'src/server/index.ts')],
  outfile: path.join(root, 'api/index.js'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  sourcemap: false, minify: true, keepNames: true, logLevel: 'info', legalComments: 'none',
};
const client = {
  entryPoints: [path.join(root, 'src/client/main.tsx')],
  outfile: path.join(root, 'public/assets/app.js'),
  bundle: true, platform: 'browser', format: 'esm', target: ['es2020', 'safari15'],
  jsx: 'automatic', minify: prod, sourcemap: !prod, logLevel: 'info', legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
  nodePaths: [path.join(root, 'node_modules')],
};
const css = () => execFileSync(TAILWIND, ['-i', path.join(root, 'src/client/styles.css'), '-o', path.join(root, 'public/assets/app.css'), ...(prod ? ['--minify'] : [])], { cwd: root, stdio: 'inherit' });

if (watch) {
  const s = await esbuild.context(server); await s.watch();
  const c = await esbuild.context(client); await c.watch();
  const { spawn } = await import('node:child_process');
  spawn(TAILWIND, ['-i', 'src/client/styles.css', '-o', 'public/assets/app.css', '--watch=always'], { cwd: root, stdio: 'inherit' });
} else {
  await esbuild.build(server);
  await esbuild.build(client);
  css();
  // cache-busting version for the HTML pages and service worker
  const v = Date.now().toString(36);
  await prerender(v);
  const sw = fs.readFileSync(path.join(root, 'src/client/sw.js'), 'utf8').replaceAll('__V__', v);
  fs.writeFileSync(path.join(root, 'public/sw.js'), sw);
  console.log('build ok', v);
}

// ---------------------------------------------------------------- static HTML for search engines & link previews
// Every public page is rendered to its own HTML file with its own title, description, canonical, Open Graph tags
// (and schema.org markup on the home page). Unknown URLs get public/404.html with a real 404 status (see vercel.json).
async function prerender(v) {
  const os = await import('node:os');
  const out = path.join(os.tmpdir(), `mc-prerender-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(root, 'src/client/prerender.tsx')], outfile: out,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', jsx: 'automatic', logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: [path.join(root, 'node_modules')],
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  });
  const pre = await import(out);
  fs.rmSync(out, { force: true });

  // Live public config (prices, phone numbers) when reachable, otherwise the committed snapshot
  let config = null;
  if (!process.env.PRERENDER_OFFLINE) {
    try {
      const r = await fetch(`${pre.SITE_URL}/api/v1/public/config`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) config = await r.json();
    } catch { /* offline build */ }
  }
  if (!config?.brand || !Array.isArray(config.pricing) || !config.pricing.length) {
    config = JSON.parse(fs.readFileSync(path.join(root, 'scripts/site-config.json'), 'utf8'));
    console.log('prerender: using scripts/site-config.json');
  } else console.log('prerender: using live config');
  config = { ...config, demo_accounts: [] };

  const tpl = fs.readFileSync(path.join(root, 'src/client/index.html'), 'utf8').replaceAll('__V__', v);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  const page = ({ title, description, canonical, robots, schema = [], body = '' }) => {
    const h = [`  <meta name="robots" content="${robots}" />`];
    if (canonical) h.push(`  <link rel="canonical" href="${esc(canonical)}" />`, `  <meta property="og:url" content="${esc(canonical)}" />`);
    h.push(
      `  <meta property="og:type" content="website" />`,
      `  <meta property="og:site_name" content="ChampOnCall" />`,
      `  <meta property="og:locale" content="en_IN" />`,
      `  <meta property="og:title" content="${esc(title)}" />`,
      `  <meta property="og:description" content="${esc(description)}" />`,
      `  <meta property="og:image" content="${pre.OG_IMAGE}" />`,
      `  <meta property="og:image:type" content="image/png" />`,
      `  <meta property="og:image:width" content="1200" />`,
      `  <meta property="og:image:height" content="630" />`,
      `  <meta property="og:image:alt" content="ChampOnCall — trusted hospital companions for your parents in Gurugram" />`,
      `  <meta name="twitter:card" content="summary_large_image" />`,
      `  <meta name="twitter:title" content="${esc(title)}" />`,
      `  <meta name="twitter:description" content="${esc(description)}" />`,
      `  <meta name="twitter:image" content="${pre.OG_IMAGE}" />`,
    );
    for (const s of schema) h.push(`  <script type="application/ld+json">${json(s)}</script>`);
    h.push(`  <script>window.__MC_CONFIG__=${json(config)}</script>`);
    return tpl.replace('__TITLE__', () => esc(title)).replace('__DESC__', () => esc(description))
      .replace('__HEAD__', () => h.join('\n')).replace('__BODY__', () => body);
  };
  const write = (file, html) => fs.writeFileSync(path.join(root, 'public', file), html);

  for (const p of pre.PUBLIC_PAGES) {
    const file = p.path === '/' ? 'index.html' : `${p.path.slice(1)}.html`;
    write(file, page({
      title: p.title, description: p.description, canonical: pre.SITE_URL + p.path, robots: 'index,follow',
      schema: pre.schemaFor(p.path, config), body: pre.renderPage(p.path, config),
    }));
  }
  // App shell for Ops, the Champ app, tracking and payment links — never indexed
  write('app.html', page({ title: 'ChampOnCall', description: 'ChampOnCall', robots: 'noindex,nofollow' }));
  write('404.html', page({ title: pre.NOT_FOUND_META.title, description: pre.NOT_FOUND_META.description, robots: 'noindex', body: pre.renderPage('/404', config) }));

  write('robots.txt', [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/', 'Disallow: /ops', 'Disallow: /companion', 'Disallow: /track/', 'Disallow: /pay/', 'Disallow: /whatsapp', 'Disallow: /demo',
    '',
    `Sitemap: ${pre.SITE_URL}/sitemap.xml`,
    '',
  ].join('\n'));
  const today = new Date().toISOString().slice(0, 10);
  write('sitemap.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pre.PUBLIC_PAGES.map((p) => `  <url><loc>${pre.SITE_URL}${p.path}</loc><lastmod>${today}</lastmod><priority>${p.priority.toFixed(1)}</priority></url>`),
    '</urlset>',
    '',
  ].join('\n'));
  console.log(`prerender: ${pre.PUBLIC_PAGES.length} pages + app.html, 404.html, robots.txt, sitemap.xml`);
}
