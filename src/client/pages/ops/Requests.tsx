import React, { useState } from 'react';
import { FiDownload, FiPlus, FiPhoneCall } from 'react-icons/fi';
import { post, useApi, uid } from '../../lib/api';
import { useRoute, navigate, Link } from '../../lib/router';
import { useConfig } from '../../lib/config';
import { Button, Field, Input, PageHeader, Select, StatusBadge, Textarea, fmtDateTime, useToast, PayBadge, Section, fromLocalInput, toLocalInput } from '../../components/ui';
import { RequestFlags, UrgencyBadge } from '../../components/ops';
import { Chips, PlaceInput } from '../public/Book';
import { useOps } from './OpsApp';
import { STATUS_LABEL, SERVICE_TYPE_LABEL, RELATIONSHIPS, fmtINR } from '../../../shared/constants';

export default function Requests() {
  const { search } = useRoute();
  const { can } = useOps();
  const [f, setF] = useState<Record<string, string>>({ q: search.get('q') || '', status: '', urgency: '', from: '', to: '', service_type: '', payment_status: '', flag: '', incident: '', companion: '', zone: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
  const { data, loading } = useApi<any[]>(`/api/v1/requests?${qs}`, { poll: 15000 });
  const { data: comps } = useApi<any[]>(can('companion.view') ? '/api/v1/companions' : null);
  const { data: areas } = useApi<any[]>('/api/v1/admin/service-areas');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <PageHeader title="Requests" sub={`${data?.length ?? '…'} results`} actions={<>
        {can('report.export') && <a className="btn btn-secondary btn-sm" href={`/api/v1/reports/export?type=requests&from=${f.from || '2000-01-01'}&to=${f.to || '2100-01-01'}`}><FiDownload /> Export CSV</a>}
        {can('request.create') && <Link to="/ops/requests/new" className="btn btn-primary btn-sm"><FiPlus /> New request</Link>}
      </>} />
      <div className="card grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Input placeholder="Search ID, name, phone" value={f.q} onChange={set('q')} className="lg:col-span-2" />
        <Input type="date" value={f.from} onChange={set('from')} title="From date" />
        <Input type="date" value={f.to} onChange={set('to')} title="To date" />
        <Select value={f.status} onChange={set('status')} placeholder="Any status" options={Object.entries(STATUS_LABEL).filter(([k]) => k !== 'DRAFT').map(([value, label]) => ({ value, label }))} />
        <Select value={f.urgency} onChange={set('urgency')} placeholder="Any urgency" options={[{ value: 'urgent', label: 'Urgent' }, { value: 'scheduled', label: 'Scheduled / later' }]} />
        <Select value={f.service_type} onChange={set('service_type')} placeholder="Any request type" options={Object.entries(SERVICE_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select value={f.zone} onChange={set('zone')} placeholder="Any zone" options={[...(areas || []).map((a) => a.name), { value: 'none', label: 'Outside / unzoned' }]} />
        <Select value={f.companion} onChange={set('companion')} placeholder="Any companion" options={(comps || []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} />
        <Select value={f.payment_status} onChange={set('payment_status')} placeholder="Any payment" options={['NOT_DUE', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']} />
        <Select value={f.flag} onChange={set('flag')} placeholder="Any flag" options={[{ value: 'emergency', label: 'Emergency review' }, { value: 'review', label: 'Human review' }, { value: 'sla', label: 'SLA risk' }, { value: 'out_of_area', label: 'Out of area' }]} />
        <Select value={f.incident} onChange={set('incident')} placeholder="Incident: any" options={[{ value: '1', label: 'Has open incident' }]} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Request</th><th>Status</th><th>Urgency</th><th>Type</th><th>Patient</th><th>Companion</th><th>Amount</th><th>Payment</th><th>Flags</th><th>Created</th></tr></thead>
          <tbody>
            {(data || []).map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/ops/requests/${r.id}`)}>
                <td className="font-semibold text-brand-800">{r.request_number}<div className="text-xs font-normal text-slate-500">{r.customer_name} · {r.channel}</div></td>
                <td><StatusBadge status={r.current_status} /></td>
                <td><UrgencyBadge urgency={r.urgency} at={r.requested_datetime} /></td>
                <td className="whitespace-nowrap">{SERVICE_TYPE_LABEL[r.service_type]}</td>
                <td className="whitespace-nowrap">{r.patient_name || r.relationship}{r.patient_age ? `, ${r.patient_age}` : ''}</td>
                <td className="whitespace-nowrap">{r.companion_name || '—'}</td>
                <td className="tabular-nums">{fmtINR(r.final_amount ?? r.quoted_amount)}</td>
                <td><PayBadge status={r.payment_status} /></td>
                <td><RequestFlags r={r} compact /></td>
                <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !data?.length && <p className="p-8 text-center text-sm text-slate-500">No requests found.</p>}
      </div>
    </div>
  );
}

/** Secondary channel (FRD): Phone → Operations. Agent creates a request on the customer's behalf. */
export function NewRequest() {
  const c = useConfig();
  const toast = useToast();
  const [f, setF] = useState<any>({ relationship: '', urgency: 'ASAP', mobility: '', service_type: 'hospital_opd' });
  const [pickup, setPickup] = useState<any>({ text: '' });
  const [dest, setDest] = useState<any>({ text: '' });
  const [busy, setBusy] = useState(false);
  const [key] = useState(uid());
  const set = (k: string) => (v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.customer_phone || !pickup.text || !f.mobility || !f.relationship) return toast('error', 'Customer phone, relationship, pickup and mobility are required');
    setBusy(true);
    try {
      const r = await post('/api/v1/requests', {
        ...f, channel: 'phone', pickup_address: pickup.text, pickup_lat: pickup.lat, pickup_lng: pickup.lng, destination_name: dest.text || null, destination_lat: dest.lat, destination_lng: dest.lng,
        requested_at: f.urgency === 'SCHEDULED' ? fromLocalInput(f.requested_at) : null, idempotency_key: key,
      });
      toast('success', `Created ${r.request_number}`);
      navigate(`/ops/requests/${r.id}`);
    } catch (er: any) { toast('error', er.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl">
      <PageHeader title={<span className="flex items-center gap-2"><FiPhoneCall className="text-brand-600" /> Phone booking</span>} sub="Create a request while you’re on the call. The customer receives WhatsApp confirmation automatically." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Caller (customer)">
          <div className="grid gap-3">
            <Field label="Mobile / WhatsApp *"><Input value={f.customer_phone || ''} onChange={(e) => set('customer_phone')(e.target.value)} inputMode="tel" required /></Field>
            <Field label="Name"><Input value={f.customer_name || ''} onChange={(e) => set('customer_name')(e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={f.customer_email || ''} onChange={(e) => set('customer_email')(e.target.value)} /></Field>
          </div>
        </Section>
        <Section title="Patient / loved one">
          <div className="grid gap-3">
            <Chips value={f.relationship} onChange={set('relationship')} options={RELATIONSHIPS.map((r) => [r, r] as [string, string])} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Name" className="col-span-2"><Input value={f.patient_name || ''} onChange={(e) => set('patient_name')(e.target.value)} /></Field>
              <Field label="Age"><Input type="number" value={f.patient_age || ''} onChange={(e) => set('patient_age')(e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gender"><Select value={f.patient_gender || ''} onChange={(e) => set('patient_gender')(e.target.value)} placeholder="—" options={['Female', 'Male', 'Other']} /></Field>
              <Field label="Language"><Select value={f.patient_language || ''} onChange={(e) => set('patient_language')(e.target.value)} placeholder="Any" options={c?.lists.languages || []} /></Field>
            </div>
            <Field label="Patient mobile"><Input value={f.patient_phone || ''} onChange={(e) => set('patient_phone')(e.target.value)} /></Field>
          </div>
        </Section>
        <Section title="Service" className="lg:col-span-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Pickup address *"><PlaceInput value={pickup.text} type="locality" onChange={(v) => setPickup({ text: v })} onPick={(p) => setPickup({ text: `${pickup.text ? pickup.text + ', ' : ''}${p.address}`, lat: p.lat, lng: p.lng })} placeholder="House, society, sector" /></Field>
            <Field label="Hospital / clinic"><PlaceInput value={dest.text} type="hospital" onChange={(v) => setDest({ text: v })} onPick={(p) => setDest({ text: p.name, lat: p.lat, lng: p.lng })} placeholder="Not decided" /></Field>
            <Field label="Type of help"><Select value={f.service_type} onChange={(e) => set('service_type')(e.target.value)} options={(c?.service_types || []).map((s) => ({ value: s.id, label: s.label }))} /></Field>
            <Field label="When"><Chips value={f.urgency} onChange={set('urgency')} options={[['ASAP', 'ASAP'], ['WITHIN_2_HOURS', '< 2 h'], ['LATER_TODAY', 'Later today'], ['SCHEDULED', 'Schedule']]} /></Field>
            {f.urgency === 'SCHEDULED' && <Field label="Date & time"><Input type="datetime-local" min={toLocalInput(new Date())} value={f.requested_at || ''} onChange={(e) => set('requested_at')(e.target.value)} required /></Field>}
            <Field label="Mobility *"><Chips value={f.mobility} onChange={set('mobility')} options={[['INDEPENDENT', 'Walks independently'], ['NEEDS_ASSISTANCE', 'Needs some assistance'], ['BEDRIDDEN', 'No / Bedridden']]} /></Field>
            <Field label="Special instructions" className="lg:col-span-2" hint="No medical history – only what the companion needs."><Textarea maxLength={300} value={f.special_instructions || ''} onChange={(e) => set('special_instructions')(e.target.value)} /></Field>
          </div>
        </Section>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Link to="/ops" className="btn btn-secondary">Cancel</Link><Button loading={busy}>Create request</Button></div>
    </form>
  );
}
