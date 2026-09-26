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
  // cache-busting version for index.html
  const v = Date.now().toString(36);
  const html = fs.readFileSync(path.join(root, 'src/client/index.html'), 'utf8').replaceAll('__V__', v);
  fs.writeFileSync(path.join(root, 'public/index.html'), html);
  const sw = fs.readFileSync(path.join(root, 'src/client/sw.js'), 'utf8').replaceAll('__V__', v);
  fs.writeFileSync(path.join(root, 'public/sw.js'), sw);
  console.log('build ok', v);
}
