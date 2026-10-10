import React, { useState } from 'react';
import { FiPlus, FiShield, FiStar, FiCheck, FiX, FiPhone, FiEdit2, FiLock } from 'react-icons/fi';
import { patch, post, useApi } from '../../lib/api';
import { Link, navigate } from '../../lib/router';
import { useConfig } from '../../lib/config';
import { Avatar, Badge, Button, ErrorState, Field, Input, KV, Modal, PageHeader, PageLoader, Section, Select, Stat, StatusBadge, Toggle, cx, fmtDate, fmtDateTime, pct, useAction, ago } from '../../components/ui';
import { useOps } from './OpsApp';
import { VERIFICATION_CONTROLS, SERVICE_TYPE_LABEL } from '../../../shared/constants';

const HOME_AREAS = ['DLF Phase 1', 'DLF Phase 2', 'DLF Phase 3', 'DLF Phase 4', 'DLF Phase 5', 'Sushant Lok 1', 'Sohna Road', 'Golf Course Road', 'Golf Course Extension Road', 'Sector 56', 'Sector 57', 'South City 1', 'South City 2', 'Nirvana Country', 'Palam Vihar', 'Sector 14', 'Sector 15', 'Cyber City', 'MG Road', 'Udyog Vihar', 'Sector 82', 'Manesar'];

