import React from 'react';
import { FiMonitor, FiSmartphone, FiGlobe, FiMessageCircle, FiKey, FiCheck } from 'react-icons/fi';
import { PublicShell } from '../../components/public';
import { useConfig } from '../../lib/config';
import { Link } from '../../lib/router';

function Doc({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-brand-950 sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>}
        <div className="prose-sm mt-8 space-y-5 text-[15px] leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
      </article>
    </PublicShell>
  );
}

export function Privacy() {
  const c = useConfig();
  return (
    <Doc title="Privacy notice" updated="September 2026">
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">Draft for legal review. Exact obligations under the Digital Personal Data Protection Act, 2023 and other applicable Indian law must be confirmed before production launch.</p>
      <p>{c?.brand.name || 'Medical Champion'} coordinates companions who accompany people to medical appointments. We collect only the information needed to deliver that service.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Your name, mobile/WhatsApp number and optional email.</li>
        <li>About the person receiving help: name, age, relationship to you, pickup address/location, mobility level, language preference and short instructions you choose to share.</li>
        <li>Service records: timestamps, status updates, companion notes, expenses and receipts, payment references, ratings and feedback.</li>
        <li>WhatsApp message history with our business account, and location shared by our companions during a job where appropriate.</li>
      </ul>
      <h2>What we avoid</h2>
      <p>We do not ask for diagnoses, prescriptions or medical history. Please share only what the companion needs to help safely (for example “uses a walker”).</p>
      <h2>How we use it</h2>
      <ul>
        <li>To assess, dispatch, deliver and bill your request; to keep you updated; to handle incidents and complaints.</li>
        <li>To measure service quality (for example arrival times and whether you would trust us again).</li>
      </ul>
      <h2>Who can see it</h2>
      <ul>
        <li>Companions see only job-relevant details for jobs assigned to them, and the full address only after accepting.</li>
        <li>Our operations staff access data based on their role. Access to sensitive data is logged and auditable.</li>
        <li>Service providers who help us operate (messaging, payments, hosting) under contract. We never sell your data.</li>
      </ul>
      <h2>Retention</h2>
      <p>Each category of data has its own retention period (for example WhatsApp messages and location data are kept for a shorter time than payment records required by law). Data is securely deleted at the end of its period.</p>
      <h2>Your choices</h2>
      <p>You can ask to access, correct or delete your information by writing to {c?.contact.support_email}.</p>
    </Doc>
  );
}

export function Terms() {
  const c = useConfig();
  return (
    <Doc title="Terms of service" updated="September 2026">
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">Draft for legal review before production launch.</p>
      <h2>The service</h2>
      <p>We arrange a trained, verified companion to accompany a person to and during hospital, clinic, diagnostic, pharmacy, admission, discharge and related visits, and to coordinate and share updates with the family.</p>
      <h2>What the service is not</h2>
      <p>The service is not medical treatment, diagnosis, nursing, ambulance, emergency response or clinical care. Companions do not diagnose, prescribe, give treatment or replace doctors, nurses, ambulances or emergency services. In an emergency call {c?.emergency.primary_number || '112'} or {c?.emergency.ambulance_number || '108'}.</p>
      <h2>Booking and confirmation</h2>
      <p>A request is confirmed only when our team confirms it. Requests outside our service area or involving people who cannot walk may need review and may not be fulfilled.</p>
      <h2>Charges</h2>
      <p>Charges follow the pricing shown at booking: a base fee including a set duration, then an hourly extension, plus applicable taxes. Approved out-of-pocket expenses are billed at actuals with receipts. Hospital, doctor and medicine bills are paid directly to the provider. Payment is due on completion.</p>
      <h2>Cancellations and refunds</h2>
      <p>You may cancel before a companion is dispatched without charge. Refunds for service issues are handled case by case by our team.</p>
    </Doc>
  );
}

export function Safety() {
  const c = useConfig();
  return (
    <Doc title="Safety & medical boundary">
      <p>Families trust us with the people they love most. Here is exactly how we keep that trust.</p>
      <h2>Our companions do not</h2>
      <ul>{['Diagnose medical conditions', 'Prescribe medication', 'Provide clinical treatment', 'Replace doctors', 'Replace nurses', 'Replace ambulances', 'Replace emergency medical services'].map((x) => <li key={x}>{x}</li>)}</ul>
      <h2>Verification</h2>
      <p>Before taking any job, a companion must have completed each of these, individually recorded and checked by our team:</p>
      <ul>{(c?.verification_claims || []).map((x) => <li key={x}>{x}</li>)}<li>Interview and onboarding</li></ul>
      <h2>During every visit</h2>
      <ul>
        <li>The companion verifies the handover with a booking code shared only with your family.</li>
        <li>Every milestone is time-stamped and visible to our operations team, who can intervene at any time.</li>
        <li>Companions are trained to escalate to emergency services immediately if a person’s condition deteriorates.</li>
        <li>Incidents are recorded, reviewed and closed with a documented resolution.</li>
      </ul>
      <h2>Emergencies</h2>
      <p>If someone has life-threatening symptoms, do not wait for a companion. Call <a className="font-semibold underline" href={`tel:${c?.emergency.primary_number}`}>{c?.emergency.primary_number}</a> ({c?.emergency.primary_label}) or <a className="font-semibold underline" href={`tel:${c?.emergency.ambulance_number}`}>{c?.emergency.ambulance_number}</a> ({c?.emergency.ambulance_label}).</p>
    </Doc>
  );
}

