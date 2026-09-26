// Browser end-to-end test of the FRD §54 acceptance flow across website/WhatsApp, Operations and Companion apps.
// BASE=http://localhost:3000 OUT=./shots node scripts/e2e.mjs
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || './shots';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch();
async function ctx(vp) {
  const c = await browser.newContext({ viewport: vp, geolocation: { latitude: 28.465, longitude: 77.073 }, permissions: ['geolocation'] });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[pageerror] ${p.url()} ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && !m.text().includes('Failed to load resource')) errors.push(`[console] ${p.url()} ${m.text()}`); });
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`[5xx] ${r.url()} ${r.status()}`); });
  c.on('page', (np) => np.close().catch(() => {})); // ignore navigation popups (Google Maps)
  return p;
}
const step = (m) => console.log('•', m);
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

// ---------- 1-4 customer books on WhatsApp
const cust = await ctx({ width: 1280, height: 860 });
await cust.goto(BASE + '/');
await cust.getByTestId('wa-cta').first().click();
await cust.getByText('CONTINUE WITH COMPANION REQUEST').click();
await cust.waitForURL('**/whatsapp**');
const phone = '98' + String(Date.now()).slice(-8);
await cust.getByTestId('sim-phone').fill(phone);
await cust.getByTestId('sim-name').fill('Rahul Kumar');
await cust.getByText('Start chat').click();
const tap = async (id) => { await cust.getByTestId(id).last().click(); await cust.waitForTimeout(250); };
const waitFor = async (text) => cust.getByTestId('sim-messages').getByText(text).last().waitFor({ timeout: 15000 });
await waitFor("We're here when you can't be.");
await tap('btn-help_now'); await waitFor('Is this a medical emergency?');
await tap('btn-continue'); await waitFor('Who needs assistance?');
await tap('btn-list'); await tap('row-rel_mother'); await waitFor('name and age');
await cust.getByTestId('sim-input').fill('Kamla Devi, 74'); await cust.getByTestId('sim-input').press('Enter');
await waitFor('Please share their location.');
await cust.getByTestId('sim-location').click(); await cust.getByTestId('place-Sushant Lok 1').click();
await waitFor('What kind of help');
await tap('btn-list'); await tap('row-hospital_opd'); await waitFor('When do you need');
await tap('btn-list'); await tap('row-t_asap'); await waitFor('walk independently');
await tap('btn-m_some'); await waitFor('Which hospital');
await tap('btn-list'); await tap('row-dest_0'); await waitFor('Anything important');
await cust.getByTestId('sim-input').fill('Uses a walker. Hard of hearing.'); await cust.getByTestId('sim-input').press('Enter');
await waitFor('What is *your* name').catch(() => waitFor('your'));
await cust.waitForTimeout(600);
await tap('btn-use_profile'); await waitFor('Please confirm your request');
await shot(cust, 'e2e_01_whatsapp_confirm');
await tap('btn-confirm');
await waitFor('Request ID');
const reqText = await cust.getByTestId('sim-messages').getByText(/Request ID/).last().innerText();
const rn = reqText.match(/MC-\d+/)[0];
step(`WhatsApp booking created ${rn}`);
await shot(cust, 'e2e_02_whatsapp_created');

// ---------- 5-7 operations
const ops = await ctx({ width: 1440, height: 900 });
await ops.goto(BASE + '/ops/login');
await ops.getByTestId('login-email').fill('agent@medicalchampion.in');
await ops.getByTestId('login-password').fill('Agent@123');
await ops.getByTestId('login-submit').click();
await ops.getByTestId(`card-${rn}`).waitFor({ timeout: 15000 });
await shot(ops, 'e2e_03_ops_board');
step('request visible on live board');
await ops.getByTestId(`card-${rn}`).click();
await ops.getByTestId('req-number').waitFor();
await ops.getByTestId('confirm-btn').click();
await ops.getByText('Operations confirmed – finding companion').first().waitFor();
await ops.getByTestId('assign-btn').click();
await ops.getByTestId('assign-CMP-101').waitFor();
await shot(ops, 'e2e_04_ops_dispatch');
await ops.getByTestId('assign-CMP-101').click();
await ops.getByText('Offer pending').waitFor();
const bookingCode = (await ops.getByTestId('booking-code').innerText()).trim();
step(`assigned to Amit, booking code ${bookingCode}`);

