import React, { useEffect, useState } from 'react';
import { FiPlus, FiEdit2, FiCheck, FiX, FiAlertTriangle, FiSave, FiRotateCcw } from 'react-icons/fi';
import { patch, post, put, useApi } from '../../lib/api';
import { useConfigReload } from '../../lib/config';
import { Badge, Button, Field, Input, Modal, PageHeader, PageLoader, Section, Select, Tabs, Textarea, Toggle, cx, fmtDate, fmtDateTime, useAction, useToast } from '../../components/ui';
import { useOps } from './OpsApp';
import { VERIFICATION_CONTROLS, SERVICE_TYPE_LABEL, fmtINR } from '../../../shared/constants';

export function Settings() {
  const { can } = useOps();
  const [tab, setTab] = useState('pricing');
  const { data, loading, reload } = useApi<any>('/api/v1/admin/settings');
  if (loading && !data) return <PageLoader />;
  const s = data.settings;
  const tabs = [
    { id: 'pricing', label: 'Pricing' }, { id: 'areas', label: 'Service areas' }, { id: 'sla', label: 'SLA' }, { id: 'contact', label: 'Contact & emergency' },
    { id: 'templates', label: 'WhatsApp templates' }, { id: 'lists', label: 'Reasons & categories' }, { id: 'verification', label: 'Verification' },
    { id: 'retention', label: 'Data retention' }, { id: 'payout', label: 'Payout' }, { id: 'security', label: 'Security & integrations' },
  ];
  return (
    <div>
      <PageHeader title="Settings" sub="Configuration-driven operations — no engineering needed for normal changes. Every change is audited." />
      {!can('settings.edit') && <p className="mb-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Read-only: your role cannot change settings.</p>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'pricing' && <Pricing />}
        {tab === 'areas' && <Areas />}
        {tab === 'sla' && <KeyForm k="sla" value={s.sla} onSaved={reload} fields={[
          ['urgent_dispatch_minutes', 'Urgent target dispatch time (min)'], ['acceptance_minutes', 'Target companion acceptance time (min)'], ['arrival_minutes', 'Target arrival time for urgent requests (min)'],
          ['offer_expiry_minutes', 'Offer expires if not answered (min)'], ['scheduled_dispatch_lead_minutes', 'Scheduled: flag if unassigned this many min before start'],
        ]} numeric />}
        {tab === 'contact' && <div className="grid gap-4 lg:grid-cols-2">
          <KeyForm k="contact" title="Contact" value={s.contact} onSaved={reload} fields={[['support_phone', 'Support phone (E.164, used for tel: links)'], ['support_phone_display', 'Support phone (display)'], ['whatsapp_number', 'Official WhatsApp Business number (E.164). Empty = in-app booking chat'], ['whatsapp_prefill', 'WhatsApp pre-filled message'], ['support_email', 'Support email'], ['support_hours', 'Support hours']]} />
          <KeyForm k="emergency" title="Emergency contacts" value={s.emergency} onSaved={reload} fields={[['primary_number', 'Primary emergency number'], ['primary_label', 'Label'], ['ambulance_number', 'Ambulance number'], ['ambulance_label', 'Label']]}
            extra={<p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><FiAlertTriangle className="mt-0.5 shrink-0" />Emergency contact details must be legally and operationally validated before production.</p>} bools={[['validated_for_production', 'Validated for production']]} />
          <KeyForm k="brand" title="Brand" value={s.brand} onSaved={reload} fields={[['name', 'Name'], ['tagline', 'Tagline'], ['city', 'Launch city']]} />
          <KeyForm k="email" title="Email notifications" value={s.email} onSaved={reload}
            fields={[['ops_emails', 'Operations email(s) — new requests & alerts go here (comma separated)']]}
            bools={[['customer_updates', 'Email customers every status update (when they gave an email)'], ['ops_updates', 'Email operations alerts (new request, accepted, arrived, completed, escalations…)'], ['companion_updates', 'Email companions their job offers and updates']]}
            extra={<EmailTest connected={!!data.integrations?.email} defaultTo={s.email?.ops_emails || ''} />} />
        </div>}
        {tab === 'templates' && <Templates />}
        {tab === 'lists' && <ListsForm value={s.lists} onSaved={reload} />}
        {tab === 'verification' && <VerificationForm value={s.verification} onSaved={reload} />}
        {tab === 'retention' && <KeyForm k="retention" value={s.retention} onSaved={reload} numeric fields={[
          ['customer_contact_days', 'Customer account / contact information'], ['service_history_days', 'Service history'], ['whatsapp_messages_days', 'WhatsApp messages'], ['location_days', 'Location information'],
          ['identity_documents_days', 'Identity verification documents'], ['expense_receipts_days', 'Expense receipts'], ['payment_references_days', 'Payment references'], ['incident_records_days', 'Incident records'], ['audit_logs_days', 'Audit logs'],
        ]} note="Retention periods in days, per data category. Records past their period are securely deleted by the retention job." />}
        {tab === 'payout' && <KeyForm k="payout" value={s.payout} onSaved={reload} numeric fields={[['companion_base', 'Companion payout per job (₹)'], ['companion_per_extra_hour', 'Payout per extra hour (₹)']]} note="Used for contribution-margin reporting." />}
        {tab === 'security' && <SecurityTab s={s} integrations={data.integrations} onSaved={reload} />}
      </div>
    </div>
  );
}

function EmailTest({ connected, defaultTo }: { connected: boolean; defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const { busy, run } = useAction();
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <p className={connected ? 'text-emerald-700' : 'text-amber-800'}>{connected ? '✓ Email sending is connected.' : 'Email sending is not connected yet — add RESEND_API_KEY and EMAIL_FROM in Vercel, then redeploy.'}</p>
      <div className="mt-2 flex gap-2">
        <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@champoncall.com" />
        <Button className="btn-secondary" loading={!!busy} onClick={() => run('t', () => post('/api/v1/admin/email/test', { to }), 'Test email sent')}>Send test</Button>
      </div>
    </div>
  );
}

function KeyForm({ k, title, value, fields, onSaved, numeric, bools, extra, note }: { k: string; title?: string; value: any; fields: [string, string][]; onSaved: () => void; numeric?: boolean; bools?: [string, string][]; extra?: React.ReactNode; note?: string }) {
  const { can } = useOps();
  const reloadCfg = useConfigReload();
  const [f, setF] = useState<any>(value);
  useEffect(() => setF(value), [value]);
  const { busy, run } = useAction();
  const body = (
    <div className="space-y-3">
      {note && <p className="text-sm text-slate-500">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label]) => <Field key={key} label={label}><Input type={numeric ? 'number' : 'text'} value={f[key] ?? ''} disabled={!can('settings.edit')} onChange={(e) => setF({ ...f, [key]: numeric ? Number(e.target.value) : e.target.value })} /></Field>)}
      </div>
      {bools?.map(([key, label]) => <Toggle key={key} checked={!!f[key]} disabled={!can('settings.edit')} onChange={(v) => setF({ ...f, [key]: v })} label={label} />)}
      {extra}
      {can('settings.edit') && <Button loading={!!busy} onClick={async () => { if (await run('s', () => put(`/api/v1/admin/settings/${k}`, f), 'Settings saved')) { onSaved(); reloadCfg(); } }}><FiSave /> Save</Button>}
    </div>
  );
  return title ? <Section title={title}>{body}</Section> : <div className="card p-5">{body}</div>;
}

