import { ROLE_DEFS, hashPassword, randomDigits, randomToken } from './auth';
import { GAZETTEER } from './geo';
import { computeCharge } from './pricing';

export const DEMO_USERS = [
  { name: 'Aditi Rao', email: 'admin@medicalchampion.in', role: 'super_admin', password: 'Admin@123' },
  { name: 'Karan Bhatia', email: 'manager@medicalchampion.in', role: 'ops_manager', password: 'Manager@123' },
  { name: 'Sneha Kapoor', email: 'agent@medicalchampion.in', role: 'ops_agent', password: 'Agent@123' },
  { name: 'Manish Gupta', email: 'finance@medicalchampion.in', role: 'finance', password: 'Finance@123' },
  { name: 'Ritu Jain', email: 'support@medicalchampion.in', role: 'support', password: 'Support@123' },
];

export const DEMO_COMPANIONS = [
  { code: 'CMP-101', name: 'Amit Kumar', phone: '+917000000101', gender: 'Male', languages: ['Hindi', 'English'], home: 'Sushant Lok 1', avail: 'AVAILABLE', full: true, skills: ['Wheelchair assistance', 'Senior care'] },
  { code: 'CMP-102', name: 'Priya Sharma', phone: '+917000000102', gender: 'Female', languages: ['Hindi', 'English', 'Punjabi'], home: 'DLF Phase 4', avail: 'AVAILABLE', full: true, skills: ['Discharge coordination', 'Senior care'] },
  { code: 'CMP-103', name: 'Rahul Yadav', phone: '+917000000103', gender: 'Male', languages: ['Hindi', 'Haryanvi'], home: 'Sohna Road', avail: 'AVAILABLE', full: true, skills: ['Wheelchair assistance'] },
  { code: 'CMP-104', name: 'Sunita Devi', phone: '+917000000104', gender: 'Female', languages: ['Hindi'], home: 'Palam Vihar', avail: 'OFFLINE', full: true, skills: ['Senior care'] },
  { code: 'CMP-105', name: 'Vikram Singh', phone: '+917000000105', gender: 'Male', languages: ['Hindi', 'English', 'Punjabi'], home: 'Golf Course Road', avail: 'BUSY', full: true, skills: ['Admission coordination', 'Wheelchair assistance'] },
  { code: 'CMP-106', name: 'Neha Verma', phone: '+917000000106', gender: 'Female', languages: ['Hindi', 'English', 'Bengali'], home: 'South City 1', avail: 'BUSY', full: true, skills: ['Diagnostics', 'Senior care'] },
  { code: 'CMP-107', name: 'Arjun Mehta', phone: '+917000000107', gender: 'Male', languages: ['Hindi', 'English'], home: 'Sector 56', avail: 'AVAILABLE', full: true, skills: ['Pharmacy runs', 'Reports pickup'] },
  { code: 'CMP-108', name: 'Kavita Rawat', phone: '+917000000108', gender: 'Female', languages: ['Hindi', 'English'], home: 'Sector 14', avail: 'OFFLINE', full: false, missing: ['hospital_navigation_training', 'escalation_training', 'onboarding_completed'], skills: [] },
  { code: 'CMP-109', name: 'Mohit Chauhan', phone: '+917000000109', gender: 'Male', languages: ['Hindi', 'Haryanvi'], home: 'Manesar', avail: 'OFFLINE', full: false, missing: ['background_check_completed', 'onboarding_completed'], skills: [] },
];