// ---------- 8-17 companion
const cmp = await ctx({ width: 390, height: 844 });
await cmp.goto(BASE + '/companion');
await cmp.getByTestId('cmp-phone').fill('7000000101');
await cmp.getByTestId('cmp-send-otp').click();
const otp = (await cmp.getByTestId('cmp-demo-otp').innerText()).trim();
await cmp.getByTestId('cmp-otp').fill(otp);
await cmp.getByTestId('cmp-verify').click();
await cmp.getByTestId('offer-card').waitFor({ timeout: 15000 });
await shot(cmp, 'e2e_05_cmp_offer');
await cmp.getByTestId('accept-btn').click();
await cmp.getByTestId('primary-action').waitFor();
step('companion accepted');
await waitFor('Companion Assigned');
const primary = async (label) => {
  const b = cmp.getByTestId('primary-action');
  await b.getByText(label).waitFor({ timeout: 10000 });
  await b.click();
  await cmp.waitForTimeout(900);
};
await primary('START NAVIGATION');
await primary('ARRIVED');
await shot(cmp, 'e2e_06_cmp_with_patient');
await cmp.getByTestId('primary-action').getByText('VERIFY PATIENT').waitFor();
await cmp.getByTestId('primary-action').click();
await cmp.getByTestId('verify-code').fill(bookingCode);
await cmp.getByTestId('verify-submit').click();
await cmp.waitForTimeout(900);
await primary('START SERVICE');
await primary('LEAVING HOME');
await primary('REACHED HOSPITAL');
await cmp.getByTestId('act-registration_completed').click(); await cmp.waitForTimeout(700);
await cmp.getByTestId('act-consultation_underway').click(); await cmp.waitForTimeout(700);
// expense with receipt photo
await cmp.getByTestId('add-expense').click();
await cmp.getByTestId('expense-amount').fill('240');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
await cmp.getByTestId('expense-file').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
await cmp.getByTestId('expense-submit').click();
await cmp.getByText('Expense submitted for approval').waitFor();
await shot(cmp, 'e2e_07_cmp_at_hospital');
await cmp.getByTestId('act-returning').click(); await cmp.waitForTimeout(900);
await primary('PARENT HOME');
await primary('HANDOVER DONE');
await cmp.getByTestId('complete-btn').click();
await cmp.getByRole('button', { name: 'Parent returned home' }).click();
await cmp.getByTestId('complete-submit').click();
await cmp.getByText(/Job completed/).first().waitFor();
await shot(cmp, 'e2e_08_cmp_done');
step('companion completed the job');

// ---------- 18-22 customer completion, payment, rating
await waitFor('Service Completed');
await waitFor('Reached Hospital');
await shot(cust, 'e2e_09_whatsapp_updates');
const payLink = await cust.getByTestId('sim-messages').getByRole('link', { name: 'Pay Now' }).last().getAttribute('href');
await cust.goto(payLink.startsWith('http') ? payLink : BASE + payLink);
await cust.getByTestId('pay-submit').click();
await cust.getByTestId('pay-success').waitFor();
await shot(cust, 'e2e_10_paid');
step('payment captured');
await cust.getByText('Rate your experience').first().click();
await cust.getByTestId('star-5').click();
await cust.getByTestId('trust-yes').click();
await cust.getByTestId('rate-submit').click();
await cust.getByText('Thank you for your feedback').waitFor();
await cust.getByTestId('track-status').waitFor();
await shot(cust, 'e2e_11_track_summary');
step('rated 5★ + trust yes');

// ---------- 23-24 ops timeline + reporting + every ops screen
await ops.reload();
await ops.getByTestId('timeline').waitFor();
const tl = await ops.getByTestId('timeline').innerText();
if (!tl.includes('Payment received') || !tl.includes('Service completed')) throw new Error('timeline incomplete');
await ops.screenshot({ path: `${OUT}/e2e_12_ops_request_full.png`, fullPage: true });
await ops.getByTestId('logout').click();
await ops.waitForURL('**/ops/login');
await ops.getByTestId('login-email').fill('admin@medicalchampion.in');
await ops.getByTestId('login-password').fill('Admin@123');
await ops.getByTestId('login-submit').click();
await ops.waitForTimeout(800);
for (const pg of ['reports', 'requests', 'companions', 'customers', 'incidents', 'payments', 'expenses', 'alerts', 'notifications', 'whatsapp', 'settings', 'users', 'audit', 'requests/new']) {
  await ops.goto(`${BASE}/ops/${pg}`);
  await ops.waitForLoadState('networkidle');
  await ops.waitForTimeout(500);
  await shot(ops, `ops_${pg.replace('/', '_')}`);
}
await ops.goto(`${BASE}/ops/requests?q=${rn}`); await ops.waitForTimeout(800);
await ops.goto(`${BASE}/ops/companions`); await ops.getByText('Amit Kumar').first().click(); await ops.waitForTimeout(800); await shot(ops, 'ops_companion_detail');
await ops.goto(`${BASE}/ops/customers`); await ops.getByText('Rahul Kumar').first().click(); await ops.waitForTimeout(800); await shot(ops, 'ops_customer_detail');
const rep = await (await ops.request.get(`${BASE}/api/v1/reports/summary`)).json();
step(`reports: ${rep.demand.total} requests; trust ${Math.round(rep.north_star.trust_again_rate * 100)}%`);
await cmp.goto(BASE + '/companion/history'); await cmp.waitForTimeout(600); await shot(cmp, 'cmp_history');

console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nNo browser errors.');
await browser.close();
if (errors.length) process.exit(1);
console.log('E2E PASSED');