function ListsForm({ value, onSaved }: { value: any; onSaved: () => void }) {
  const { can } = useOps();
  const keys: [string, string][] = [['cancellation_reasons', 'Cancellation reasons'], ['incident_categories', 'Incident categories'], ['expense_categories', 'Expense categories'], ['completion_types', 'Completion outcomes'], ['languages', 'Languages']];
  const [f, setF] = useState<any>(Object.fromEntries(keys.map(([k]) => [k, (value[k] || []).join('\n')])));
  const { busy, run } = useAction();
  return (
    <div className="card p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {keys.map(([k, l]) => <Field key={k} label={`${l} (one per line)`}><Textarea rows={8} value={f[k]} disabled={!can('settings.edit')} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
      </div>
      {can('settings.edit') && <Button className="mt-4" loading={!!busy} onClick={async () => {
        const body = Object.fromEntries(keys.map(([k]) => [k, f[k].split('\n').map((x: string) => x.trim()).filter(Boolean)]));
        if (await run('s', () => put('/api/v1/admin/settings/lists', body), 'Lists saved')) onSaved();
      }}><FiSave /> Save</Button>}
    </div>
  );
}

function VerificationForm({ value, onSaved }: { value: any; onSaved: () => void }) {
  const { can } = useOps();
  const [req, setReq] = useState<string[]>(value.required);
  const [claims, setClaims] = useState((value.public_claims || []).join('\n'));
  const { busy, run } = useAction();
  return (
    <div className="card space-y-4 p-5">
      <p className="text-sm text-slate-600">Controls that must all be complete before a companion can be operationally active.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {VERIFICATION_CONTROLS.map((v) => <Toggle key={v.key} checked={req.includes(v.key)} disabled={!can('settings.edit')} onChange={(on) => setReq(on ? [...req, v.key] : req.filter((x) => x !== v.key))} label={v.label} />)}
      </div>
      <Field label="Verification claims shown on the public website (one per line)" hint="Only advertise procedures that actually exist operationally."><Textarea rows={4} value={claims} disabled={!can('settings.edit')} onChange={(e) => setClaims(e.target.value)} /></Field>
      {can('settings.edit') && <Button loading={!!busy} onClick={async () => { if (await run('s', () => put('/api/v1/admin/settings/verification', { required: req, public_claims: claims.split('\n').map((x: string) => x.trim()).filter(Boolean) }), 'Saved')) onSaved(); }}><FiSave /> Save</Button>}
    </div>
  );
}