const TEMPLATES: { key: string; name: string; body: string; buttons?: any[] }[] = [
  { key: 'request_received', name: 'Request received', body: "We've received your request.\n\nRequest ID: *{{request_number}}*\n\nOur support team is reviewing it and will contact you shortly.\n\n⚠️ {{emergency_disclaimer}}", buttons: [{ type: 'url', title: 'Track Request', url: '{{track_url}}' }, { type: 'call', title: 'Call Support', url: '{{support_tel}}' }] },
  { key: 'human_review', name: 'Human review (mobility)', body: 'Because {{patient_ref}} may need more than walking assistance, our care team will review request {{request_number}} personally and call you before confirming. If this is an emergency, call {{emergency_number}} now.' },
  { key: 'out_of_area', name: 'Outside service area', body: 'We currently serve Gurugram. The pickup for {{request_number}} may be outside our service area – our team will review it and call you. We will not dispatch until we confirm.' },
  { key: 'request_confirmed', name: 'Request confirmed', body: '✅ Request *{{request_number}}* is confirmed.\n\nWe are now assigning the best available verified companion for {{patient_ref}}. You will receive their details shortly.' },
  { key: 'companion_assigned', name: 'Companion assigned', body: '*Companion Assigned*\n\n{{companion_name}} has been assigned.\n\n✅ Verified companion · ID {{companion_code}}\n🗣 Languages: {{languages}}\n⏱ ETA: {{eta}}\n\nRequest: {{request_number}}', buttons: [{ type: 'url', title: 'Track Companion', url: '{{track_url}}' }, { type: 'call', title: 'Call Support', url: '{{support_tel}}' }] },
  { key: 'status_en_route', name: 'Companion on the way', body: '🚗 {{companion_first}} is on the way to {{patient_ref}}.\nExpected by {{eta}}.\n\nRequest: {{request_number}}', buttons: [{ type: 'url', title: 'Track Companion', url: '{{track_url}}' }] },
  { key: 'status_arrived', name: 'Companion reached parent', body: '🏠 {{companion_first}} has reached {{patient_ref}}.\n\nRequest: {{request_number}}' },
  { key: 'status_service_started', name: 'Service started', body: '▶️ Service has started. {{companion_first}} is now with {{patient_ref}} and will stay with them.\n\nRequest: {{request_number}}' },
  { key: 'status_leaving_home', name: 'Leaving for hospital', body: '🚕 {{companion_first}} and {{patient_ref}} are leaving for {{destination}}.\n\nRequest: {{request_number}}' },
  { key: 'status_at_hospital', name: 'Reached hospital', body: '*Reached Hospital*\n\n{{companion_first}} and {{patient_ref}} have reached the hospital.\n\nRequest: {{request_number}}\n\nWe\'ll continue to keep you updated.' },
  { key: 'status_update', name: 'Journey update', body: '📋 *{{update_label}}*{{notes_line}}\n\nRequest: {{request_number}}', buttons: [{ type: 'url', title: 'View Timeline', url: '{{track_url}}' }] },
  { key: 'status_returning', name: 'Returning home', body: '🏡 {{companion_first}} and {{patient_ref}} are returning home.\n\nRequest: {{request_number}}' },
  { key: 'status_parent_home', name: 'Parent home', body: '🏠 {{patient_ref_cap}} is home safely.\n\nRequest: {{request_number}}' },
  { key: 'service_completed', name: 'Service completed', body: '*Service Completed*\n\nYour companion service has been completed.\n\nRequest: {{request_number}}\nDuration: {{duration}}\nCompanion: {{companion_name}}\nAmount: {{amount}}', buttons: [{ type: 'url', title: 'Pay Now', url: '{{pay_url}}' }, { type: 'url', title: 'View Summary', url: '{{summary_url}}' }, { type: 'url', title: 'Rate Experience', url: '{{rate_url}}' }] },
  { key: 'payment_received', name: 'Payment received', body: '✅ Payment of {{amount}} received for {{request_number}}. Thank you for trusting us with {{patient_ref}}.', buttons: [{ type: 'url', title: 'Rate Experience', url: '{{rate_url}}' }] },
  { key: 'request_cancelled', name: 'Request cancelled', body: 'Your request {{request_number}} has been cancelled.\nReason: {{reason}}\n\nIf this is unexpected, please call us on {{support_phone}}.' },
];

