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
  // A real WhatsApp message proves this is a live number: if the same phone was used earlier in the
  // website simulator, switch the conversation to the live channel so replies reach the customer's phone.
  if (source === 'whatsapp' && conv0.source !== 'whatsapp') {
    await sql`UPDATE wa_conversations SET source = 'whatsapp', sim_owner = NULL, updated_at = now() WHERE id = ${conv0.id}`;
    conv0.source = 'whatsapp';
    conv0.sim_owner = null;
  }
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
        { id: 'schedule', title: '📅 Book for Later' },
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
    if (/^rate_[1-5]$/.test(id) || (['ACTIVE', 'MENU', 'START'].includes(this.step) && /^[1-5]\s*(★|⭐|stars?)?$/.test(low) && !!(await this.lastCompleted()))) return this.rate(Number(id ? id.slice(5) : low[0]));
    if (id === 'trust_yes' || id === 'trust_no') return this.trust(id === 'trust_yes');
    if (this.step === 'RATE_COMMENT' && text) return this.rateComment(text);

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
      case 'PATIENT_NAME': {
        if (id === 'skip' || !text) return this.askPatientAge();
        // Someone may still type both ("Kamla Devi, 72") – keep the name and the age separately
        const ageM = text.match(/(?:^|[\s,\-–(])(\d{1,3})\s*(?:yrs?|years?|y|saal)?\s*\)?\s*(?:old)?\s*$/i);
        const name = (ageM ? text.slice(0, ageM.index) : text).replace(/\b(age|aged|umar)\b\s*[:\-]?\s*$/i, '').replace(/[\s,\-–:]+$/, '').trim();
        if (name && /[a-z]/i.test(name)) this.draft.patient_name = name.replace(/^(name\s*(is|:)?\s*)/i, '').slice(0, 80);
        if (ageM && Number(ageM[1]) > 0 && Number(ageM[1]) < 120) {
          this.draft.patient_age = Number(ageM[1]);
          return this.askLocation();
        }
        return this.askPatientAge();
      }
      case 'PATIENT_AGE': {
        if (id !== 'skip' && text) {
          const ageM = text.match(/\d{1,3}/);
          const age = ageM ? Number(ageM[0]) : NaN;
          if (!(age > 0 && age < 120)) return this.say({ body: 'Please send their age as a number, e.g. *72*.', buttons: [{ id: 'skip', title: 'Skip' }] });
          this.draft.patient_age = age;
        }
        return this.askLocation();
      }
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
        // A date sent earlier without a time ("15 nov") is combined with this reply ("11 am")
        const alone = parseDateTimeEx(text);
        const p = this.draft.pending_date && !alone.hadDate ? parseDateTimeEx(`${this.draft.pending_date} ${text}`) : alone;
        if (!p.date && p.dateOnly) {
          this.draft.pending_date = p.dateOnly;
          const [yy, mm, dd] = p.dateOnly.split('-').map(Number);
          const label = new Date(Date.UTC(yy, mm - 1, dd, 6)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
          return this.say(`⏰ What time on *${label}*? (for example *10 am* or *4:30 pm*)`);
        }
        const d = p.date;
        if (!d) return this.say('Sorry, I could not read that. Please send the date and time, for example *10 Oct 11 am*, *tomorrow 9 am* or *Monday 4 pm*.');
        if (d.getTime() < Date.now() + 30 * 60000) return this.say('Please choose a time at least 30 minutes from now. For urgent help, type *menu* and choose Get Help Now.');
        if (d.getTime() > Date.now() + 60 * 86400000) return this.say('We can schedule up to 60 days ahead. Please send an earlier date.');
        this.draft.requested_at = d.toISOString();
        delete this.draft.pending_date;
        await this.say(`📅 Noted: *${fmtIST(d)}*. If that's not right, type *menu* to start again.`);
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
    this.step = 'PATIENT_NAME';
    await this.say({ body: "What is their *name*? (e.g. _Kamla Devi_)\n\nThis helps our companion greet them correctly.", buttons: [{ id: 'skip', title: 'Skip' }] });
  }
  async askPatientAge() {
    this.step = 'PATIENT_AGE';
    await this.say({ body: `How old is ${this.draft.patient_name ? `*${this.draft.patient_name}*` : 'the patient'}? (e.g. _72_)`, buttons: [{ id: 'skip', title: 'Skip' }] });
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
    await this.say('📅 When do you need the companion? Send the *date and time* in any format, for example *10 Oct 11 am*, *tomorrow 9 am* or *Monday 4 pm*.');
  }
  async askMobility() {
    this.step = 'MOBILITY';
    await this.say({
      body: '🚶 *Can they walk independently?*',
      buttons: [{ id: 'm_yes', title: 'Yes' }, { id: 'm_some', title: 'Needs some help' }, { id: 'm_no', title: 'No / Bedridden' }],
    });
  }
  async askDestination() {
    this.step = 'DESTINATION';
    await this.say({
      body: '🏥 *Which hospital/clinic are they going to?*\n\nChoose from the list or type the name.',
      list: { button: 'Choose hospital', rows: [
        ...HOSPITAL_ROWS.map((h, i) => ({ id: `dest_${i}`, title: h.length > 24 ? h.replace('Memorial Research Institute', 'FMRI').replace(' – The Medicity', '').replace(' Hospital Gurugram', ' Hospital').slice(0, 24) : h })),
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

  // ---- ratings collected inside WhatsApp (the "Rate us" list sent after the service)
  async lastCompleted() {
    return (await sql`SELECT r.id, r.request_number, r.assigned_companion_id FROM service_requests r JOIN customers c ON c.id = r.customer_id
      WHERE c.phone = ${this.phone} AND r.current_status = 'COMPLETED' AND r.updated_at > now() - interval '30 days'
      ORDER BY r.updated_at DESC LIMIT 1`)[0];
  }
  async rate(stars: number) {
    const r = await this.lastCompleted();
    if (!r) { this.step = 'MENU'; return this.say('Thank you! We could not find a recently completed visit to rate. Type *menu* to see options.'); }
    const done = (await sql`SELECT overall FROM ratings WHERE request_id = ${r.id}`)[0];
    if (done) { this.step = 'MENU'; return this.say(`🙏 You have already rated ${r.request_number} (${done.overall}★). Thank you!`); }
    await sql`INSERT INTO ratings (request_id, companion_id, overall) VALUES (${r.id}, ${r.assigned_companion_id}, ${stars}) ON CONFLICT (request_id) DO NOTHING`;
    await sql`INSERT INTO status_events (request_id, event_type, label, actor_type, actor_name, customer_visible)
              VALUES (${r.id}, 'rated', ${`Rated ${stars}★ on WhatsApp`}, 'customer', ${this.customer?.name || this.phone}, false)`;
    if (stars <= 2) await alertOps(r.id, 'low_rating', `⚠ Low rating on ${r.request_number}`, `${stars}★ given on WhatsApp`, 'WARNING');
    this.draft = { ...this.draft, rating_request: r.id };
    this.step = 'RATE_TRUST';
    await this.say({ body: `Thank you for rating ${stars}★ 🙏\n\nWould you trust us to help your family again?`, buttons: [{ id: 'trust_yes', title: '👍 Yes' }, { id: 'trust_no', title: '👎 No' }] });
  }
  async trust(yes: boolean) {
    const rid = this.draft.rating_request || (await this.lastCompleted())?.id;
    if (rid) {
      await sql`INSERT INTO trust_responses (request_id, trust_again) VALUES (${rid}, ${yes}) ON CONFLICT (request_id) DO NOTHING`;
      if (!yes) await alertOps(rid, 'low_rating', 'Customer would not trust us again', 'Answered "No" on WhatsApp – please call them', 'WARNING');
    }
    this.step = 'RATE_COMMENT';
    await this.say({ body: yes ? 'Wonderful, thank you! Anything you would like to tell us or your Champ? (optional)' : "We're sorry we let you down. Please tell us what went wrong – our team will call you.", buttons: [{ id: 'restart', title: 'No, thanks' }] });
  }
  async rateComment(text: string) {
    const rid = this.draft.rating_request || (await this.lastCompleted())?.id;
    if (rid) {
      await sql`UPDATE ratings SET comment = ${text.slice(0, 1000)} WHERE request_id = ${rid} AND comment IS NULL`;
      await alertOps(rid, 'rating_comment', 'Customer feedback', text.slice(0, 300), 'INFO');
    }
    this.step = 'MENU';
    this.draft = {};
    await this.say('🙏 Thank you for your feedback. Type *menu* whenever you need us again.');
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
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

/**
 * Reads a date and time written the way people actually type it, in India time. Examples that work:
 * "10 oct 11pm", "oct 10 at 11:30 pm", "10/10 23:00", "tomorrow 9 am", "kal subah 10 baje", "monday 4pm",
 * "11pm" (today, or tomorrow if that time has passed), "10th October 2026 10.30am", "2026-10-10 18:00".
 */
export function parseDateTime(input: string): Date | null {
  return parseDateTimeEx(input).date;
}

/** Like parseDateTime, but also reports a date given without a time ("15 nov") so the bot can ask for the time. */
export function parseDateTimeEx(input: string): { date: Date | null; dateOnly: string | null; hadDate: boolean } {
  const none = { date: null, dateOnly: null, hadDate: false };
  let s = ` ${String(input || '').toLowerCase()} `
    .replace(/[,;]/g, ' ')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/\b(a\.m\.?|a m)\b/g, 'am').replace(/\b(p\.m\.?|p m)\b/g, 'pm')
    .replace(/\bbaje\b|\bo'?clock\b|\bhrs?\b/g, ' ')
    .replace(/\s+/g, ' ');
  const nowIst = new Date(Date.now() + 330 * 60000);
  const todayY = nowIst.getUTCFullYear(), todayM = nowIst.getUTCMonth(), todayD = nowIst.getUTCDate();

  // ---- time
  let h = null as number | null;
  let mi = 0;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean) => {
    const m = s.match(re);
    if (m && fn(m)) { s = s.replace(m[0], ' '); return true; }
    return false;
  };
  take(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/, (m) => {
    h = Number(m[1]); mi = Number(m[2] || 0);
    if (h < 1 || h > 12 || mi > 59) return false;
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return true;
  }) ||
  take(/\b([01]?\d|2[0-3])[:](\d{2})\b/, (m) => { h = Number(m[1]); mi = Number(m[2]); return mi <= 59; }) ||
  take(/\b(noon|midday)\b/, () => { h = 12; return true; }) ||
  take(/\bmidnight\b/, () => { h = 0; return true; });
  // Hindi/English part-of-day words decide am/pm for a bare hour ("kal subah 10", "tomorrow evening 6")
  let part = null as 'am' | 'pm' | null;
  take(/\b(morning|subah|savere)\b/, () => { part = 'am'; return true; });
  take(/\b(afternoon|dopahar|evening|shaam|sham|night|raat|tonight)\b/, (m) => { part = 'pm'; if (m[1] === 'tonight') s += ' today '; return true; });

  // ---- date
  let y = null as number | null, mo = null as number | null, d = null as number | null;
  const setYmd = (yy: number, mm: number, dd: number) => { y = yy; mo = mm; d = dd; return true; };
  const addDays = (n: number) => { const t = new Date(Date.UTC(todayY, todayM, todayD) + n * 86400000); return setYmd(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
  const fullYear = (v?: string) => (v ? Number(v.length === 2 ? '20' + v : v) : null);
  let explicitYear = false as boolean;
  take(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => { explicitYear = true; return setYmd(Number(m[1]), Number(m[2]) - 1, Number(m[3])); }) ||
  take(new RegExp(`\\b(\\d{1,2})\\s*(?:-|\\s|of\\s)?${MONTH_RE}\\b(?:\\s*(\\d{4}))?`), (m) => {
    const yy = fullYear(m[3]); if (yy) explicitYear = true;
    return setYmd(yy ?? todayY, MONTHS[m[2]] ?? MONTHS[m[2].slice(0, 3)], Number(m[1]));
  }) ||
  take(new RegExp(`\\b${MONTH_RE}\\s*(\\d{1,2})\\b(?:\\s*(\\d{4}))?`), (m) => {
    const yy = fullYear(m[3]); if (yy) explicitYear = true;
    return setYmd(yy ?? todayY, MONTHS[m[1]] ?? MONTHS[m[1].slice(0, 3)], Number(m[2]));
  }) ||
  take(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/, (m) => {
    const yy = fullYear(m[3]); if (yy) explicitYear = true;
    return setYmd(yy ?? todayY, Number(m[2]) - 1, Number(m[1]));
  }) ||
  take(/\b(day after tomorrow|parso|parson)\b/, () => addDays(2)) ||
  take(/\b(tomorrow|tmrw|tmr|tomorow|tommorow|tommorrow|kal)\b/, () => addDays(1)) ||
  take(/\b(today|aaj|tonight)\b/, () => addDays(0)) ||
  take(/\b(?:next\s+|this\s+|coming\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs?|rsday)?|fri(?:day)?|sat(?:urday)?)\b/, (m) => {
    const want = WEEKDAYS[m[1]];
    const today = new Date(Date.UTC(todayY, todayM, todayD)).getUTCDay();
    let diff = (want - today + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(diff);
  });

  // A bare hour left over ("10 oct 11", "tomorrow 4") – read 1–7 as afternoon/evening unless "morning" was said
  if (h == null) {
    const m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\b/);
    if (m && Number(m[1]) <= 23) {
      h = Number(m[1]); mi = Number(m[2] || 0);
      if (mi > 59) return none;
      if (part === 'pm' && h < 12) h += 12;
      else if (part === 'am' && h === 12) h = 0;
      else if (!part && h >= 1 && h <= 7) h += 12;
    }
  } else if (part === 'pm' && h < 12) h += 12;
  if (h == null) {
    if (part === 'am') h = 9;
    else if (part === 'pm') h = 17;
    else if (d != null && mo! >= 0 && mo! <= 11 && d! >= 1 && d! <= 31) {
      let yy = y!;
      if (!explicitYear && istDate(yy, mo!, d!, 23, 59).getTime() < Date.now()) yy += 1;
      return { date: null, hadDate: true, dateOnly: `${yy}-${String(mo! + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
    } else return none;
  }
  if (h > 23) return none;

  if (d == null) {
    // Only a time: today, or tomorrow if that time has already passed
    let t = istDate(todayY, todayM, todayD, h, mi);
    if (t.getTime() < Date.now()) t = new Date(t.getTime() + 86400000);
    return { date: t, dateOnly: null, hadDate: false };
  }
  if (mo! < 0 || mo! > 11 || d! < 1 || d! > 31) return none;
  let out = istDate(y!, mo!, d!, h, mi);
  const check = new Date(out.getTime() + 330 * 60000);
  if (check.getUTCDate() !== d) return none; // e.g. 31 Feb
  if (!explicitYear && out.getTime() < Date.now() - 86400000) out = istDate(y! + 1, mo!, d!, h, mi);
  return { date: out, dateOnly: null, hadDate: true };
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