export function Companions() {
  const { can } = useOps();
  const { data, error, loading, reload } = useApi<any[]>('/api/v1/companions', { poll: 15000 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  const rows = (data || []).filter((c) => (!q || `${c.name} ${c.code} ${c.phone}`.toLowerCase().includes(q.toLowerCase())) &&
    (!status || (status === 'inactive' ? !c.active : status === 'suspended' ? c.suspended : c.availability === status && c.active)));
  const count = (s: string) => (data || []).filter((c) => c.active && !c.suspended && c.availability === s).length;
  return (
    <div>
      <PageHeader title="Companions" sub="Profiles, verification, availability and performance" actions={can('companion.manage') && <Button className="btn-primary btn-sm" onClick={() => setOpen(true)}><FiPlus /> Add companion</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Available" value={count('AVAILABLE')} tone="good" />
        <Stat label="Busy on a job" value={count('BUSY')} />
        <Stat label="Offline" value={count('OFFLINE')} />
        <Stat label="Onboarding / inactive" value={(data || []).filter((c) => !c.active).length} tone="warn" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input placeholder="Search name, ID, phone" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All" options={[{ value: 'AVAILABLE', label: 'Available' }, { value: 'BUSY', label: 'Busy' }, { value: 'OFFLINE', label: 'Offline' }, { value: 'inactive', label: 'Not yet active' }, { value: 'suspended', label: 'Suspended' }]} className="max-w-[180px]" />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Companion</th><th>Status</th><th>Verification</th><th>Zone / base</th><th>Languages</th><th>Jobs</th><th>Rating</th><th>Acceptance</th><th>Cancel rate</th><th>Avg response</th><th>Current job</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const done = VERIFICATION_CONTROLS.filter((v) => c[v.key]).length;
              return (
                <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/ops/companions/${c.id}`)}>
                  <td><div className="flex items-center gap-2.5"><Avatar name={c.name} src={c.photo_url} size={36} /><div><p className="font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.code} · {c.phone}</p></div></div></td>
                  <td>{c.suspended ? <Badge tone="red">Suspended</Badge> : !c.active ? <Badge tone="amber">Inactive</Badge> : <Badge tone={c.availability === 'AVAILABLE' ? 'green' : c.availability === 'BUSY' ? 'blue' : 'gray'}>{c.availability}</Badge>}<p className="mt-0.5 text-[11px] text-slate-400">seen {ago(c.last_seen_at)}</p></td>
                  <td><div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-slate-100"><div className={cx('h-1.5 rounded-full', done === 6 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${(done / 6) * 100}%` }} /></div><span className="text-xs">{done}/6</span></div></td>
                  <td className="text-xs">{c.zone}<p className="text-slate-500">{c.home_area}</p></td>
                  <td className="text-xs">{c.languages.join(', ')}</td>
                  <td className="tabular-nums">{c.jobs_completed}</td>
                  <td className="whitespace-nowrap">{c.rating ? <><FiStar className="inline text-amber-500" /> {c.rating} <span className="text-xs text-slate-400">({c.rating_count})</span></> : '—'}</td>
                  <td>{pct(c.acceptance_rate)}</td>
                  <td>{pct(c.cancellation_rate)}</td>
                  <td className="text-xs">{c.avg_response_sec != null ? `${Math.round(c.avg_response_sec / 60 * 10) / 10} min` : '—'}</td>
                  <td>{c.current_job ? <Link to={`/ops/requests/${c.current_job.request_number}`} className="text-xs font-semibold text-brand-800" onClick={(e: any) => e.stopPropagation()}>{c.current_job.request_number}</Link> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && <CompanionForm onClose={() => setOpen(false)} onDone={(c) => { setOpen(false); navigate(`/ops/companions/${c.id}`); }} />}
    </div>
  );
}

function CompanionForm({ c, onClose, onDone }: { c?: any; onClose: () => void; onDone: (c: any) => void }) {
  const cfg = useConfig();
  const [f, setF] = useState<any>({ name: c?.name || '', phone: c?.phone || '', gender: c?.gender || '', home_area: c?.home_area || '', email: c?.email || '', languages: c?.languages || ['Hindi'], skills: (c?.skills || []).join(', '), notes: c?.notes || '' });
  const { busy, run } = useAction();
  const toggleLang = (l: string) => setF({ ...f, languages: f.languages.includes(l) ? f.languages.filter((x: string) => x !== l) : [...f.languages, l] });
  return (
    <Modal open onClose={onClose} title={c ? `Edit ${c.name}` : 'Add companion'} size="lg" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} onClick={async () => {
      const body = { ...f, skills: f.skills.split(',').map((s: string) => s.trim()).filter(Boolean) };
      const r = await run('s', () => (c ? patch(`/api/v1/companions/${c.id}`, body) : post('/api/v1/companions', body)), c ? 'Saved' : 'Companion created – complete verification to activate');
      if (r) onDone(r);
    }}>{c ? 'Save' : 'Create'}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mobile (login via OTP)"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email (optional — job updates are emailed too)" className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.com" /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} placeholder="—" options={['Female', 'Male', 'Other']} /></Field>
        <Field label="Base locality"><Select value={f.home_area} onChange={(e) => setF({ ...f, home_area: e.target.value })} placeholder="Select" options={HOME_AREAS} /></Field>
        <Field label="Languages" className="sm:col-span-2"><div className="flex flex-wrap gap-1.5">{(cfg?.lists.languages || []).map((l) => <button type="button" key={l} onClick={() => toggleLang(l)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold ring-1', f.languages.includes(l) ? 'bg-brand-700 text-white ring-brand-700' : 'ring-slate-300')}>{l}</button>)}</div></Field>
        <Field label="Skills (comma separated)" className="sm:col-span-2"><Input value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="Wheelchair assistance, Discharge coordination" /></Field>
        <Field label="Internal notes" className="sm:col-span-2"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function CompanionDetail({ id }: { id: string }) {
  const { can } = useOps();
  const { data: c, error, loading, reload, setData } = useApi<any>(`/api/v1/companions/${id}`);
  const { busy, run } = useAction();
  const [edit, setEdit] = useState(false);
  const [bank, setBank] = useState(false);
  if (loading && !c) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  const req: string[] = c.required_controls;
  const update = async (key: string, fn: () => Promise<any>, msg?: string) => { const r = await run(key, fn, msg); if (r) reload(); };
  return (
    <div>
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <Avatar name={c.name} src={c.photo_url} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{c.name}</h1><Badge tone="gray">{c.code}</Badge>
            {c.suspended ? <Badge tone="red">Suspended</Badge> : c.active ? <Badge tone="green"><FiShield /> Operationally active</Badge> : <Badge tone="amber">Not active</Badge>}
            <Badge tone={c.availability === 'AVAILABLE' ? 'green' : c.availability === 'BUSY' ? 'blue' : 'gray'}>{c.availability}</Badge></div>
          <p className="mt-1 text-sm text-slate-600"><a href={`tel:${c.phone}`}><FiPhone className="mr-1 inline" />{c.phone}</a> · {c.gender} · {c.zone} ({c.home_area}) · joined {fmtDate(c.joined_at)}</p>
          <p className="text-sm text-slate-600">🗣 {c.languages.join(', ')}{c.skills.length ? ` · ${c.skills.join(', ')}` : ''}</p>
        </div>
        {can('companion.manage') && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setEdit(true)}><FiEdit2 /> Edit</button>
            {c.active && c.availability !== 'BUSY' && <Button className="btn-secondary btn-sm" loading={busy === 'av'} onClick={() => update('av', () => patch(`/api/v1/companions/${c.id}/availability`, { availability: c.availability === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE' }), 'Availability updated')}>Set {c.availability === 'AVAILABLE' ? 'offline' : 'available'}</Button>}
            {!c.active ? <Button className="btn-primary btn-sm" disabled={!c.verification_complete} loading={busy === 'act'} onClick={() => update('act', () => patch(`/api/v1/companions/${c.id}`, { active: true }), 'Companion activated')} title={!c.verification_complete ? 'Complete all required verification controls first' : ''}>Activate</Button>
              : <Button className="btn-secondary btn-sm" loading={busy === 'act'} onClick={() => confirm('Deactivate this companion?') && update('act', () => patch(`/api/v1/companions/${c.id}`, { active: false }), 'Deactivated')}>Deactivate</Button>}
            <Button className={cx('btn-sm', c.suspended ? 'btn-secondary' : 'btn-danger')} loading={busy === 'sus'} onClick={() => confirm(c.suspended ? 'Lift suspension?' : 'Suspend this companion? They will be signed out of offers.') && update('sus', () => patch(`/api/v1/companions/${c.id}`, { suspended: !c.suspended }), 'Updated')}>{c.suspended ? 'Unsuspend' : 'Suspend'}</Button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Jobs completed" value={c.stats.jobs_completed ?? 0} />
        <Stat label="Rating" value={c.stats.rating ? `★ ${c.stats.rating}` : '—'} sub={`${c.stats.rating_count ?? 0} ratings`} />
        <Stat label="Acceptance rate" value={pct(c.stats.acceptance_rate)} />
        <Stat label="Cancellation rate" value={pct(c.stats.cancellation_rate)} />
        <Stat label="Avg response" value={c.stats.avg_response_sec != null ? `${Math.round(c.stats.avg_response_sec)}s` : '—'} />
        <Stat label="Incidents" value={c.stats.incidents ?? 0} tone={c.stats.incidents ? 'warn' : undefined} />
      </div>

      {can('companion.manage') && <PasswordCard c={c} onDone={reload} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Verification controls" action={c.verification_complete ? <Badge tone="green">Complete</Badge> : <Badge tone="amber">Incomplete</Badge>}>
          <p className="mb-3 text-xs text-slate-500">Each control is recorded individually. A companion can only be activated when all controls required by the business are complete. Changes are audited.</p>
          <ul className="divide-y divide-slate-100">
            {VERIFICATION_CONTROLS.map((v) => (
              <li key={v.key} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-sm">{c[v.key] ? <FiCheck className="text-emerald-600" /> : <FiX className="text-slate-400" />}{v.label}{req.includes(v.key) && <span className="text-[10px] font-semibold uppercase text-slate-400">required</span>}</span>
                <Toggle checked={!!c[v.key]} disabled={!can('companion.verify')} onChange={(val) => update(v.key, () => patch(`/api/v1/companions/${c.id}/verification`, { [v.key]: val }), 'Verification updated')} />
              </li>
            ))}
          </ul>
        </Section>
        <Section title={<span className="flex items-center gap-2"><FiLock /> Bank / payout details</span>} action={c.financial_visible && <button className="btn btn-ghost btn-sm" onClick={() => setBank(true)}><FiEdit2 /></button>}>
          <KV items={[['Account name', c.bank_account_name], ['Account number', <span key="a" className="font-mono">{c.bank_account_number}</span>], ['IFSC', c.bank_ifsc ?? '•••• (restricted)'], ['UPI', c.upi_id]]} />
          {!c.financial_visible && <p className="mt-3 text-xs text-slate-500">Masked. Full details are visible to Finance and Super Admin only; every view is audited.</p>}
          {c.notes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{c.notes}</p>}
        </Section>
        <Section title="Job history" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Request</th><th>Service</th><th>Offer</th><th>Offered</th><th>Responded</th><th>Request status</th><th>Rating</th></tr></thead>
              <tbody>{c.jobs.map((j: any, i: number) => (
                <tr key={i}><td><Link to={`/ops/requests/${j.id}`} className="font-semibold text-brand-800">{j.request_number}</Link></td><td>{SERVICE_TYPE_LABEL[j.service_type]}</td>
                  <td><Badge tone={j.assignment_status === 'COMPLETED' || j.assignment_status === 'ACCEPTED' ? 'green' : j.assignment_status === 'OFFERED' ? 'violet' : 'gray'}>{j.assignment_status}</Badge></td>
                  <td className="text-xs">{fmtDateTime(j.offered_at)}</td><td className="text-xs">{fmtDateTime(j.responded_at)}</td><td><StatusBadge status={j.current_status} /></td><td>{j.rating ? '★'.repeat(j.rating) : '—'}</td></tr>
              ))}</tbody>
            </table>
            {!c.jobs.length && <p className="p-4 text-center text-sm text-slate-500">No jobs yet.</p>}
          </div>
        </Section>
        {c.incidents.length > 0 && (
          <Section title="Incident history" className="lg:col-span-2">
            <ul className="space-y-2">{c.incidents.map((i: any) => <li key={i.id} className="text-sm"><Badge tone={i.status === 'CLOSED' ? 'green' : 'red'}>{i.incident_number}</Badge> {i.category} – {i.description} <span className="text-xs text-slate-400">{fmtDate(i.created_at)} {i.request_number}</span></li>)}</ul>
          </Section>
        )}
      </div>
      {edit && <CompanionForm c={c} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
      {bank && <BankModal c={c} onClose={() => setBank(false)} onDone={() => { setBank(false); reload(); }} />}
    </div>
  );
}

function PasswordCard({ c, onDone }: { c: any; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const { busy, run } = useAction();
  const save = async (body: any) => {
    const r = await run(body.generate ? 'gen' : 'set', () => post(`/api/v1/companions/${c.id}/password`, body), 'Password saved');
    if (r) { setPw(''); setShown(r.password || null); onDone(); }
  };
  return (
    <div className="card mt-4 p-5" data-testid="cmp-password-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><FiLock /> Champ app login</h2>
        {c.has_password ? <Badge tone="green">Password set</Badge> : <Badge tone="amber">No password yet</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-600">{c.name} signs in at <span className="font-mono">champoncall.com/companion</span> with <strong>{c.phone}</strong> and this password.{c.password_locked ? ' This login is locked for 15 minutes after wrong attempts – setting a new password unlocks it.' : ''}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="New password (min 8, letters + a number)" className="min-w-[14rem] flex-1"><Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" data-testid="cmp-new-password" /></Field>
        <Button className="btn-primary" loading={busy === 'set'} disabled={pw.length < 8} onClick={() => save({ password: pw })} data-testid="cmp-set-password">Set password</Button>
        <Button className="btn-secondary" loading={busy === 'gen'} onClick={() => save({ generate: true })} data-testid="cmp-generate-password">Generate one</Button>
      </div>
      {shown && (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          New password: <strong className="font-mono text-base" data-testid="cmp-generated-password">{shown}</strong> — share it with {c.name.split(' ')[0]} now. It won't be shown again.
          <button className="btn btn-ghost btn-sm ml-2" onClick={() => navigator.clipboard?.writeText(shown)}>Copy</button>
        </div>
      )}
    </div>
  );
}

function BankModal({ c, onClose, onDone }: { c: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ bank_account_name: c.bank_account_name || '', bank_account_number: c.bank_account_number || '', bank_ifsc: c.bank_ifsc || '', upi_id: c.upi_id || '' });
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Payout details" footer={<Button loading={!!busy} onClick={async () => { const r = await run('b', () => patch(`/api/v1/companions/${c.id}`, f), 'Saved'); if (r) onDone(); }}>Save</Button>}>
      <div className="grid gap-3">
        {Object.keys(f).map((k) => <Field key={k} label={k.replace(/_/g, ' ')}><Input value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
      </div>
    </Modal>
  );
}
