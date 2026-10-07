import React, { useState } from 'react';
import {
  FiCheck, FiX, FiShield, FiMessageCircle, FiMapPin, FiClock, FiUserCheck, FiHeart, FiFileText, FiTruck, FiHome,
  FiActivity, FiClipboard, FiUsers, FiChevronDown, FiPhoneCall, FiCreditCard, FiAlertTriangle, FiStar,
} from 'react-icons/fi';
import { FaWhatsapp, FaHospital, FaPills, FaProcedures, FaStethoscope, FaVial, FaWheelchair } from 'react-icons/fa';
import { PublicShell, WhatsAppCTA, CallCTA } from '../../components/public';
import { useConfig } from '../../lib/config';
import { Link } from '../../lib/router';
import { fmtINR } from '../../../shared/constants';
import { cx } from '../../components/ui';

const SERVICES: [React.ReactNode, string, string][] = [
  [<FaHospital />, 'Hospital accompaniment', 'From the front door to the ward and back.'],
  [<FaStethoscope />, 'OPD visits', 'Queues, tokens, follow-ups handled.'],
  [<FiUserCheck />, 'Doctor appointments', 'Someone beside them in the consultation room.'],
  [<FaVial />, 'Diagnostics', 'Blood tests, scans, X-rays — no confusion.'],
  [<FiClipboard />, 'Registration', 'Forms, IDs, insurance desk, billing counter.'],
  [<FiClock />, 'Queues & waiting', 'We wait so they can sit and rest.'],
  [<FiFileText />, 'Reports & documents', 'Collected, organised, photographed for you.'],
  [<FaPills />, 'Pharmacy', 'Medicines picked up exactly as prescribed.'],
  [<FaProcedures />, 'Admission coordination', 'Paperwork, room allocation, settling in.'],
  [<FiHome />, 'Discharge coordination', 'Summary, bills, medicines, safe ride home.'],
  [<FiTruck />, 'Transport coordination', 'Cab arranged, wheelchair at the gate.'],
  [<FiMessageCircle />, 'Family updates', 'Live WhatsApp updates at every step.'],
  [<FaWheelchair />, 'Return-home assistance', 'Home safely, handed over to family.'],
];

const STEPS: [string, string][] = [
  ['Tell us who needs help', 'Message us on WhatsApp or call. Share your parent’s location, where they need to go and when.'],
  ['We assign a verified companion', 'Our operations team personally picks a background-checked, trained companion near them.'],
  ['We reach your loved one', 'Your companion arrives, verifies with a booking code and introduces themselves.'],
  ['We stay with them', 'Registration, queues, consultations, tests, pharmacy — they are never alone.'],
  ['You stay informed', 'Updates on WhatsApp at every milestone, and a summary when they’re home.'],
];

const TIMELINE: [string, string, boolean?][] = [
  ['12:01', 'Request received'], ['12:05', 'Companion assigned — Amit K.'], ['12:28', 'Amit reached your mother', true],
  ['12:49', 'Reached Medanta'], ['13:10', 'Registration completed'], ['13:42', 'Consultation underway'], ['15:52', 'Returning home'], ['16:16', 'Mother is home safely', true],
];

const FAQ: [string, string][] = [
  ['Is this a medical or emergency service?', 'No. Our companions are trained, verified people who accompany and coordinate — they don’t diagnose, prescribe, give treatment or replace doctors, nurses, ambulances or emergency services. In an emergency, call 112 or 108 immediately.'],
  ['How quickly can someone reach my parent?', 'For urgent requests we aim to dispatch within minutes and reach within about an hour in most of Gurugram, depending on traffic and availability. Our team confirms a real ETA before you commit.'],
  ['Who are the companions?', 'Local, trained companions who have completed government ID verification, a background check, an interview and hospital navigation & escalation training before they can take any job.'],
  ['How do I know what’s happening?', 'You get WhatsApp updates at each milestone — companion assigned, arrived, reached hospital, consultation, returning home — plus a tracking link with the full timeline.'],
  ['How does payment work?', 'You pay after the service via UPI, card or payment link. The base fee covers the first hours; longer visits are billed per extra hour. Out-of-pocket costs like cabs or parking are passed on at actuals, with receipts.'],
  ['What if my parent cannot walk?', 'Tell us. Our team reviews every request where someone is bedridden or needs significant support and will call you before confirming — some situations need medical transport rather than a companion.'],
  ['What information do you keep?', 'Only what we need to deliver the service. We avoid collecting medical history, companions see only job-relevant details, and every access is logged. See our privacy notice.'],
];

