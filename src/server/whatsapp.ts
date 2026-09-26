// WhatsApp booking conversation (FRD §8-§11, §33, §34).
import crypto from 'node:crypto';
import { sql } from './db';
import { sendWhatsApp, upsertConversation, OutMsg } from './wa';
import { createServiceRequest, SYSTEM } from './lifecycle';
import { geocode, checkServiceArea, reverseLabel, GAZETTEER } from './geo';
import { getSetting, SERVICE_TYPES, serviceTypeLabel } from './settings';
import { findPricingRule, quote } from './pricing';
import { alertOps, requestVars } from './notifications';
import { STATUS_LABEL, TERMINAL, URGENCY_LABEL, MOBILITY_LABEL, fmtINR, patientRef } from '../shared/constants';

type Input =
  | { kind: 'reply'; id: string; title: string }
  | { kind: 'text'; text: string }
  | { kind: 'location'; lat: number; lng: number; name?: string; address?: string }
  | { kind: 'other'; type: string };

const HOSPITAL_ROWS = [
  'Medanta – The Medicity', 'Artemis Hospital', 'Fortis Memorial Research Institute', 'Max Hospital Gurugram',
  'Paras Hospital', 'CK Birla Hospital', 'W Pratiksha Hospital', 'Manipal Hospital Gurugram',
];
const SPECIAL_LIMIT = 300;

// ------------------------------------------------------------------ webhook entry
export async function processWebhookPayload(payload: any, opts: { source: 'whatsapp' | 'simulator'; simOwner?: string | null } = { source: 'whatsapp' }) {
  const results: any[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      for (const st of v.statuses ?? []) results.push(await handleStatus(st));
      const contacts = v.contacts ?? [];
      for (const m of v.messages ?? []) {
        const name = contacts.find((c: any) => c.wa_id === m.from)?.profile?.name ?? null;
        results.push(await handleInbound(m, name, opts.source, opts.simOwner ?? null));
      }
    }
  }
  return results;
}

async function handleStatus(st: any) {
  const map: Record<string, string> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
  const status = map[st.status];
  if (!status || !st.id) return { ignored: true };
  const rank: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
  const msg = (await sql`SELECT * FROM wa_messages WHERE provider_message_id = ${st.id}`)[0];
  if (msg && (rank[status] > rank[msg.status] || status === 'FAILED')) {
    await sql`UPDATE wa_messages SET status = ${status} WHERE id = ${msg.id}`;
  }
  const n = (await sql`SELECT * FROM notifications WHERE provider_message_id = ${st.id}`)[0];
  if (n && (rank[status] > rank[n.status] || status === 'FAILED')) {
    await sql`UPDATE notifications SET status = ${status}, error = ${st.errors?.[0]?.title ?? null}, updated_at = now() WHERE id = ${n.id}`;
    if (n.status_event_id) await sql`UPDATE status_events SET notification_status = ${status} WHERE id = ${n.status_event_id}`;
    if (status === 'FAILED' && n.request_id) {
      await alertOps(n.request_id, 'notification_failed', 'WhatsApp delivery failed', `${n.template || n.event}: ${st.errors?.[0]?.title || 'unknown error'} – use phone/SMS fallback`, 'WARNING');
    }
  }
  return { status: true };
}

function parseInput(m: any): Input {
  if (m.type === 'text') return { kind: 'text', text: String(m.text?.body ?? '').trim() };
  if (m.type === 'interactive') {
    const r = m.interactive?.button_reply || m.interactive?.list_reply;
    if (r) return { kind: 'reply', id: r.id, title: r.title };
  }
  if (m.type === 'button') return { kind: 'reply', id: m.button?.payload, title: m.button?.text };
  if (m.type === 'location') {
    return { kind: 'location', lat: Number(m.location.latitude), lng: Number(m.location.longitude), name: m.location.name, address: m.location.address };
  }
  return { kind: 'other', type: m.type };
}