export function DemoGuide() {
  const cards = [
    { icon: <FiGlobe />, title: 'Customer website', to: '/', desc: 'Landing page, emergency gate, WhatsApp & call CTAs, services, pricing, online booking, tracking.' },
    { icon: <FiMessageCircle />, title: 'WhatsApp booking', to: '/whatsapp', desc: 'Full conversational booking on the real webhook engine; status updates arrive in the chat.' },
    { icon: <FiMonitor />, title: 'Operations portal', to: '/ops', desc: 'Live queue, request detail, manual dispatch, escalations, payments, expenses, incidents, reports, admin.' },
    { icon: <FiSmartphone />, title: 'Companion PWA', to: '/companion', desc: 'OTP login, availability, job offers, step-by-step service flow, expenses, incidents, completion.' },
  ];
  const creds = [
    ['Super Admin', 'admin@medicalchampion.in', 'Admin@123'], ['Operations Manager', 'manager@medicalchampion.in', 'Manager@123'],
    ['Operations Agent', 'agent@medicalchampion.in', 'Agent@123'], ['Finance', 'finance@medicalchampion.in', 'Finance@123'], ['Support', 'support@medicalchampion.in', 'Support@123'],
  ];
  const flow = [
    'Open the WhatsApp booking page, start a chat and book for “Mother” (share a location, pick Hospital / OPD, ASAP, Medanta).',
    'Note the Request ID. Sign in to the Operations portal as the Agent — the request is on the live board with an alert.',
    'Open it, Confirm, then Assign companion → choose Amit Kumar (CMP-101).',
    'In another browser/incognito window, open the Companion app, log in with +91 70000 00101 (OTP is shown on screen in demo mode) and Accept the job.',
    'Step through: Start navigation → Arrived → Verify with the booking code (shown to ops on the request) → Start service → Reached hospital → updates → add an expense with a receipt photo → Returning → Complete.',
    'Watch the WhatsApp chat receive every update, then tap Pay Now → pay in the sandbox gateway → rate the service and answer the trust question.',
    'Back in Ops: the full audit timeline, payment, expense approval and the Reports dashboard (sign in as Manager) reflect the visit.',
  ];
  return (
    <PublicShell>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <p className="kicker">Demo guide</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-brand-950 sm:text-4xl">Explore the whole platform</h1>
        <p className="mt-3 max-w-2xl text-slate-600">Four connected systems on one backend and one auditable service-request lifecycle. Demo data covers the last 30 days so reports are populated.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Link key={c.title} to={c.to} className="card group flex gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl text-brand-700 group-hover:bg-brand-700 group-hover:text-white">{c.icon}</span>
              <span><span className="block font-bold">{c.title}</span><span className="text-sm text-slate-600">{c.desc}</span></span>
            </Link>
          ))}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-bold"><FiKey /> Operations logins</h2>
            <table className="table-base mt-3">
              <thead><tr><th>Role</th><th>Email</th><th>Password</th></tr></thead>
              <tbody>{creds.map(([r, e, p]) => <tr key={e}><td className="font-medium">{r}</td><td className="font-mono text-xs">{e}</td><td className="font-mono text-xs">{p}</td></tr>)}</tbody>
            </table>
            <h2 className="mt-6 flex items-center gap-2 font-bold"><FiSmartphone /> Companion logins</h2>
            <p className="mt-2 text-sm text-slate-600">Mobile <span className="font-mono">70000 00101</span> (Amit Kumar) … <span className="font-mono">70000 00107</span>. The OTP appears on screen while demo mode is on (Settings → Security).</p>
          </div>
          <div className="card p-5">
            <h2 className="font-bold">End-to-end acceptance flow (FRD §54)</h2>
            <ol className="mt-3 space-y-2.5 text-sm text-slate-700">
              {flow.map((s, i) => <li key={i} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{i + 1}</span>{s}</li>)}
            </ol>
          </div>
        </div>
        <div className="card mt-6 p-5 text-sm text-slate-600">
          <p className="font-bold text-ink">Going live checklist</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {['WhatsApp Cloud API: set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN', 'Razorpay: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET', 'Set real support & WhatsApp numbers in Settings → Contact', 'Validate emergency numbers, then turn off demo mode', 'Change all demo passwords', 'Legal review of privacy notice & terms'].map((x) => <li key={x} className="flex gap-2"><FiCheck className="mt-0.5 shrink-0 text-brand-600" />{x}</li>)}
          </ul>
        </div>
      </div>
    </PublicShell>
  );
}

export function NotFound() {
  return (
    <PublicShell footer={false}>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="font-display text-6xl font-semibold text-brand-800">404</p>
        <p className="mt-3 text-slate-600">We couldn’t find that page.</p>
        <Link to="/" className="btn btn-primary mt-6">Go home</Link>
      </div>
    </PublicShell>
  );
}