function SecurityTab({ s, integrations, onSaved }: { s: any; integrations: any; onSaved: () => void }) {
  const { can } = useOps();
  const { busy, run } = useAction();
  const toast = useToast();
  const I = ({ ok, label, env }: { ok: boolean; label: string; env: string }) => (
    <div className="flex items-start justify-between gap-3 rounded-xl p-3 ring-1 ring-slate-200">
      <div><p className="font-semibold">{label}</p><p className="font-mono text-[11px] text-slate-500">{env}</p></div>
      <Badge tone={ok ? 'green' : 'amber'}>{ok ? 'Live' : 'Sandbox'}</Badge>
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Integrations">
        <div className="grid gap-2">
          <I ok={integrations.whatsapp} label="WhatsApp Business Platform" env="WHATSAPP_TOKEN · WHATSAPP_PHONE_NUMBER_ID · WHATSAPP_WABA_ID · WHATSAPP_APP_SECRET · WHATSAPP_VERIFY_TOKEN" />
          <I ok={integrations.razorpay} label="Razorpay payments" env="RAZORPAY_KEY_ID · RAZORPAY_KEY_SECRET · RAZORPAY_WEBHOOK_SECRET" />
          <I ok={integrations.email} label="Email (Resend)" env="RESEND_API_KEY · EMAIL_FROM" />
          <I ok={integrations.whatsapp} label="Companion login codes (WhatsApp)" env="Approved template mc_login_code" />
          <I ok label="Maps & geocoding" env="Built-in Gurugram gazetteer + OpenStreetMap" />
        </div>
        <p className="mt-3 text-xs text-slate-500">Webhook URLs: <span className="font-mono">/api/v1/whatsapp/webhook</span> and <span className="font-mono">/api/v1/payments/webhook</span>. Secrets live only in environment variables, never in source control.</p>
      </Section>
      <KeyForm k="security" title="Security" value={s.security} onSaved={onSaved} numeric fields={[['otp_ttl_seconds', 'OTP expiry (seconds)']]} bools={[['demo_mode', 'Demo mode (shows OTP on screen, allows demo reset) — turn OFF in production']]} />
      <MetaTemplates />
      {can('data.reset') && s.security.demo_mode && <GoLiveReset />}
      {can('data.reset') && s.security.demo_mode && (
        <Section title="Demo data">
          <p className="text-sm text-slate-600">Wipe and re-seed the database with fresh demo data (30 days of history, live board, companions, users).</p>
          <Button className="btn-danger mt-3" loading={!!busy} onClick={async () => {
            if (!confirm('This deletes ALL data and re-creates demo data. Continue?')) return;
            if (await run('r', () => post('/api/v1/admin/reset-demo'), 'Demo data reset')) { toast('info', 'Please sign in again'); setTimeout(() => (location.href = '/ops/login'), 800); }
          }}><FiRotateCcw /> Reset demo data</Button>
        </Section>
      )}
    </div>
  );
}

