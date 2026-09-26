// API-level end-to-end test of FRD §54 acceptance flow.
const BASE = process.env.BASE || 'http://localhost:3000';
function client() {
  const jar = {};
  return async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await res.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t.slice(0, 300)}`);
    return j;
  };
}
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓', m); };
const customer = client(), ops = client(), cmp = client();
const phone = '+9198' + String(Date.now()).slice(-8);
const say = (x) => customer('POST', '/api/v1/whatsapp/simulator/send', { phone, name: 'Rahul Test', ...x });
const last = async () => (await customer('GET', `/api/v1/whatsapp/simulator/messages?phone=${encodeURIComponent(phone)}`));

console.log('1-4 WhatsApp booking');
await say({ text: 'Hi' });
let m = await last(); ok(m.messages.at(-1).body.includes("We're here when you can't be"), 'welcome message');
await say({ reply: { id: 'help_now', title: 'Get Help Now' } });
m = await last(); ok(m.step === 'EMERGENCY_CHECK', 'emergency warning shown');
await say({ reply: { id: 'continue', title: 'Continue' } });
await say({ reply: { id: 'rel_mother', title: 'Mother', kind: 'list' } });
await say({ text: 'Kamla Devi, 74' });
await say({ location: { lat: 28.465, lng: 77.073, name: 'Home', address: 'B-12, Sushant Lok 1, Gurugram' } });
await say({ reply: { id: 'hospital_opd', title: 'Hospital / OPD', kind: 'list' } });
await say({ reply: { id: 't_asap', title: 'ASAP', kind: 'list' } });
await say({ reply: { id: 'm_some', title: 'Needs some assistance' } });
await say({ reply: { id: 'dest_0', title: 'Medanta', kind: 'list' } });
await say({ text: 'Uses a walker, hard of hearing' });
m = await last();
if (m.step === 'CUSTOMER_NAME') await say({ text: 'Rahul Kumar' });
m = await last(); ok(m.step === 'CONFIRM', 'confirmation summary: ' + m.messages.at(-1).body.split('\n').slice(0,3).join(' | '));
await say({ reply: { id: 'confirm', title: 'Confirm' }, duplicate: true });
await say({ reply: { id: 'confirm', title: 'Confirm' } });
m = await last();
ok(m.active_request, 'request created ' + m.active_request?.request_number);
const rn = m.active_request.request_number;
ok(m.messages.some((x) => x.body?.includes('Request ID: *' + rn)), 'customer confirmation with request id');

console.log('5-7 Operations');
await ops('POST', '/api/v1/auth/login', { email: 'agent@medicalchampion.in', password: 'Agent@123' });
const board = await ops('GET', '/api/v1/board');
const row = board.requests.find((r) => r.request_number === rn);
ok(row && row.current_status === 'NEW', 'request on ops board as NEW');
const alerts = await ops('GET', '/api/v1/alerts?unacked=1');
ok(alerts.some((a) => a.title.includes(rn)), 'ops alert created');
let d = await ops('POST', `/api/v1/requests/${row.id}/status`, { to: 'AWAITING_CONFIRMATION' });
d = await ops('POST', `/api/v1/requests/${row.id}/status`, { to: 'SEARCHING_COMPANION' });
ok(d.current_status === 'SEARCHING_COMPANION', 'ops confirmed');
try { await ops('POST', `/api/v1/requests/${row.id}/status`, { to: 'COMPLETED' }); ok(false, 'invalid transition should fail'); } catch (e) { ok(String(e).includes('409'), 'invalid transition rejected'); }
const cands = await ops('GET', `/api/v1/requests/${row.id}/candidates`);
const amit = cands.find((c) => c.code === 'CMP-101');
ok(amit && amit.eligible && amit.distance_km != null, `candidates listed (Amit ${amit.distance_km}km, eta ${amit.eta_minutes}m)`);
d = await ops('POST', `/api/v1/requests/${row.id}/assign`, { companion_id: amit.id });
ok(d.current_status === 'COMPANION_ASSIGNED' && d.open_offer, 'offer created');

console.log('8-9 Companion');
const otp = await cmp('POST', '/api/v1/companion/auth/otp', { phone: '+917000000101' });
ok(otp.demo_code, 'OTP issued');
await cmp('POST', '/api/v1/companion/auth/verify', { phone: '+917000000101', code: otp.demo_code });
let home = await cmp('GET', '/api/v1/companion/home');
ok(home.offers.length === 1 && home.offers[0].job.request_number === rn, 'companion sees offer');
ok(!home.offers[0].job.pickup_address, 'least-privilege: full address hidden before acceptance');
await cmp('POST', `/api/v1/assignments/${home.offers[0].assignment_id}/accept`, { idempotency_key: 'k1' });
await cmp('POST', `/api/v1/assignments/${home.offers[0].assignment_id}/accept`, { idempotency_key: 'k1' });
home = await cmp('GET', '/api/v1/companion/home');
ok(home.active_job?.status === 'COMPANION_ACCEPTED' && home.me.availability === 'BUSY', 'accepted, companion BUSY');
m = await last(); ok(m.messages.some((x) => x.body?.includes('Companion Assigned')), 'customer got assignment notification');

console.log('11-17 Service');
const jid = home.active_job.id;
const evt = (event_type, extra = {}) => cmp('POST', `/api/v1/companion/jobs/${jid}/event`, { event_type, idempotency_key: event_type + Math.random(), ...extra });
await evt('companion_dispatched');
await evt('reached_parent', { lat: 28.465, lng: 77.073 });
try { await evt('patient_verified', { verification: { method: 'booking_code', code: '0000' } }); } catch (e) { ok(String(e).includes('400'), 'wrong booking code rejected'); }
d = await ops('GET', `/api/v1/requests/${row.id}`);
await evt('patient_verified', { verification: { method: 'booking_code', code: d.booking_code } });
await evt('service_started');
await evt('leaving_for_hospital');
await evt('reached_hospital');
await evt('registration_completed');
await evt('consultation_underway', { notes: 'Waiting in queue, token 14' });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
await cmp('POST', `/api/v1/companion/jobs/${jid}/expenses`, { category: 'Transport', amount: 240, description: 'Auto to Medanta', receipt: { name: 'r.png', mime: 'image/png', data: png }, idempotency_key: 'e1' });
await cmp('POST', `/api/v1/companion/jobs/${jid}/expenses`, { category: 'Transport', amount: 240, description: 'Auto to Medanta', receipt: { name: 'r.png', mime: 'image/png', data: png }, idempotency_key: 'e1' });
await evt('returning_home');
await evt('parent_home');
await cmp('POST', `/api/v1/companion/jobs/${jid}/complete`, { completion_type: 'Parent returned home', notes: 'Handed to house help', idempotency_key: 'c1' });
d = await ops('GET', `/api/v1/requests/${row.id}`);
ok(d.current_status === 'COMPLETED' && d.service_duration_minutes >= 1, 'completed, duration ' + d.service_duration_minutes);
ok(d.expenses.length === 1, 'expense idempotent (1 record)');
ok(d.final_amount > 0 && d.charge_breakdown.expenses === 240, `final charge ₹${d.final_amount} incl. expenses`);
ok(d.payments.at(-1).status === 'PENDING', 'payment pending');

console.log('19-22 Customer completion');
m = await last(); ok(m.messages.some((x) => x.body?.includes('Service Completed')), 'completion message');
const t = d.track_url.split('t=')[1];
let tr = await customer('GET', `/api/v1/public/track/${rn}?t=${t}`);
ok(tr.timeline.length >= 8 && tr.companion?.first_name === 'Amit', 'tracking page timeline ' + tr.timeline.length);
await customer('POST', `/api/v1/public/pay/${tr.payment.id}/checkout?t=${t}`, { method: 'upi', outcome: 'success' });
tr = await customer('GET', `/api/v1/public/track/${rn}?t=${t}`);
ok(tr.payment_status === 'PAID', 'payment captured via webhook');
await customer('POST', `/api/v1/public/track/${rn}/rating?t=${t}`, { overall: 5, trust_again: true, comment: 'Wonderful' });
tr = await customer('GET', `/api/v1/public/track/${rn}?t=${t}`);
ok(tr.rating?.overall === 5 && tr.trust_again === true, 'rating + trust stored');

console.log('23-24 Timeline & reports');
d = await ops('GET', `/api/v1/requests/${row.id}`);
ok(d.events.length >= 15, 'ops timeline events ' + d.events.length);
const mgr = client();
await mgr('POST', '/api/v1/auth/login', { email: 'manager@medicalchampion.in', password: 'Manager@123' });
const rep = await mgr('GET', '/api/v1/reports/summary');
ok(rep.demand.total > 40 && rep.north_star.trust_again_rate > 0, `reports: ${rep.demand.total} requests, trust ${(rep.north_star.trust_again_rate*100).toFixed(0)}%, SLA ${(rep.north_star.sla_hit_rate*100).toFixed(0)}%`);
try { await ops('GET', '/api/v1/reports/summary'); ok(false, 'agent should not see reports'); } catch (e) { ok(String(e).includes('403'), 'RBAC: agent blocked from reports'); }
console.log('\nALL GOOD');