// Deterministic PRNG so demo data is stable
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export async function seed(tx: any) {
  for (const r of ROLE_DEFS) {
    await tx`INSERT INTO roles (id, name, description, permissions) VALUES (${r.id}, ${r.name}, ${r.description}, ${r.permissions})
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, permissions = EXCLUDED.permissions`;
  }
  for (const u of DEMO_USERS) {
    await tx`INSERT INTO users (name, email, password_hash, role_id) VALUES (${u.name}, ${u.email}, ${hashPassword(u.password)}, ${u.role})
             ON CONFLICT (email) DO NOTHING`;
  }
  const area = (await tx`INSERT INTO service_areas (name, city, center_lat, center_lng, radius_km, keywords)
     VALUES ('Gurugram', 'Gurugram', 28.44, 77.06, 16, ${['gurugram', 'gurgaon', 'manesar', 'dlf', 'sohna road', 'golf course']}) RETURNING id`)[0].id;

  const general = (await tx`INSERT INTO pricing_rules (name, service_type, base_fee, included_minutes, extension_rate_per_hour, tax_percent, urgent_surcharge)
     VALUES ('Medical Companion', '*', 1499, 240, 299, 18, 0) RETURNING *`)[0];
  const admission = (await tx`INSERT INTO pricing_rules (name, service_type, base_fee, included_minutes, extension_rate_per_hour, tax_percent, urgent_surcharge)
     VALUES ('Admission Support', 'admission', 1999, 360, 299, 18, 0) RETURNING *`)[0];

  for (const t of TEMPLATES) {
    await tx`INSERT INTO message_templates (key, name, body, buttons) VALUES (${t.key}, ${t.name}, ${t.body}, ${tx.json(t.buttons ?? [])})
             ON CONFLICT (key) DO NOTHING`;
  }

  const comps: any[] = [];
  for (const c of DEMO_COMPANIONS) {
    const miss = new Set(c.missing ?? []);
    const home = GAZETTEER.find((g) => g.name === c.home)!;
    const row = (await tx`INSERT INTO companions (code, name, phone, gender, service_area_id, languages, skills, availability, home_area,
        current_lat, current_lng, government_id_verified, background_check_completed, interview_completed, hospital_navigation_training,
        escalation_training, onboarding_completed, active, bank_account_name, bank_account_number, bank_ifsc, upi_id, joined_at)
      VALUES (${c.code}, ${c.name}, ${c.phone}, ${c.gender}, ${area}, ${c.languages}, ${c.skills}, ${c.avail}, ${c.home},
        ${home.lat}, ${home.lng}, true, ${!miss.has('background_check_completed')}, true, ${!miss.has('hospital_navigation_training')},
        ${!miss.has('escalation_training')}, ${!miss.has('onboarding_completed')}, ${c.full}, ${c.name}, ${'50100' + c.phone.slice(-6) + '221'},
        'HDFC0001234', ${c.name.split(' ')[0].toLowerCase() + '@okhdfc'}, CURRENT_DATE - 90)
      RETURNING *`)[0];
    comps.push(row);
  }
  const active = comps.filter((c) => c.active);
  const historyComps = active.filter((c) => !['CMP-105', 'CMP-106'].includes(c.code)).concat(active.filter((c) => ['CMP-105', 'CMP-106'].includes(c.code)));

  // ---------------- demo customers + history
  const customers = [
    ['Rohan Malhotra', 'Bengaluru'], ['Ananya Iyer', 'Mumbai'], ['Siddharth Jain', 'Singapore'], ['Meera Nair', 'Dubai'],
    ['Vivek Arora', 'Gurugram'], ['Pooja Sethi', 'Pune'], ['Arnav Khanna', 'London'], ['Ishita Bansal', 'Hyderabad'],
    ['Kunal Chopra', 'Noida'], ['Tanya Grover', 'Toronto'], ['Nikhil Saxena', 'Chennai'], ['Shreya Kulkarni', 'San Francisco'],
    ['Aman Gupta', 'Delhi'], ['Divya Menon', 'Kolkata'], ['Harsh Vardhan', 'Gurugram'], ['Radhika Pillai', 'Sydney'],
  ];
  const custRows: any[] = [];
  for (let i = 0; i < customers.length; i++) {
    custRows.push((await tx`INSERT INTO customers (name, phone, city, source, created_at)
      VALUES (${customers[i][0]}, ${'+9171000002' + String(i).padStart(2, '0')}, ${customers[i][1]}, ${i % 3 === 0 ? 'google_ads' : i % 3 === 1 ? 'whatsapp' : 'referral'}, now() - interval '40 days')
      RETURNING *`)[0]);
  }
  const pNames = [['Kamla Devi', 'Mother', 74], ['Rajendra Prasad', 'Father', 79], ['Sushila Malhotra', 'Mother', 68], ['Om Prakash', 'Father', 82], ['Lata Iyer', 'Mother', 71], ['Harish Sethi', 'Father', 76], ['Neelam Khanna', 'Spouse', 62], ['Saroj Bansal', 'Mother', 80]];
  const patients: any[] = [];
  for (let i = 0; i < custRows.length; i++) {
    const p = pNames[i % pNames.length];
    const loc = GAZETTEER.filter((g) => g.type === 'locality' && !['Faridabad Sector 15', 'Dwarka Sector 10', 'Manesar'].includes(g.name))[i % 20];
    patients.push((await tx`INSERT INTO patients (customer_id, name, age, gender, relationship, address, mobility, language, consent_given, consent_at)
      VALUES (${custRows[i].id}, ${p[0]}, ${p[2]}, ${p[1] === 'Father' ? 'Male' : 'Female'}, ${p[1]}, ${`House ${10 + i * 7}, ${loc.address}`},
              ${i % 4 === 0 ? 'NEEDS_ASSISTANCE' : 'INDEPENDENT'}, ${i % 5 === 0 ? 'Punjabi' : 'Hindi'}, true, now() - interval '40 days')
      RETURNING *, ${loc.lat}::float8 AS lat, ${loc.lng}::float8 AS lng`)[0]);
  }
  const hospitals = GAZETTEER.filter((g) => g.type === 'hospital');
  const R = rng(20260926);
  const pick = <T,>(arr: T[]) => arr[Math.floor(R() * arr.length)];
  const svc = ['hospital_opd', 'hospital_opd', 'diagnostic', 'doctor_appointment', 'discharge', 'admission', 'hospital_opd', 'diagnostic'];
  let seq = 10000;
  const DAY = 86400000;
  const now = Date.now();

  async function ev(reqId: string, type: string, label: string, from: string | null, to: string | null, at: Date, actor: [string, string | null, string], notes: string | null = null, visible = true) {
    await tx`INSERT INTO status_events (request_id, event_type, label, from_status, to_status, actor_type, actor_id, actor_name, notes, customer_visible, notification_status, created_at)
             VALUES (${reqId}, ${type}, ${label}, ${from}, ${to}, ${actor[0]}, ${actor[1]}, ${actor[2]}, ${notes}, ${visible}, ${visible ? 'DELIVERED' : 'NONE'}, ${at})`;
  }
  const opsActor: [string, string | null, string] = ['ops', null, 'Sneha Kapoor'];

  async function makeRequest(o: {
    daysAgo: number; hour: number; status: string; urgency: string; compIdx?: number; custIdx: number; cancelReason?: string; paid?: boolean;
    rating?: number; trust?: boolean; bedridden?: boolean; outOfArea?: boolean; stageMinutesAgo?: number; incident?: boolean;
  }) {
    seq++;
    const cust = custRows[o.custIdx];
    const pat = patients[o.custIdx];
    const created = new Date(now - o.daysAgo * DAY);
    if (o.daysAgo >= 1) created.setUTCHours(o.hour - 5, Math.floor(R() * 59), 0, 0);
    const service = pick(svc);
    const hosp = pick(hospitals);
    const urgent = o.urgency === 'ASAP' || o.urgency === 'WITHIN_2_HOURS';
    const requested = urgent ? created : new Date(created.getTime() + (3 + R() * 20) * 3600e3);
    const pickup = (await tx`INSERT INTO locations (address, lat, lng, source) VALUES (${pat.address}, ${o.outOfArea ? 28.3955 : pat.lat}, ${o.outOfArea ? 77.3268 : pat.lng}, ${R() > 0.5 ? 'whatsapp_location' : 'typed+gazetteer'}) RETURNING id`)[0].id;
    const dest = (await tx`INSERT INTO locations (place_name, address, lat, lng, source) VALUES (${hosp.name}, ${hosp.address}, ${hosp.lat}, ${hosp.lng}, 'typed') RETURNING id`)[0].id;
    const rule = service === 'admission' ? admission : general;
    const comp = o.compIdx != null ? historyComps[o.compIdx % historyComps.length] : null;
    const r = (await tx`INSERT INTO service_requests (request_number, customer_id, patient_id, channel, source, service_type, urgency, requested_datetime,
        pickup_location_id, destination_location_id, mobility_status, special_instructions, current_status, human_review_required, human_review_reason,
        out_of_area, service_area_id, pricing_rule_id, quoted_amount, booking_code, tracking_token, created_at, updated_at)
      VALUES (${'MC-' + seq}, ${cust.id}, ${pat.id}, ${R() > 0.15 ? 'whatsapp' : 'phone'}, ${cust.source}, ${service}, ${o.urgency}, ${requested},
        ${pickup}, ${dest}, ${o.bedridden ? 'BEDRIDDEN' : pat.mobility}, ${R() > 0.6 ? 'Uses a walking stick. Please carry the blue file with previous reports.' : null},
        'NEW', ${!!(o.bedridden || o.outOfArea)}, ${o.bedridden ? 'Patient cannot walk / bedridden – confirm a standard companion is appropriate' : o.outOfArea ? 'Pickup appears to be outside the supported service area' : null},
        ${!!o.outOfArea}, ${o.outOfArea ? null : area}, ${rule.id}, ${computeCharge(rule, rule.included_minutes, o.urgency).total}, ${randomDigits(4)}, ${randomToken(18)}, ${created}, ${created})
      RETURNING *`)[0];
    let t = created.getTime();
    const at = (mins: number) => new Date((t += mins * 60000));
    await ev(r.id, 'request_created', 'Request received', 'DRAFT', 'NEW', new Date(t), ['customer', null, cust.name]);
    if (o.status === 'NEW') { await tx`UPDATE service_requests SET current_status = 'NEW' WHERE id = ${r.id}`; return r; }
    await ev(r.id, 'status_changed', 'Operations reviewing', 'NEW', 'AWAITING_CONFIRMATION', at(1 + R() * 2), opsActor, null, true);
    if (o.status === 'AWAITING_CONFIRMATION') { await tx`UPDATE service_requests SET current_status = 'AWAITING_CONFIRMATION' WHERE id = ${r.id}`; return r; }
    if (o.status === 'CANCELLED' && R() > 0.5) {
      await ev(r.id, 'cancelled', 'Request cancelled', 'AWAITING_CONFIRMATION', 'CANCELLED', at(4), opsActor, o.cancelReason ?? null);
      await tx`UPDATE service_requests SET current_status = 'CANCELLED', cancellation_reason = ${o.cancelReason ?? null}, cancelled_by = 'Sneha Kapoor' WHERE id = ${r.id}`;
      return r;
    }
    const confirmedAt = at(1 + R() * 2);
    await ev(r.id, 'confirmed', 'Operations confirmed – finding companion', 'AWAITING_CONFIRMATION', 'SEARCHING_COMPANION', confirmedAt, opsActor);
    if (o.status === 'SEARCHING_COMPANION' || o.status === 'CANCELLED' || o.status === 'UNFULFILLED') {
      const st = o.status;
      if (st !== 'SEARCHING_COMPANION') await ev(r.id, st === 'CANCELLED' ? 'cancelled' : 'status_changed', st === 'CANCELLED' ? 'Request cancelled' : 'Unfulfilled', 'SEARCHING_COMPANION', st, at(8), opsActor, o.cancelReason ?? null);
      await tx`UPDATE service_requests SET current_status = ${st}, confirmed_at = ${confirmedAt}, cancellation_reason = ${o.cancelReason ?? null} WHERE id = ${r.id}`;
      return r;
    }
    if (!comp) return r;
    const assignedAt = at(2 + R() * 6);
    const eta = 18 + Math.floor(R() * 30);
    const asgStatus = o.status === 'COMPANION_ASSIGNED' ? 'OFFERED' : o.status === 'COMPLETED' ? 'COMPLETED' : 'ACCEPTED';
    await tx`INSERT INTO assignments (request_id, companion_id, status, offered_by_name, offered_at, expires_at, responded_at, eta_minutes, distance_km, completed_at)
             VALUES (${r.id}, ${comp.id}, ${asgStatus}, 'Sneha Kapoor', ${assignedAt}, ${new Date(assignedAt.getTime() + (o.status === 'COMPANION_ASSIGNED' ? 3 * 3600e3 : 5 * 60000))},
                     ${asgStatus === 'OFFERED' ? null : new Date(assignedAt.getTime() + 90000)}, ${eta}, ${Math.round(eta / 3)}, null)`;
    await ev(r.id, 'status_changed', `Companion offered: ${comp.name}`, 'SEARCHING_COMPANION', 'COMPANION_ASSIGNED', assignedAt, opsActor, null, false);
    if (o.status === 'COMPANION_ASSIGNED') {
      await tx`UPDATE service_requests SET current_status = 'COMPANION_ASSIGNED', assigned_companion_id = ${comp.id}, confirmed_at = ${confirmedAt}, assigned_at = ${assignedAt} WHERE id = ${r.id}`;
      return r;
    }
    const acceptedAt = at(1 + R() * 3);
    await ev(r.id, 'companion_accepted', `Companion assigned: ${comp.name}`, 'COMPANION_ASSIGNED', 'COMPANION_ACCEPTED', acceptedAt, ['companion', comp.id, comp.name]);
    const cActor: [string, string | null, string] = ['companion', comp.id, comp.name];
    const startBase = urgent ? t : Math.max(t, requested.getTime() - eta * 60000);
    t = startBase;
    await ev(r.id, 'companion_dispatched', 'Companion dispatched', 'COMPANION_ACCEPTED', 'EN_ROUTE', at(2), cActor);
    const estArrival = new Date(t + eta * 60000);
    const patch: any = { confirmed_at: confirmedAt, assigned_at: assignedAt, accepted_at: acceptedAt, assigned_companion_id: comp.id, estimated_arrival: estArrival };
    if (o.status === 'EN_ROUTE') {
      await tx`UPDATE service_requests SET ${tx({ ...patch, current_status: 'EN_ROUTE' })} WHERE id = ${r.id}`;
      return r;
    }
    const arrival = at(eta + (R() * 14 - 6));
    await ev(r.id, 'reached_parent', 'Companion reached parent', 'EN_ROUTE', 'WITH_PATIENT', arrival, cActor);
    await ev(r.id, 'patient_verified', 'Patient identity verified', null, null, at(2), cActor, null, false);
    const start = at(3);
    await ev(r.id, 'service_started', 'Service started', null, null, start, cActor);
    await ev(r.id, 'leaving_for_hospital', 'Leaving for hospital', null, null, at(6), cActor);
    await ev(r.id, 'reached_hospital', 'Reached hospital', 'WITH_PATIENT', 'AT_HOSPITAL', at(15 + R() * 20), cActor);
    await ev(r.id, 'registration_completed', 'Registration completed', null, null, at(12 + R() * 15), cActor);
    await ev(r.id, 'consultation_underway', 'Consultation underway', null, null, at(20 + R() * 40), cActor);
    Object.assign(patch, { actual_arrival: arrival, verified_at: arrival, verification_method: 'booking_code', verification_result: 'VERIFIED', service_start_time: start });
    if (o.status === 'AT_HOSPITAL') {
      await tx`UPDATE service_requests SET ${tx({ ...patch, current_status: 'AT_HOSPITAL' })} WHERE id = ${r.id}`;
      return r;
    }
    if (service === 'diagnostic' || R() > 0.5) await ev(r.id, 'tests', 'Tests in progress', null, null, at(25 + R() * 50), cActor);
    if (R() > 0.4) await ev(r.id, 'pharmacy', 'At pharmacy', null, null, at(20 + R() * 20), cActor);
    const admitted = service === 'admission';
    let completion = 'Parent returned home';
    if (admitted) {
      await ev(r.id, 'admission_underway', 'Admission underway', null, null, at(30 + R() * 30), cActor);
      await ev(r.id, 'handover_completed', 'Handover completed', null, null, at(40 + R() * 60), cActor, 'Handed over to ward staff; family informed');
      completion = 'Parent admitted';
    } else {
      await ev(r.id, 'returning_home', 'Returning home', 'AT_HOSPITAL', 'RETURNING', at(20 + R() * 60), cActor);
      await ev(r.id, 'parent_home', 'Parent home', null, null, at(20 + R() * 20), cActor);
      await ev(r.id, 'handover_completed', 'Handover completed', null, null, at(3), cActor, 'Handed over to house help');
    }
    const end = at(2);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    // expenses
    let billable = 0;
    if (R() > 0.35) {
      const amt = 180 + Math.round(R() * 260);
      billable += amt;
      await tx`INSERT INTO expenses (request_id, category, amount, description, submitted_by_type, submitted_by_id, submitted_by_name, approval_status, reviewed_by, reviewed_at, created_at)
               VALUES (${r.id}, 'Transport', ${amt}, 'Cab to hospital and back', 'companion', ${comp.id}, ${comp.name}, 'APPROVED', 'Karan Bhatia', ${end}, ${end})`;
    }
    if (R() > 0.6) {
      billable += 60;
      await tx`INSERT INTO expenses (request_id, category, amount, description, submitted_by_type, submitted_by_id, submitted_by_name, approval_status, reviewed_by, reviewed_at, created_at)
               VALUES (${r.id}, 'Parking', 60, 'Hospital parking', 'companion', ${comp.id}, ${comp.name}, 'APPROVED', 'Karan Bhatia', ${end}, ${end})`;
    }
    const charge = computeCharge(rule, duration, o.urgency, billable);
    const evType = 'service_completed';
    await ev(r.id, evType, 'Service completed', admitted ? 'AT_HOSPITAL' : 'RETURNING', 'COMPLETED', end, cActor, completion);
    await tx`UPDATE assignments SET completed_at = ${end} WHERE request_id = ${r.id}`;
    const paid = o.paid !== false;
    await tx`UPDATE service_requests SET ${tx({
      ...patch, current_status: 'COMPLETED', service_end_time: end, service_duration_minutes: duration, completion_type: completion,
      final_amount: charge.total, charge_breakdown: tx.json(charge), payment_status: paid ? 'PAID' : 'PENDING', updated_at: end,
    })} WHERE id = ${r.id}`;
    const pay = (await tx`INSERT INTO payments (request_id, amount, status, provider, provider_order_id, provider_payment_id, method, paid_at, created_by, created_at, updated_at, payment_link_url)
      VALUES (${r.id}, ${charge.total}, ${paid ? 'PAID' : 'PENDING'}, 'sandbox', ${'order_sbx_' + seq}, ${paid ? 'pay_sbx_' + seq : null}, ${paid ? (R() > 0.3 ? 'upi' : 'card') : null},
              ${paid ? new Date(end.getTime() + 25 * 60000) : null}, 'System', ${end}, ${end}, ${'/pay/pending'}) RETURNING id`)[0];
    await tx`UPDATE payments SET payment_link_url = ${'/pay/' + pay.id + '?t=' + r.tracking_token} WHERE id = ${pay.id}`;
    if (paid) await ev(r.id, 'payment_received', 'Payment received', null, null, new Date(end.getTime() + 25 * 60000), ['gateway', null, 'Payment gateway (sandbox)']);
    if (o.rating) {
      await tx`INSERT INTO ratings (request_id, companion_id, overall, comment, created_at) VALUES (${r.id}, ${comp.id}, ${o.rating},
               ${o.rating >= 5 ? pick(['Amazing care, I could finally breathe at work.', 'Very professional and kind with Papa.', 'Updates every step – felt like I was there.']) : o.rating === 4 ? 'Good service, slight delay at pickup.' : 'Companion was fine but communication could be better.'},
               ${new Date(end.getTime() + 3600e3)})`;
      await tx`INSERT INTO trust_responses (request_id, trust_again, reason, created_at) VALUES (${r.id}, ${o.trust !== false}, ${o.trust === false ? 'Arrived later than promised' : null}, ${new Date(end.getTime() + 3600e3)})`;
    }
    if (o.incident) {
      const n = (await tx`SELECT nextval('incident_number_seq') AS n`)[0].n;
      await tx`INSERT INTO incidents (incident_number, request_id, companion_id, severity, category, description, status, reporter_type, reporter_name, actions, resolution, closed_by, closed_at, created_at)
               VALUES (${'INC-' + n}, ${r.id}, ${comp.id}, 'MEDIUM', 'Transport issue', 'Cab cancelled at pickup; 20 min delay arranging another.', 'CLOSED', 'companion', ${comp.name},
                       'Booked alternate cab, informed family', 'Customer informed; no further action', 'Karan Bhatia', ${end}, ${start})`;
    }
    return r;
  }

  // 30 days of history
  for (let i = 0; i < 46; i++) {
    const daysAgo = 1 + Math.floor(R() * 29);
    const roll = R();
    const status = roll < 0.07 ? 'CANCELLED' : roll < 0.09 ? 'UNFULFILLED' : 'COMPLETED';
    const rating = R() < 0.8 ? (R() < 0.7 ? 5 : R() < 0.8 ? 4 : 3) : undefined;
    await makeRequest({
      daysAgo, hour: 8 + Math.floor(R() * 11), status, urgency: pick(['ASAP', 'ASAP', 'WITHIN_2_HOURS', 'SCHEDULED', 'SCHEDULED', 'LATER_TODAY']),
      compIdx: Math.floor(R() * 7), custIdx: Math.floor(R() * custRows.length), rating, trust: rating ? (rating >= 4 ? R() > 0.04 : R() > 0.6) : undefined,
      paid: R() > 0.05, cancelReason: status === 'CANCELLED' ? 'Customer cancelled – arranged family member' : status === 'UNFULFILLED' ? 'No companion available' : undefined,
      incident: i === 7 || i === 23,
    });
  }
  // Live board
  const vikram = historyComps.findIndex((c) => c.code === 'CMP-105');
  const neha = historyComps.findIndex((c) => c.code === 'CMP-106');
  await makeRequest({ daysAgo: 0.01, hour: 0, status: 'NEW', urgency: 'ASAP', custIdx: 3, bedridden: true });
  await makeRequest({ daysAgo: 0.02, hour: 0, status: 'AWAITING_CONFIRMATION', urgency: 'WITHIN_2_HOURS', custIdx: 5 });
  await makeRequest({ daysAgo: 0.03, hour: 0, status: 'NEW', urgency: 'SCHEDULED', custIdx: 9, outOfArea: true });
  await makeRequest({ daysAgo: 0.02, hour: 0, status: 'SEARCHING_COMPANION', urgency: 'SCHEDULED', custIdx: 7 });
  await makeRequest({ daysAgo: 0.02, hour: 0, status: 'EN_ROUTE', urgency: 'ASAP', custIdx: 1, compIdx: vikram });
  await makeRequest({ daysAgo: 0.09, hour: 0, status: 'AT_HOSPITAL', urgency: 'ASAP', custIdx: 0, compIdx: neha });

  // One open incident for the incident queue
  const n = (await tx`SELECT nextval('incident_number_seq') AS n`)[0].n;
  await tx`INSERT INTO incidents (incident_number, request_id, severity, category, description, status, reporter_type, reporter_name)
           SELECT ${'INC-' + n}, id, 'HIGH', 'Customer complaint', 'Customer says the summary did not mention pharmacy bill. Needs call-back and receipt copy.', 'OPEN', 'ops', 'Ritu Jain'
           FROM service_requests WHERE current_status = 'COMPLETED' ORDER BY created_at DESC LIMIT 1`;
  await tx`UPDATE service_requests SET incident_flag = true WHERE id IN (SELECT request_id FROM incidents WHERE status <> 'CLOSED')`;
  await tx`SELECT setval('request_number_seq', GREATEST(10451, ${seq}))`;
}