async function handleInbound(m: any, profileName: string | null, source: string, simOwner: string | null) {
  const phone = '+' + String(m.from).replace(/[^\d]/g, '');
  const conv0 = await upsertConversation(phone, { source, profileName });
  if (source === 'simulator' && simOwner && !conv0.sim_owner) {
    await sql`UPDATE wa_conversations SET sim_owner = ${simOwner} WHERE id = ${conv0.id}`;
  }
  const input = parseInput(m);
  // Idempotency: provider message ids are unique (FRD §33, §34)
  const inserted = await sql`
    INSERT INTO wa_messages (conversation_id, direction, provider_message_id, msg_type, body, payload, status)
    VALUES (${conv0.id}, 'IN', ${m.id}, ${m.type}, ${input.kind === 'text' ? input.text : input.kind === 'reply' ? input.title : input.kind === 'location' ? `📍 ${input.address || input.name || `${input.lat},${input.lng}`}` : m.type},
            ${sql.json(m)}, 'RECEIVED')
    ON CONFLICT (provider_message_id) DO NOTHING RETURNING id`;
  if (!inserted[0]) return { duplicate: true };

  const cust = (await sql`SELECT * FROM customers WHERE phone = ${phone}`)[0];
  await sql`UPDATE wa_conversations SET last_inbound_at = now(), updated_at = now(), customer_id = COALESCE(customer_id, ${cust?.id ?? null}) WHERE id = ${conv0.id}`;
  // Serialise per conversation (advisory lock, no row locks held while sending) to prevent
  // duplicate requests from rapid repeated messages.
  return sql.begin(async (tx: any) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${conv0.id}::text))`;
    const conv = (await tx`SELECT * FROM wa_conversations WHERE id = ${conv0.id}`)[0];
    const bot = new Bot(conv, phone, cust, profileName);
    await bot.handle(input);
    await tx`UPDATE wa_conversations SET current_step = ${bot.step}, draft = ${tx.json(bot.draft)}, active_request_id = ${bot.activeRequestId},
             updated_at = now() WHERE id = ${conv.id}`;
    return { step: bot.step };
  });
}

// ------------------------------------------------------------------ conversation state machine
class Bot {
  step: string;
  draft: any;
  activeRequestId: string | null;
  constructor(public conv: any, public phone: string, public customer: any, public profileName: string | null) {
    this.step = conv.current_step || 'START';
    this.draft = conv.draft || {};
    this.activeRequestId = conv.active_request_id;
  }

  say(msg: OutMsg | string) {
    return sendWhatsApp(this.phone, typeof msg === 'string' ? { body: msg } : msg);
  }

  async welcome() {
    this.step = 'MENU';
    this.draft = {};
    await this.say({
      body: "Hi 👋\n\nWe're here when you can't be.\n\nWould you like:",
      buttons: [
        { id: 'help_now', title: '🚨 Get Help Now' },
        { id: 'schedule', title: '📅 Schedule a Companion' },
        { id: 'talk', title: '📞 Talk to Us' },
      ],
    });
  }

  async talk() {
    const contact = await getSetting('contact');
    await this.say({
      body: `📞 Our care team is here for you.\n\nCall us on *${contact.support_phone_display}* (${contact.support_hours}).\n\nWe've also asked a team member to call you back on this number shortly.`,
      actions: [{ type: 'call', title: 'Call Support', url: `tel:${contact.support_phone}` }],
    });
    await alertOps(this.activeRequestId, 'callback_requested', 'Callback requested', `WhatsApp customer ${this.phone}${this.profileName ? ` (${this.profileName})` : ''} asked to talk to the team`, 'URGENT');
  }

  async handle(input: Input) {
    const text = input.kind === 'text' ? input.text : '';
    const id = input.kind === 'reply' ? input.id : '';
    const low = text.toLowerCase();

    if (id === 'talk' || /^(talk|call|help me|agent|human)\b/.test(low)) return this.talk();
    if (id === 'restart' || id === 'new_request' || /^(hi|hello|hey|menu|start|restart|namaste)\b/.test(low)) {
      if (this.activeRequestId && id !== 'new_request' && id !== 'restart') {
        const r = (await sql`SELECT current_status FROM service_requests WHERE id = ${this.activeRequestId}`)[0];
        if (r && !TERMINAL.includes(r.current_status)) return this.activeStatus();
      }
      return this.welcome();
    }
    if (id === 'track') return this.activeStatus(true);

    switch (this.step) {
      case 'START':
        return this.welcome();
      case 'MENU':
        if (id === 'help_now' || id === 'schedule' || /get help|help now|urgent/.test(low) || /schedule/.test(low)) {
          this.draft = { flow: id === 'schedule' || /schedule/.test(low) ? 'schedule' : 'now', nonce: crypto.randomBytes(6).toString('hex') };
          return this.askEmergency();
        }
        return this.welcome();
      case 'EMERGENCY_CHECK':
        if (id === 'emergency') {
          const e = await getSetting('emergency');
          await this.say(`🚑 *Please call emergency services now.*\n\n📞 ${e.primary_number} – ${e.primary_label}\n📞 ${e.ambulance_number} – ${e.ambulance_label}\n\nOr go to the nearest hospital emergency department immediately.\n\nWhen things are stable, message us and we can send a companion to support your family.`);
          await alertOps(null, 'emergency_redirect', 'Customer redirected to emergency services', `WhatsApp ${this.phone} indicated a medical emergency`, 'WARNING');
          this.step = 'MENU';
          return;
        }
        if (id === 'continue' || /continue|no|not/.test(low)) return this.askRelationship();
        return this.askEmergency();
      case 'RELATIONSHIP': {
        const map: Record<string, string> = { rel_mother: 'Mother', rel_father: 'Father', rel_spouse: 'Spouse', rel_other: 'Someone Else' };
        let rel = map[id];
        if (!rel && text) rel = ['Mother', 'Father', 'Spouse'].find((r) => low.includes(r.toLowerCase())) || (low.includes('mom') ? 'Mother' : low.includes('dad') ? 'Father' : '');
        if (!rel) return this.askRelationship();
        this.draft.relationship = rel;
        if (rel === 'Someone Else') {
          this.step = 'RELATION_OTHER';
          return this.say('Please tell us who they are to you (e.g. grandmother, uncle, neighbour).');
        }
        return this.askPatientDetails();
      }
      case 'RELATION_OTHER':
        if (!text) return this.say('Please type their relationship to you.');
        this.draft.relationship_detail = text.slice(0, 60);
        return this.askPatientDetails();
      case 'PATIENT_DETAILS':
        if (id !== 'skip' && text) {
          const ageM = text.match(/(\d{1,3})/);
          const name = text.replace(/[,\-–]?\s*\d{1,3}\s*(yrs?|years?)?/i, '').trim();
          if (ageM && Number(ageM[1]) > 0 && Number(ageM[1]) < 120) this.draft.patient_age = Number(ageM[1]);
          if (name) this.draft.patient_name = name.slice(0, 80);
        }
        return this.askLocation();
      case 'LOCATION':
        if (input.kind === 'location') {
          const label = input.address || input.name || (await reverseLabel(input.lat, input.lng));
          this.draft.pickup = { address: label, lat: input.lat, lng: input.lng, source: 'whatsapp_location' };
        } else if (text && text.length >= 6) {
          const g = await geocode(text);
          this.draft.pickup = { address: text.slice(0, 300), lat: g?.lat ?? null, lng: g?.lng ?? null, source: g ? 'typed+geocoded' : 'typed' };
        } else {
          return this.say('Please share their location using 📎 → *Location*, or type the full address (house/flat, street, sector).');
        }
        {
          const area = await checkServiceArea(this.draft.pickup.lat, this.draft.pickup.lng, this.draft.pickup.address);
          this.draft.in_area = area.inArea;
          if (area.inArea === false) {
            await this.say("📍 Thanks. This location looks like it may be *outside Gurugram*, where we currently operate. You can continue – our team will review it personally before confirming anything.");
          }
        }
        return this.askServiceType();
      case 'SERVICE_TYPE': {
        let st = SERVICE_TYPES.find((s) => s.id === id)?.id;
        if (!st && text) st = SERVICE_TYPES.find((s) => s.label.toLowerCase().includes(low))?.id;
        if (!st) return this.askServiceType();
        this.draft.service_type = st;
        if (this.draft.flow === 'schedule') {
          this.draft.urgency = 'SCHEDULED';
          return this.askSchedule();
        }
        return this.askTime();
      }
      case 'TIME': {
        const map: Record<string, string> = { t_asap: 'ASAP', t_2h: 'WITHIN_2_HOURS', t_later: 'LATER_TODAY', t_schedule: 'SCHEDULED' };
        const u = map[id] || (/asap|now/.test(low) ? 'ASAP' : /2 ?h/.test(low) ? 'WITHIN_2_HOURS' : /later/.test(low) ? 'LATER_TODAY' : /schedul/.test(low) ? 'SCHEDULED' : '');
        if (!u) return this.askTime();
        this.draft.urgency = u;
        if (u === 'SCHEDULED') return this.askSchedule();
        return this.askMobility();
      }
      case 'SCHEDULE_DATETIME': {
        const d = parseDateTime(text);
        if (!d) return this.say('Sorry, I could not read that. Please send the date and time like *28/09 10:30 AM* or *tomorrow 9 am*.');
        if (d.getTime() < Date.now() + 30 * 60000) return this.say('Please choose a time at least 30 minutes from now. For urgent help, type *menu* and choose Get Help Now.');
        if (d.getTime() > Date.now() + 60 * 86400000) return this.say('We can schedule up to 60 days ahead. Please send an earlier date.');
        this.draft.requested_at = d.toISOString();
        await this.say(`📅 Noted: *${fmtIST(d)}*`);
        return this.askMobility();
      }
      case 'MOBILITY': {
        const map: Record<string, string> = { m_yes: 'INDEPENDENT', m_some: 'NEEDS_ASSISTANCE', m_no: 'BEDRIDDEN' };
        const mob = map[id] || (/bed|no\b|cannot|can't/.test(low) ? 'BEDRIDDEN' : /some|assist|help/.test(low) ? 'NEEDS_ASSISTANCE' : /yes|independ/.test(low) ? 'INDEPENDENT' : '');
        if (!mob) return this.askMobility();
        this.draft.mobility = mob;
        if (mob === 'BEDRIDDEN') {
          const e = await getSetting('emergency');
          await this.say(`🙏 Thank you for telling us. Because they may need more support than a standard companion provides (for example a stretcher or trained medical transport), *a care team member will personally review this request and call you before confirming*.\n\nIf they are unwell right now, please call ${e.primary_number} or ${e.ambulance_number}.`);
        }
        return this.askDestination();
      }
      case 'DESTINATION':
        if (id === 'dest_none' || /not decided|don.?t know|unsure|not sure/.test(low)) {
          this.draft.destination = null;
          this.draft.destination_undecided = true;
        } else if (id === 'dest_other') {
          return this.say('Please type the hospital or clinic name.');
        } else if (id.startsWith('dest_')) {
          const idx = Number(id.slice(5));
          const name = HOSPITAL_ROWS[idx];
          const g = GAZETTEER.find((x) => x.name === name);
          this.draft.destination = { name, address: g?.address, lat: g?.lat, lng: g?.lng };
        } else if (text) {
          this.draft.destination = { name: text.slice(0, 150) };
        } else return this.askDestination();
        return this.askSpecial();
      case 'SPECIAL':
        if (id !== 'none' && text && !/^(no|none|nothing|na|n\/a)$/i.test(text)) {
          if (text.length > SPECIAL_LIMIT) {
            await this.say(`✂️ We kept the first ${SPECIAL_LIMIT} characters. Our team will call if we need more.`);
          }
          this.draft.special = text.slice(0, SPECIAL_LIMIT);
        }
        if (this.customer?.name) {
          this.draft.customer_name = this.customer.name;
          return this.confirm();
        }
        this.step = 'CUSTOMER_NAME';
        return this.say(`Almost done! What is *your* name?${this.profileName ? `\n\n(Or tap below to use "${this.profileName}")` : ''}`).then(async () => {
          if (this.profileName) await this.say({ body: 'Use your WhatsApp name?', buttons: [{ id: 'use_profile', title: `Use ${this.profileName!.slice(0, 14)}` }] });
        });
      case 'CUSTOMER_NAME':
        if (id === 'use_profile' && this.profileName) this.draft.customer_name = this.profileName;
        else if (text && text.length >= 2) this.draft.customer_name = text.slice(0, 80);
        else return this.say('Please type your name.');
        return this.confirm();
      case 'CONFIRM':
        if (id === 'confirm' || /^(yes|confirm|ok|haan|ha)\b/.test(low)) return this.createRequest();
        return this.confirm();
      case 'ACTIVE':
        return this.activeStatus();
      default:
        return this.welcome();
    }
  }

  async askEmergency() {
    this.step = 'EMERGENCY_CHECK';
    const e = await getSetting('emergency');
    await this.say({
      body: `⚠️ *Is this a medical emergency?*\n\nIf the person has potentially life-threatening symptoms (chest pain, breathing difficulty, unconsciousness, heavy bleeding, stroke signs) or needs immediate medical intervention, contact emergency services (${e.primary_number} / ${e.ambulance_number}) or the nearest hospital immediately.\n\nOur companions are not doctors, nurses or ambulance staff.`,
      buttons: [
        { id: 'emergency', title: '🚑 Call Emergency' },
        { id: 'continue', title: 'Continue Request' },
      ],
    });
  }
  async askRelationship() {
    this.step = 'RELATIONSHIP';
    await this.say({
      body: '*Who needs assistance?*',
      list: { button: 'Choose', rows: [
        { id: 'rel_mother', title: 'Mother' }, { id: 'rel_father', title: 'Father' },
        { id: 'rel_spouse', title: 'Spouse' }, { id: 'rel_other', title: 'Someone Else' },
      ] },
    });
  }
  async askPatientDetails() {
    this.step = 'PATIENT_DETAILS';
    await this.say({ body: "What is their *name and age*? (e.g. _Kamla Devi, 72_)\n\nThis helps our companion greet them correctly.", buttons: [{ id: 'skip', title: 'Skip' }] });
  }
  async askLocation() {
    this.step = 'LOCATION';
    await this.say('📍 *Please share their location.*\n\nTap 📎 → *Location* to send a pin, or type the full address (house/flat, society, sector).');
  }
  async askServiceType() {
    this.step = 'SERVICE_TYPE';
    await this.say({
      body: '*What kind of help do they need?*',
      list: { button: 'Select service', rows: [
        { id: 'hospital_opd', title: 'Hospital / OPD' },
        { id: 'diagnostic', title: 'Diagnostic Test' },
        { id: 'admission', title: 'Admission Support', description: 'Hospital Admission Support' },
        { id: 'discharge', title: 'Hospital Discharge' },
        { id: 'doctor_appointment', title: 'Doctor Appointment' },
        { id: 'not_sure', title: 'Not Sure / Speak to Us' },
      ] },
    });
  }
  async askTime() {
    this.step = 'TIME';
    await this.say({
      body: '⏰ *When do you need the companion?*',
      list: { button: 'Choose time', rows: [
        { id: 't_asap', title: 'ASAP' }, { id: 't_2h', title: 'Within 2 Hours' },
        { id: 't_later', title: 'Later Today' }, { id: 't_schedule', title: 'Schedule', description: 'Pick a date and time' },
      ] },
    });
  }
  async askSchedule() {
    this.step = 'SCHEDULE_DATETIME';
    await this.say('📅 Please send the *date and time* – for example *28/09 10:30 AM* or *tomorrow 9 am*.');
  }
  async askMobility() {
    this.step = 'MOBILITY';
    await this.say({
      body: '🚶 *Can they walk independently?*',
      buttons: [{ id: 'm_yes', title: 'Yes' }, { id: 'm_some', title: 'Needs some assistance' }, { id: 'm_no', title: 'No / Bedridden' }],
    });
  }
  async askDestination() {
    this.step = 'DESTINATION';
    await this.say({
      body: '🏥 *Which hospital/clinic are they going to?*\n\nChoose from the list or type the name.',
      list: { button: 'Choose hospital', rows: [
        ...HOSPITAL_ROWS.map((h, i) => ({ id: `dest_${i}`, title: h.length > 24 ? h.replace('Memorial Research Institute', 'FMRI').replace(' – The Medicity', '').slice(0, 24) : h })),
        { id: 'dest_other', title: 'Other (type name)' },
        { id: 'dest_none', title: 'Not decided' },
      ] },
    });
  }
  async askSpecial() {
    this.step = 'SPECIAL';
    await this.say({
      body: `📝 *Anything important we should know?*\n\nFor example: _uses a walker_, _hard of hearing_, _speaks only Punjabi_, _gate code 1234_.\n\nPlease *don't* share detailed medical history – only what the companion needs. (Max ${SPECIAL_LIMIT} characters)`,
      buttons: [{ id: 'none', title: 'Nothing else' }],
    });
  }

  async confirm() {
    this.step = 'CONFIRM';
    const d = this.draft;
    const rule = await findPricingRule(d.service_type, null);
    const q = rule ? quote(rule, d.urgency) : null;
    const who = d.relationship === 'Someone Else' ? d.relationship_detail || 'Loved one' : d.relationship;
    const e = await getSetting('emergency');
    const lines = [
      '*Please confirm your request*',
      '',
      `👤 For: ${who}${d.patient_name ? ` – ${d.patient_name}` : ''}${d.patient_age ? `, ${d.patient_age}` : ''}`,
      `📍 Pickup: ${d.pickup?.address}`,
      `🏥 Going to: ${d.destination?.name || 'Not decided yet'}`,
      `🩺 Help with: ${serviceTypeLabel(d.service_type)}`,
      `⏰ When: ${d.urgency === 'SCHEDULED' && d.requested_at ? fmtIST(new Date(d.requested_at)) : URGENCY_LABEL[d.urgency]}`,
      `🚶 Mobility: ${MOBILITY_LABEL[d.mobility]}`,
      d.special ? `📝 Notes: ${d.special}` : '',
      '',
      q && rule ? `💰 ${fmtINR(Number(rule.base_fee))} for the first ${rule.included_minutes / 60} hours, then ${fmtINR(Number(rule.extension_rate_per_hour))}/hour${Number(rule.tax_percent) ? ` + ${rule.tax_percent}% GST` : ''}. Pay after the service.` : '',
      '',
      `⚠️ Not an emergency or ambulance service. For emergencies call ${e.primary_number}.`,
    ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '');
    await this.say({
      body: lines.join('\n'),
      buttons: [{ id: 'confirm', title: '✅ Confirm Request' }, { id: 'restart', title: '✏️ Start Over' }, { id: 'talk', title: '📞 Talk to Us' }],
    });
  }

  async createRequest() {
    const d = this.draft;
    if (!d.pickup || !d.service_type || !d.urgency || !d.mobility) return this.welcome();
    const utm = (this.conv.draft?.utm || {}) as any;
    const { request } = await createServiceRequest(
      {
        channel: 'whatsapp',
        customer: { name: d.customer_name, phone: this.phone },
        patient: {
          name: d.patient_name ?? null, age: d.patient_age ?? null,
          relationship: d.relationship === 'Someone Else' ? d.relationship_detail || 'Someone Else' : d.relationship,
        },
        pickup: { address: d.pickup.address, lat: d.pickup.lat, lng: d.pickup.lng, source: d.pickup.source },
        destination: d.destination ?? null,
        destinationUndecided: !!d.destination_undecided,
        serviceType: d.service_type,
        urgency: d.urgency,
        requestedAt: d.requested_at ?? null,
        mobility: d.mobility,
        specialInstructions: d.special ?? null,
        source: this.conv.source === 'simulator' ? 'whatsapp_simulator' : 'whatsapp',
        utm,
        idempotencyKey: `wa:${this.conv.id}:${d.nonce}`,
      },
      { type: 'customer', id: null, name: d.customer_name || this.phone },
    );
    this.activeRequestId = request.id;
    this.step = 'ACTIVE';
    this.draft = {};
  }

  async activeStatus(withLink = false) {
    if (!this.activeRequestId) return this.welcome();
    const r = (await sql`SELECT * FROM service_requests WHERE id = ${this.activeRequestId}`)[0];
    if (!r || TERMINAL.includes(r.current_status)) {
      this.step = 'MENU';
      return this.welcome();
    }
    const v = await requestVars(r.id);
    await this.say({
      body: `Your request *${r.request_number}* is currently: *${STATUS_LABEL[r.current_status]}*.${withLink ? `\n\nTrack live: ${v.track_url}` : ''}\n\nHow can we help?`,
      buttons: [{ id: 'track', title: '📍 Track' }, { id: 'talk', title: '📞 Talk to Us' }, { id: 'new_request', title: '➕ New Request' }],
    });
    this.step = 'ACTIVE';
  }
}

