// Screenshot helper for visual QA: PAGES="/,/whatsapp" OUT=dir node scripts/shots.mjs
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const OUT = process.env.OUT || './shots';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];
async function page(vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${p.url()}: console ${m.text()}`); });
  return p;
}
const desk = await page({ width: 1440, height: 900 });
for (const path of (process.env.PAGES || '/,/whatsapp,/book,/demo').split(',')) {
  await desk.goto(BASE + path, { waitUntil: 'networkidle' });
  await desk.waitForTimeout(800);
  if (path === '/book') await desk.keyboard.press('Escape');
  await desk.screenshot({ path: `${OUT}/d${path.replace(/[\/?=&]/g, '_') || '_home'}.png`, fullPage: process.env.FULL === '1' });
}
if (process.env.MOBILE !== '0') {
  const mob = await page({ width: 390, height: 844 });
  await mob.goto(BASE + '/', { waitUntil: 'networkidle' });
  await mob.waitForTimeout(800);
  await mob.screenshot({ path: `${OUT}/m_home.png` });
}
console.log('errors:', JSON.stringify(errors, null, 1));
await browser.close();
