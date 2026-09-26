import React, { useState } from 'react';
import { FiPhone, FiEdit2, FiUser } from 'react-icons/fi';
import { patch, useApi } from '../../lib/api';
import { Link, navigate } from '../../lib/router';
import { Badge, Button, ErrorState, Field, Input, KV, Modal, PageHeader, PageLoader, Section, Select, StatusBadge, Textarea, fmtDate, fmtDateTime, useAction, Toggle } from '../../components/ui';
import { useOps } from './OpsApp';
import { SERVICE_TYPE_LABEL, MOBILITY_LABEL, fmtINR } from '../../../shared/constants';

export function Customers() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useApi<any[]>(`/api/v1/customers?q=${encodeURIComponent(q)}`);
  if (error) return <ErrorState error={error} />;
  return (
    <div>
      <PageHeader title="Customers" sub="Families who request help and the loved ones they book for" />
      <Input placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="card mt-4 overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Customer</th><th>Phone</th><th>City</th><th>Source</th><th>Patients</th><th>Requests</th><th>Completed</th><th>Last request</th></tr></thead>
          <tbody>
            {(data || []).map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/ops/customers/${c.id}`)}>
                <td className="font-semibold">{c.name || '—'}</td><td className="font-mono text-xs">{c.phone}</td><td>{c.city || '—'}</td>
                <td><Badge tone="gray">{c.source || '—'}</Badge></td><td>{c.patients}</td><td>{c.requests}</td><td>{c.completed}</td>
                <td className="text-xs">{fmtDateTime(c.last_request_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !data && <PageLoader />}
      </div>
    </div>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const { can } = useOps();
  const { data: c, loading, error, reload } = useApi<any>(`/api/v1/customers/${id}`);
  const [edit, setEdit] = useState(false);
  const [editPatient, setEditPatient] = useState<any>(null);
  if (loading && !c) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  return (
    <div>
      <PageHeader title={c.name || c.phone} sub={`Customer since ${fmtDate(c.created_at)} · ${c.city || 'city unknown'} · source ${c.source || '—'}`}
        actions={<><a className="btn btn-secondary btn-sm" href={`tel:${c.phone}`}><FiPhone /> {c.phone}</a>{can('customer.edit') && <button className="btn btn-secondary btn-sm" onClick={() => setEdit(true)}><FiEdit2 /> Edit</button>}</>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Profile">
          <KV cols={1} items={[['Email', c.email], ['Lifetime value', fmtINR(c.lifetime_value)], ['Requests', c.requests.length], ['WhatsApp', c.conversation ? `${c.conversation.source} · last message ${fmtDateTime(c.conversation.last_inbound_at)}` : 'No conversation'], ['Campaign', Object.keys(c.utm || {}).length ? JSON.stringify(c.utm) : '—'], ['Notes', c.notes]]} />
        </Section>
        <Section title={`Patients / loved ones · ${c.patients.length}`} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {c.patients.map((p: any) => (
              <div key={p.id} className="rounded-xl p-3 ring-1 ring-slate-200">
                <div className="flex items-start justify-between">
                  <p className="flex items-center gap-2 font-semibold"><FiUser className="text-brand-600" />{p.name || 'Unnamed'} <span className="text-sm font-normal text-slate-500">{p.relationship}{p.age ? `, ${p.age}` : ''}</span></p>
                  {can('customer.edit') && <button className="btn btn-ghost btn-sm" onClick={() => setEditPatient(p)}><FiEdit2 /></button>}
                </div>
                <p className="mt-1 text-xs text-slate-600">{p.address}</p>
                <p className="mt-1 text-xs text-slate-500">{MOBILITY_LABEL[p.mobility] || p.mobility} · {p.language || 'Any language'}{p.phone ? ` · ${p.phone}` : ''}</p>
                <p className="mt-1 text-[11px]">{p.consent_given ? <Badge tone="green">Consent recorded {fmtDate(p.consent_at)}</Badge> : <Badge tone="amber">No consent recorded</Badge>}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Request history" className="lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Request</th><th>Status</th><th>Service</th><th>Patient</th><th>Companion</th><th>Amount</th><th>Created</th></tr></thead>
              <tbody>{c.requests.map((r: any) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/ops/requests/${r.id}`)}><td className="font-semibold text-brand-800">{r.request_number}</td><td><StatusBadge status={r.current_status} /></td><td>{SERVICE_TYPE_LABEL[r.service_type]}</td><td>{r.patient_name || r.relationship}</td><td>{r.companion_name || '—'}</td><td>{fmtINR(r.final_amount ?? r.quoted_amount)}</td><td className="text-xs">{fmtDateTime(r.created_at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      </div>
      {edit && <CustomerEdit c={c} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
      {editPatient && <PatientEdit p={editPatient} onClose={() => setEditPatient(null)} onDone={() => { setEditPatient(null); reload(); }} />}
    </div>
  );
}

function CustomerEdit({ c, onClose, onDone }: any) {
  const [f, setF] = useState({ name: c.name || '', email: c.email || '', city: c.city || '', notes: c.notes || '' });
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Edit customer" footer={<Button loading={!!busy} onClick={async () => { if (await run('s', () => patch(`/api/v1/customers/${c.id}`, f), 'Saved')) onDone(); }}>Save</Button>}>
      <div className="grid gap-3">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function PatientEdit({ p, onClose, onDone }: any) {
  const [f, setF] = useState<any>({ name: p.name || '', age: p.age ?? '', gender: p.gender || '', relationship: p.relationship || '', phone: p.phone || '', address: p.address || '', mobility: p.mobility || 'INDEPENDENT', language: p.language || '', special_instructions: p.special_instructions || '', consent_given: p.consent_given });
  const { busy, run } = useAction();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Edit patient" size="lg" footer={<Button loading={!!busy} onClick={async () => { if (await run('s', () => patch(`/api/v1/patients/${p.id}`, f), 'Saved')) onDone(); }}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Age"><Input type="number" value={f.age} onChange={set('age')} /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={set('gender')} placeholder="—" options={['Female', 'Male', 'Other']} /></Field>
        <Field label="Relationship"><Input value={f.relationship} onChange={set('relationship')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Language"><Input value={f.language} onChange={set('language')} /></Field>
        <Field label="Mobility"><Select value={f.mobility} onChange={set('mobility')} options={Object.entries(MOBILITY_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label="Standing instructions" className="sm:col-span-2"><Textarea value={f.special_instructions} onChange={set('special_instructions')} /></Field>
        <Toggle checked={f.consent_given} onChange={(v) => setF({ ...f, consent_given: v })} label="Consent recorded" />
      </div>
    </Modal>
  );
}