// ------------------------------------------------------------------ helpers
function istDate(y: number, mo: number, d: number, h: number, mi: number) {
  return new Date(Date.UTC(y, mo, d, h, mi) - 330 * 60000);
}
export function fmtIST(d: Date) {
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}
export function parseDateTime(input: string): Date | null {
  const s = input.toLowerCase().replace(/\s+/g, ' ').trim();
  const nowIst = new Date(Date.now() + 330 * 60000);
  let y = nowIst.getUTCFullYear();
  let mo = nowIst.getUTCMonth();
  let d = nowIst.getUTCDate();
  let rest = s;
  const rel = s.match(/^(today|tomorrow|tmrw|kal)\b\s*(.*)$/);
  const abs = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\s*(.*)$/);
  if (rel) {
    if (rel[1] !== 'today') {
      const t = new Date(Date.UTC(y, mo, d) + 86400000);
      y = t.getUTCFullYear(); mo = t.getUTCMonth(); d = t.getUTCDate();
    }
    rest = rel[2];
  } else if (abs) {
    d = Number(abs[1]); mo = Number(abs[2]) - 1;
    if (abs[3]) y = Number(abs[3].length === 2 ? '20' + abs[3] : abs[3]);
    rest = abs[4];
    if (!abs[3] && istDate(y, mo, d, 23, 59).getTime() < Date.now()) y += 1;
  } else return null;
  const tm = rest.replace(/^(at|@)\s*/, '').match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/);
  if (!tm) return null;
  let h = Number(tm[1]);
  const mi = Number(tm[2] || 0);
  if (tm[3] === 'pm' && h < 12) h += 12;
  if (tm[3] === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59 || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return istDate(y, mo, d, h, mi);
}

/** Builds a Meta-format webhook payload (used by the in-app simulator so it exercises the real webhook code path). */
export function buildInboundPayload(phone: string, name: string | null, message: any) {
  const wa = phone.replace(/[^\d]/g, '');
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'SIMULATOR',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: 'SIMULATOR', phone_number_id: 'SIMULATOR' },
          contacts: [{ profile: { name: name || 'Customer' }, wa_id: wa }],
          messages: [{ from: wa, id: 'wamid.IN' + crypto.randomBytes(10).toString('hex'), timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
        },
      }],
    }],
  };
}

export { patientRef, SYSTEM };