const META_STATUS_TONE: Record<string, string> = { APPROVED: 'green', PENDING: 'amber', IN_APPEAL: 'amber', NOT_SUBMITTED: 'gray', REJECTED: 'red', PAUSED: 'red', DISABLED: 'red' };
const META_TEMPLATE_LABEL: Record<string, string> = {
  mc_service_update: 'Service updates (used when the customer has not messaged in 24h)',
  mc_login_code: 'Companion login code (authentication)',
};

function MetaTemplates() {
  const { can } = useOps();
  const { data, loading, reload } = useApi<any>('/api/v1/admin/whatsapp/meta-templates');
  const { busy, run } = useAction();
  return (
    <Section title="WhatsApp templates in Meta">
      <p className="text-sm text-slate-600">Meta must approve these before we can message customers after 24 hours of silence, or send companions their login code on WhatsApp.</p>
      {loading && !data ? <p className="mt-3 text-sm text-slate-500">Checking with Meta…</p> : !data?.configured ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">WhatsApp is in sandbox mode or <span className="font-mono">WHATSAPP_WABA_ID</span> is not set.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {data.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{data.error}</p>}
          {(data.templates || []).map((t: any) => (
            <div key={t.name} className="flex items-start justify-between gap-3 rounded-xl p-3 ring-1 ring-slate-200">
              <div><p className="font-semibold">{META_TEMPLATE_LABEL[t.name] || t.name}</p><p className="font-mono text-[11px] text-slate-500">{t.name} · {t.category}</p>
                {t.rejected_reason && <p className="mt-1 text-xs text-red-700">Rejected: {t.rejected_reason}</p>}</div>
              <Badge tone={META_STATUS_TONE[t.status] || 'gray'}>{String(t.status).replace('_', ' ')}</Badge>
            </div>
          ))}
          {can('settings.edit') && (data.templates || []).some((t: any) => ['NOT_SUBMITTED', 'REJECTED'].includes(t.status)) && (
            <Button loading={!!busy} onClick={async () => { if (await run('t', () => post('/api/v1/admin/whatsapp/meta-templates/sync'), 'Submitted to Meta for approval')) reload(); }}>Submit to Meta for approval</Button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>Refresh status</button>
        </div>
      )}
    </Section>
  );
}

function GoLiveReset() {
  const [f, setF] = useState({ name: '', email: '', password: '', password2: '', confirm: '' });
  const { busy, run } = useAction();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const pwOk = f.password.length >= 10 && /[A-Z]/.test(f.password) && /[a-z]/.test(f.password) && /\d/.test(f.password);
  const ready = f.name.trim() && /^\S+@\S+\.\S+$/.test(f.email.trim()) && pwOk && f.password === f.password2 && f.confirm.trim().toUpperCase() === 'GO LIVE';
  return (
    <Section title="Go live">
      <p className="text-sm text-slate-600">Run this once, when you are ready for real customers. It will:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>permanently delete all demo &amp; test requests, customers, companions, payments, incidents, WhatsApp chats and audit history;</li>
        <li>create <b>your own Super Admin login</b> below and disable every demo login (their passwords are public);</li>
        <li>turn demo mode off – companions then receive their login code on WhatsApp instead of seeing it on screen.</li>
      </ul>
      <p className="mt-2 text-sm text-slate-600">Settings, pricing, service areas and message templates are kept. Everyone is signed out; sign in again with the new login. This cannot be undone.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Your name"><Input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="Your email (new admin login)"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="New password" hint="10+ characters, upper & lower case and a number"><Input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Repeat password"><Input type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" /></Field>
      </div>
      {f.password2 && f.password !== f.password2 && <p className="mt-2 text-sm text-red-700">Passwords don't match.</p>}
      <Field label="Type GO LIVE to confirm" className="mt-3"><Input value={f.confirm} onChange={set('confirm')} placeholder="GO LIVE" /></Field>
      <Button className="btn-danger mt-3" disabled={!ready} loading={!!busy} onClick={async () => {
        const body = { confirm: f.confirm, owner: { name: f.name.trim(), email: f.email.trim(), password: f.password } };
        if (await run('g', () => post('/api/v1/admin/go-live-reset', body), 'Live mode on – sign in with your new login')) setTimeout(() => location.assign('/ops'), 1200);
      }}><FiAlertTriangle /> Clear demo data &amp; go live</Button>
    </Section>
  );
}

function Pricing() {
  const { can } = useOps();
  const { data, reload } = useApi<any[]>('/api/v1/admin/pricing-rules');
  const { data: areas } = useApi<any[]>('/api/v1/admin/service-areas');
  const [edit, setEdit] = useState<any>(null);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-600">The most specific active rule wins (service type → area → latest effective date). Prices are never hard-coded in the apps.</p>
        {can('pricing.edit') && <Button className="btn-primary btn-sm" onClick={() => setEdit({ service_type: '*', included_minutes: 240, extension_block_minutes: 60, tax_percent: 18, urgent_surcharge: 0, active: true, effective_from: new Date().toISOString().slice(0, 10) })}><FiPlus /> New rule</Button>}
      </div>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Name</th><th>Service type</th><th>Base fee</th><th>Included</th><th>Extension</th><th>Tax</th><th>Urgent surcharge</th><th>Area</th><th>Effective</th><th>Status</th><th /></tr></thead>
          <tbody>{(data || []).map((r) => (
            <tr key={r.id}>
              <td className="font-semibold">{r.name}</td><td>{r.service_type === '*' ? 'All services' : SERVICE_TYPE_LABEL[r.service_type]}</td><td>{fmtINR(r.base_fee)}</td><td>{r.included_minutes / 60} h</td>
              <td>{fmtINR(r.extension_rate_per_hour)}/h</td><td>{r.tax_percent}%</td><td>{fmtINR(r.urgent_surcharge)}</td><td>{r.area_name || 'All'}</td><td>{fmtDate(r.effective_from)}</td>
              <td><Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge></td>
              <td>{can('pricing.edit') && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}><FiEdit2 /></button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {edit && <PricingModal r={edit} areas={areas || []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function PricingModal({ r, areas, onClose, onDone }: { r: any; areas: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ ...r, effective_from: String(r.effective_from).slice(0, 10), service_area_id: r.service_area_id || '' });
  const { busy, run } = useAction();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} size="lg" title={r.id ? `Edit ${r.name}` : 'New pricing rule'} footer={<Button loading={!!busy} onClick={async () => {
      const body = { name: f.name, service_type: f.service_type, base_fee: f.base_fee, included_minutes: f.included_minutes, extension_rate_per_hour: f.extension_rate_per_hour, extension_block_minutes: f.extension_block_minutes, tax_percent: f.tax_percent, urgent_surcharge: f.urgent_surcharge, service_area_id: f.service_area_id || null, effective_from: f.effective_from, active: f.active };
      if (await run('s', () => (r.id ? patch(`/api/v1/admin/pricing-rules/${r.id}`, body) : post('/api/v1/admin/pricing-rules', body)), 'Pricing saved')) onDone();
    }}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name || ''} onChange={set('name')} /></Field>
        <Field label="Service type"><Select value={f.service_type} onChange={set('service_type')} options={[{ value: '*', label: 'All services' }, ...Object.entries(SERVICE_TYPE_LABEL).map(([value, label]) => ({ value, label }))]} /></Field>
        <Field label="Base fee (₹)"><Input type="number" value={f.base_fee ?? ''} onChange={set('base_fee')} /></Field>
        <Field label="Included duration (minutes)"><Input type="number" value={f.included_minutes} onChange={set('included_minutes')} /></Field>
        <Field label="Extension rate (₹ / hour)"><Input type="number" value={f.extension_rate_per_hour ?? ''} onChange={set('extension_rate_per_hour')} /></Field>
        <Field label="Extension block (minutes)"><Input type="number" value={f.extension_block_minutes} onChange={set('extension_block_minutes')} /></Field>
        <Field label="Tax %"><Input type="number" value={f.tax_percent} onChange={set('tax_percent')} /></Field>
        <Field label="Urgent surcharge (₹)"><Input type="number" value={f.urgent_surcharge} onChange={set('urgent_surcharge')} /></Field>
        <Field label="Service area"><Select value={f.service_area_id} onChange={set('service_area_id')} placeholder="All areas" options={areas.map((a) => ({ value: a.id, label: a.name }))} /></Field>
        <Field label="Effective from"><Input type="date" value={f.effective_from} onChange={set('effective_from')} /></Field>
        <Toggle checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
      </div>
    </Modal>
  );
}

function Areas() {
  const { can } = useOps();
  const { data, reload } = useApi<any[]>('/api/v1/admin/service-areas');
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-600">Requests outside every active area are flagged for human review — service is never promised automatically.</p>
        {can('service_area.edit') && <Button className="btn-primary btn-sm" onClick={() => setEdit({ name: '', city: '', center_lat: '', center_lng: '', radius_km: 15, keywords: '', active: true })}><FiPlus /> New area</Button>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(data || []).map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between"><p className="font-bold">{a.name}</p><Badge tone={a.active ? 'green' : 'gray'}>{a.active ? 'Active' : 'Inactive'}</Badge></div>
            <p className="mt-1 text-sm text-slate-600">Centre {a.center_lat}, {a.center_lng} · radius {a.radius_km} km</p>
            <p className="text-xs text-slate-500">Keywords: {a.keywords.join(', ')}</p>
            <iframe title={a.name} className="mt-3 h-44 w-full rounded-xl" loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${a.center_lng - a.radius_km / 100},${a.center_lat - a.radius_km / 111},${a.center_lng + a.radius_km / 100},${a.center_lat + a.radius_km / 111}&layer=mapnik&marker=${a.center_lat},${a.center_lng}`} />
            {can('service_area.edit') && <div className="mt-2 flex gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...a, keywords: a.keywords.join(', ') })}><FiEdit2 /> Edit</button>
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={async () => { if (await run('t', () => patch(`/api/v1/admin/service-areas/${a.id}`, { active: !a.active }), 'Updated')) reload(); }}>{a.active ? 'Deactivate' : 'Activate'}</button></div>}
          </div>
        ))}
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit service area' : 'New service area'} footer={<Button loading={!!busy} onClick={async () => {
          const body = { ...edit };
          if (await run('s', () => (edit.id ? patch(`/api/v1/admin/service-areas/${edit.id}`, body) : post('/api/v1/admin/service-areas', body)), 'Saved')) { setEdit(null); reload(); }
        }}>Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['name', 'Name'], ['city', 'City'], ['center_lat', 'Centre latitude'], ['center_lng', 'Centre longitude'], ['radius_km', 'Radius (km)'], ['keywords', 'Address keywords (comma separated)']].map(([k, l]) => (
              <Field key={k} label={l} className={k === 'keywords' ? 'sm:col-span-2' : ''}><Input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Templates() {
  const { can } = useOps();
  const { data, reload } = useApi<any[]>('/api/v1/admin/templates');
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">Approved WhatsApp message templates. Variables in <span className="font-mono">{'{{double_braces}}'}</span> are filled from the request. Keep sensitive medical details out of messages.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data || []).map((t) => (
          <div key={t.key} className="card flex flex-col p-4">
            <div className="flex items-center justify-between"><p className="font-semibold">{t.name}</p><Badge tone={t.active ? 'green' : 'gray'}>{t.active ? 'Active' : 'Off'}</Badge></div>
            <p className="font-mono text-[11px] text-slate-400">{t.key}</p>
            <p className="mt-2 flex-1 whitespace-pre-line rounded-xl bg-[#d9fdd3]/60 p-3 text-xs text-slate-700">{t.body}</p>
            {t.buttons?.length > 0 && <p className="mt-2 text-[11px] text-sky-700">{t.buttons.map((b: any) => `[${b.title}]`).join(' ')}</p>}
            {can('settings.edit') && <button className="btn btn-ghost btn-sm mt-2 self-start" onClick={() => setEdit({ ...t })}><FiEdit2 /> Edit</button>}
          </div>
        ))}
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} size="lg" title={`Template: ${edit.name}`} footer={<Button loading={!!busy} onClick={async () => { if (await run('s', () => put(`/api/v1/admin/templates/${edit.key}`, { body: edit.body, active: edit.active }), 'Template saved')) { setEdit(null); reload(); } }}>Save</Button>}>
          <Textarea rows={10} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} className="font-mono text-xs" />
          <div className="mt-3"><Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" /></div>
        </Modal>
      )}
    </div>
  );
}

export function Users() {
  const { user } = useOps();
  const { data: users, reload } = useApi<any[]>('/api/v1/admin/users');
  const { data: roles, reload: reloadRoles } = useApi<any>('/api/v1/admin/roles');
  const [edit, setEdit] = useState<any>(null);
  const [tab, setTab] = useState('users');
  const { busy, run } = useAction();
  return (
    <div>
      <PageHeader title="Users & roles" sub="Action-based permissions (e.g. request.edit, companion.assign, payment.refund) — not just page visibility" actions={tab === 'users' && <Button className="btn-primary btn-sm" onClick={() => setEdit({ role_id: 'ops_agent', active: true })}><FiPlus /> Invite user</Button>} />
      <Tabs tabs={[{ id: 'users', label: 'Users' }, { id: 'roles', label: 'Role permissions' }]} value={tab} onChange={setTab} />
      {tab === 'users' ? (
        <div className="card mt-4 overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th /></tr></thead>
            <tbody>{(users || []).map((u) => (
              <tr key={u.id}><td className="font-semibold">{u.name}{u.id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</td><td>{u.email}</td><td><Badge tone="brand">{u.role_name}</Badge></td>
                <td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>}{u.locked_until && new Date(u.locked_until) > new Date() && <Badge tone="red">Locked</Badge>}</td>
                <td className="text-xs">{fmtDateTime(u.last_login_at)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => setEdit(u)}><FiEdit2 /></button></td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Permission</th>{roles?.roles.map((r: any) => <th key={r.id} className="text-center">{r.name}</th>)}</tr></thead>
            <tbody>{roles?.permissions.map((p: string) => (
              <tr key={p}><td className="font-mono text-xs">{p}</td>
                {roles.roles.map((r: any) => {
                  const has = r.permissions.includes(p);
                  return <td key={r.id} className="text-center">
                    <button disabled={r.id === 'super_admin' || !!busy} className={cx('inline-flex h-6 w-6 items-center justify-center rounded-md', has ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300', r.id !== 'super_admin' && 'hover:ring-2 hover:ring-brand-300')}
                      onClick={async () => { if (await run(r.id + p, () => patch(`/api/v1/admin/roles/${r.id}`, { permissions: has ? r.permissions.filter((x: string) => x !== p) : [...r.permissions, p] }), 'Permissions updated')) reloadRoles(); }}>
                      {has ? <FiCheck /> : <FiX />}
                    </button>
                  </td>;
                })}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <UserModal u={edit} roles={roles?.roles || []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function UserModal({ u, roles, onClose, onDone }: { u: any; roles: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ name: u.name || '', email: u.email || '', phone: '', role_id: u.role_id, active: u.active !== false, password: '' });
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={u.id ? `Edit ${u.name}` : 'Invite user'} footer={<Button loading={!!busy} onClick={async () => {
      const body: any = u.id ? { name: f.name, role_id: f.role_id, active: f.active, ...(f.password ? { password: f.password } : {}) } : f;
      if (await run('s', () => (u.id ? patch(`/api/v1/admin/users/${u.id}`, body) : post('/api/v1/admin/users', body)), 'User saved')) onDone();
    }}>Save</Button>}>
      <div className="grid gap-3">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        {!u.id && <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>}
        <Field label="Role"><Select value={f.role_id} onChange={(e) => setF({ ...f, role_id: e.target.value })} options={roles.map((r) => ({ value: r.id, label: `${r.name} — ${r.description}` }))} /></Field>
        <Field label={u.id ? 'Reset password (leave empty to keep)' : 'Temporary password'} hint="8+ characters, one uppercase letter and a number"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {u.id && <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active (disabling signs the user out)" />}
      </div>
    </Modal>
  );
}

export function Audit() {
  const [q, setQ] = useState('');
  const [et, setEt] = useState('');
  const { data, loading } = useApi<any[]>(`/api/v1/audit?q=${encodeURIComponent(q)}&entity_type=${et}`);
  const [sel, setSel] = useState<any>(null);
  return (
    <div>
      <PageHeader title="Audit log" sub="Append-only record of user, payment, assignment, status, incident and administrative actions" />
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search action, user, summary" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={et} onChange={(e) => setEt(e.target.value)} placeholder="All entities" className="max-w-[200px]" options={['service_request', 'assignment', 'payment', 'expense', 'incident', 'escalation', 'companion', 'customer', 'patient', 'user', 'role', 'settings', 'pricing_rule', 'service_area', 'message_template', 'report']} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        {loading && !data ? <PageLoader /> : (
          <table className="table-base">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th><th>IP</th><th /></tr></thead>
            <tbody>{(data || []).map((a) => (
              <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</td><td className="text-xs">{a.actor_name}<br /><span className="text-slate-400">{a.actor_type}</span></td>
                <td className="font-mono text-xs">{a.action}</td><td className="text-xs">{a.entity_type}</td><td className="text-sm">{a.summary}</td><td className="text-xs text-slate-400">{a.ip}</td>
                <td>{(a.before || a.after) && <button className="btn btn-ghost btn-sm" onClick={() => setSel(a)}>Diff</button>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {sel && (
        <Modal open onClose={() => setSel(null)} size="xl" title={sel.summary}>
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="label">Before</p><pre className="max-h-96 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px]">{JSON.stringify(sel.before, null, 2)}</pre></div>
            <div><p className="label">After</p><pre className="max-h-96 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px]">{JSON.stringify(sel.after, null, 2)}</pre></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