export default function Landing() {
  const c = useConfig();
  const general = c?.pricing.find((p) => p.service_type === '*') || c?.pricing[0];
  const others = c?.pricing.filter((p) => p !== general) || [];
  return (
    <PublicShell>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-brand-100),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:pt-16 lg:grid-cols-[1.1fr_.9fr] lg:pb-24">
          <div className="fade-up">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-800 shadow-soft ring-1 ring-brand-100">
              <span className="relative flex h-2 w-2 text-emerald-500"><span className="pulse-ring absolute inset-0" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>
              Serving {c?.brand.city || 'Gurugram'}
            </span>
            <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-brand-950 sm:text-6xl">
              Your parents need help.<br />
              <span className="text-slate-500">You can’t be there.</span><br />
              <span className="relative inline-block text-coral-500">We can.
                <svg className="absolute -bottom-2 left-0 w-full text-coral-400/60" viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M2 9C50 3 150 2 198 7" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              A verified companion reaches your mother or father, takes them to the hospital, clinic or lab, stays with them through every queue — and keeps you updated on WhatsApp until they’re home.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <WhatsAppCTA />
              <CallCTA />
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
              <li className="flex items-center gap-1.5"><FiShield className="text-brand-600" /> Background-verified companions</li>
              <li className="flex items-center gap-1.5"><FaWhatsapp className="text-wa" /> Live WhatsApp updates</li>
              <li className="flex items-center gap-1.5"><FiCreditCard className="text-brand-600" /> Pay after the visit</li>
            </ul>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* EMERGENCY STRIP */}
      <div className="border-y border-red-100 bg-red-50/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3 text-center text-sm text-red-900">
          <FiAlertTriangle className="shrink-0" />
          <span><strong>Medical emergency?</strong> We are not an ambulance or emergency service. Call <a className="font-bold underline" href={`tel:${c?.emergency.primary_number || '112'}`}>{c?.emergency.primary_number || '112'}</a> or <a className="font-bold underline" href={`tel:${c?.emergency.ambulance_number || '108'}`}>{c?.emergency.ambulance_number || '108'}</a> immediately.</span>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="kicker">How it works</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Someone will be there. From the first message to “they’re home”.</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-5">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="relative">
                <div className="flex items-center gap-3 md:block">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 font-display text-lg font-semibold text-white shadow-soft">{i + 1}</span>
                  {i < STEPS.length - 1 && <span className="absolute left-14 right-0 top-5 hidden h-px bg-gradient-to-r from-brand-200 to-transparent md:block" />}
                  <h3 className="font-bold text-ink md:mt-4">{t}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="kicker">What we help with</p>
              <h2 className="mt-2 max-w-xl font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Every part of the hospital visit — handled.</h2>
            </div>
            <p className="max-w-sm text-slate-600">Hospitals are confusing and exhausting, especially alone. Our companions know the desks, the corridors and the process.</p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map(([icon, t, d]) => (
              <div key={t} className="group rounded-2xl bg-white p-5 ring-1 ring-warm-200 transition hover:-translate-y-0.5 hover:shadow-lift hover:ring-brand-200">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white">{icon}</div>
                <h3 className="mt-4 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UPDATES / TIMELINE */}
      <section className="bg-brand-900 py-20 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-brand-300">You stay informed</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Know exactly what’s happening — even from another city.</h2>
            <p className="mt-4 max-w-lg text-brand-100">
              Every milestone is recorded and shared with you on WhatsApp. Our operations team watches every active visit and can step in the moment something doesn’t go to plan.
            </p>
            <ul className="mt-8 space-y-3 text-brand-50">
              {['Someone trustworthy is taking ownership.', 'You know what is happening, as it happens.', 'Operations can intervene whenever something goes wrong.'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-coral-500"><FiCheck className="h-3 w-3" /></span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
            <p className="text-sm font-semibold text-brand-200">Example visit · MC-10452</p>
            <ol className="mt-5 space-y-0">
              {TIMELINE.map(([t, l, hi], i) => (
                <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < TIMELINE.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-white/15" />}
                  <span className={cx('relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4', hi ? 'bg-coral-400 ring-coral-400/20' : 'bg-brand-300 ring-brand-300/10')} />
                  <span className="w-12 shrink-0 font-mono text-sm tabular-nums text-brand-300">{t}</span>
                  <span className={cx('text-sm', hi ? 'font-semibold text-white' : 'text-brand-50')}>{l}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* SAFETY / BOUNDARY (FR-WEB-006) */}
      <section id="safety" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="kicker">Trust & safety</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Clear about what we do — and what we don’t.</h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <div className="rounded-3xl bg-brand-50 p-7 ring-1 ring-brand-100">
              <h3 className="flex items-center gap-2 font-bold text-brand-900"><FiShield /> Every companion is</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-brand-900">
                {(c?.verification_claims || []).map((v) => <li key={v} className="flex gap-2"><FiCheck className="mt-0.5 shrink-0 text-brand-600" />{v}</li>)}
                <li className="flex gap-2"><FiCheck className="mt-0.5 shrink-0 text-brand-600" />Supported live by our operations team</li>
              </ul>
            </div>
            <div className="rounded-3xl bg-warm-50 p-7 ring-1 ring-warm-200">
              <h3 className="flex items-center gap-2 font-bold"><FiHeart className="text-coral-500" /> Our companions do</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
                {['Accompany, guide and reassure', 'Handle registration, queues & paperwork', 'Coordinate transport, pharmacy & reports', 'Keep your family updated', 'Escalate to emergency services if needed'].map((t) => <li key={t} className="flex gap-2"><FiCheck className="mt-0.5 shrink-0 text-emerald-600" />{t}</li>)}
              </ul>
            </div>
            <div className="rounded-3xl bg-white p-7 ring-1 ring-red-100">
              <h3 className="flex items-center gap-2 font-bold text-red-800"><FiX /> Our companions do not</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
                {['Diagnose medical conditions', 'Prescribe medication', 'Provide clinical treatment', 'Replace doctors', 'Replace nurses', 'Replace ambulances', 'Replace emergency medical services'].map((t) => <li key={t} className="flex gap-2"><FiX className="mt-0.5 shrink-0 text-red-500" />{t}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="kicker">Simple pricing</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Pay after the visit. No subscriptions.</h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
            {general && (
              <div className="relative rounded-3xl bg-white p-8 shadow-lift ring-2 ring-brand-600">
                <span className="absolute -top-3 left-8 rounded-full bg-brand-700 px-3 py-1 text-xs font-bold text-white">Most visits</span>
                <h3 className="font-bold">{general.name}</h3>
                <p className="mt-1 text-sm text-slate-500">OPD, doctor visits, diagnostics, discharge, pharmacy</p>
                <p className="mt-5 flex items-baseline gap-1"><span className="font-display text-5xl font-semibold text-brand-950">{fmtINR(general.base_fee)}</span></p>
                <p className="mt-1 text-sm text-slate-600">first {general.included_minutes / 60} hours · then {fmtINR(general.extension_rate_per_hour)}/hour</p>
                <ul className="mt-6 space-y-2 text-sm text-slate-700">
                  {['Pickup from home & return', 'Registration, queues, consultation', 'Tests, reports & pharmacy', 'WhatsApp updates + visit summary'].map((t) => <li key={t} className="flex gap-2"><FiCheck className="mt-0.5 text-brand-600" />{t}</li>)}
                </ul>
                <WhatsAppCTA size="md" className="mt-7 w-full" label="Book on WhatsApp" />
              </div>
            )}
            {others.map((p) => (
              <div key={p.id} className="rounded-3xl bg-white p-8 ring-1 ring-warm-200">
                <h3 className="font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-500">Longer stays for hospital admission</p>
                <p className="mt-5 font-display text-5xl font-semibold text-brand-950">{fmtINR(p.base_fee)}</p>
                <p className="mt-1 text-sm text-slate-600">first {p.included_minutes / 60} hours · then {fmtINR(p.extension_rate_per_hour)}/hour</p>
                <ul className="mt-6 space-y-2 text-sm text-slate-700">
                  {['Admission paperwork & insurance desk', 'Room allocation & settling in', 'Handover to ward staff', 'Updates to the whole family'].map((t) => <li key={t} className="flex gap-2"><FiCheck className="mt-0.5 text-brand-600" />{t}</li>)}
                </ul>
                <CallCTA size="md" className="mt-7 w-full" label="Talk to us" />
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-500">
            {general && Number(general.tax_percent) > 0 ? `Prices exclude ${general.tax_percent}% GST. ` : ''}Cabs, parking and other approved out-of-pocket costs are billed at actuals with receipts. Hospital, doctor and medicine bills are paid directly to the provider.
            Pay by UPI, cards or payment link.
          </p>
        </div>
      </section>

      {/* AREA */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="kicker">Where we work</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Serving Gurugram</h2>
            <p className="mt-4 text-slate-600">From DLF and Golf Course Road to Sohna Road, Palam Vihar and New Gurugram. Outside the area? Message us anyway — our team will review personally before promising anything.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['DLF Phase 1–5', 'Golf Course Road', 'Sushant Lok', 'Sohna Road', 'South City', 'Palam Vihar', 'Nirvana Country', 'Sector 56–57', 'Cyber City', 'Manesar'].map((l) => <span key={l} className="rounded-full bg-warm-100 px-3 py-1.5 text-sm text-slate-700"><FiMapPin className="mr-1 inline h-3.5 w-3.5 text-brand-600" />{l}</span>)}
            </div>
          </div>
          <div className="rounded-3xl bg-warm-50 p-7 ring-1 ring-warm-200">
            <p className="text-sm font-bold text-slate-700">Hospitals our companions visit regularly</p>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {['Medanta – The Medicity', 'Artemis Hospital', 'Fortis Memorial (FMRI)', 'Max Hospital Gurugram', 'Paras Hospital', 'CK Birla Hospital', 'W Pratiksha Hospital', 'Manipal Hospital'].map((h) => <li key={h} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-warm-200"><FaHospital className="text-brand-600" />{h}</li>)}
            </ul>
            <p className="mt-4 text-xs text-slate-500">We are independent and not affiliated with these hospitals.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <p className="kicker text-center">Questions</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Things families ask us</h2>
          <div className="mt-10 divide-y divide-warm-200 rounded-3xl bg-white ring-1 ring-warm-200">
            {FAQ.map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-14 text-center text-white shadow-lift sm:px-12">
          <FiUsers className="mx-auto h-8 w-8 text-brand-200" />
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">When you can’t be there, we can.</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">Tell us who needs help. A real person on our team will take it from there.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <WhatsAppCTA />
            <CallCTA className="!bg-white/10 !text-white !ring-white/30 hover:!bg-white/20" />
          </div>
          <p className="mt-6 text-sm text-brand-200">Prefer a form? <Link to="/book" className="font-semibold text-white underline">Book online</Link> · Already booked? <Link to="/track-lookup" className="font-semibold text-white underline">Track your request</Link></p>
        </div>
      </section>
    </PublicShell>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
        {q}<FiChevronDown className={cx('shrink-0 transition', open && 'rotate-180')} />
      </button>
      {open && <p className="fade-up px-6 pb-5 text-sm leading-relaxed text-slate-600">{a}</p>}
    </div>
  );
}

function PhoneMock() {
  const msgs: { me?: boolean; t: string; time: string; bold?: string }[] = [
    { me: true, t: 'Hi, Mummy has an OPD at Medanta at 12:30. I’m in Bengaluru 🙏', time: '11:52' },
    { bold: 'Companion Assigned', t: 'Amit Kumar has been assigned.\n✅ Verified · ID CMP-101\n🗣 Hindi, English\n⏱ ETA 12:25', time: '12:05' },
    { t: '🏠 Amit has reached your mother.', time: '12:28' },
    { bold: 'Reached Hospital', t: 'Amit and your mother have reached the hospital. We’ll keep you updated.', time: '12:49' },
    { t: '📋 Consultation underway — token 14', time: '13:42' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[340px] fade-up" style={{ animationDelay: '.1s' }}>
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-tr from-coral-400/20 via-brand-200/40 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-[2.4rem] border-[10px] border-slate-900 bg-slate-900 shadow-lift">
        <div className="flex items-center gap-3 bg-[#075e54] px-4 pb-3 pt-4 text-white">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-full" />
          <div className="leading-tight"><p className="text-sm font-semibold">ChampOnCall</p><p className="text-[11px] text-emerald-100">Business account</p></div>
        </div>
        <div className="wa-bg space-y-2 px-3 py-4" style={{ minHeight: 400 }}>
          {msgs.map((m, i) => (
            <div key={i} className={cx('max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-snug shadow-sm fade-up', m.me ? 'ml-auto rounded-tr-sm bg-[#d9fdd3]' : 'rounded-tl-sm bg-white')} style={{ animationDelay: `${0.3 + i * 0.35}s` }}>
              {m.bold && <p className="font-bold">{m.bold}</p>}
              <p className="whitespace-pre-line text-slate-800">{m.t}</p>
              <p className="mt-0.5 text-right text-[10px] text-slate-400">{m.time}{m.me && ' ✓✓'}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -left-8 bottom-16 hidden rounded-2xl bg-white p-3 shadow-lift ring-1 ring-slate-100 sm:block fade-up" style={{ animationDelay: '2s' }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><FiActivity /></span>
          <div><p className="text-xs text-slate-500">Mother is home safely</p><p className="text-sm font-bold">4h 12m · <FiStar className="inline text-amber-500" /> 5.0</p></div>
        </div>
      </div>
      <div className="absolute -right-6 top-24 hidden rounded-2xl bg-white px-3 py-2 shadow-lift ring-1 ring-slate-100 sm:block fade-up" style={{ animationDelay: '1.2s' }}>
        <p className="flex items-center gap-1.5 text-xs font-semibold"><FiPhoneCall className="text-brand-600" /> Ops team watching live</p>
      </div>
    </div>
  );
}
