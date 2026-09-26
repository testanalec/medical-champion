import React, { useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { patch, useApi } from '../../lib/api';
import { Link } from '../../lib/router';
import { Badge, Button, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs, Textarea, fmtDateTime, useAction, cx } from '../../components/ui';
import { IncidentModal } from './RequestDetail';
import { useOps } from './OpsApp';

const SEV_TONE: Record<string, string> = { CRITICAL: 'red', HIGH: 'red', MEDIUM: 'amber', LOW: 'gray' };

export default function Incidents() {
  const { can } = useOps();
  const [tab, setTab] = useState('open');
  const { data, loading, reload } = useApi<any[]>(`/api/v1/incidents?status=${tab === 'all' ? '' : tab === 'open' ? 'open' : 'CLOSED'}`, { poll: 15000 });
  const { data: settings } = useApi<any>('/api/v1/admin/settings');
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  return (
    <div>
      <PageHeader title="Incidents" sub="Health deterioration, falls, transport, complaints, safety, payment disputes, privacy" actions={can('incident.create') && <Button className="btn-primary btn-sm" onClick={() => setCreating(true)}><FiPlus /> Report incident</Button>} />
      <Tabs tabs={[{ id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }, { id: 'all', label: 'All' }]} value={tab} onChange={setTab} />
      {loading && !data ? <PageLoader /> : (
        <div className="mt-4 grid gap-3">
          {(data || []).map((i) => (
            <button key={i.id} onClick={() => setEdit(i)} className={cx('card flex flex-wrap items-start gap-4 p-4 text-left transition hover:shadow-lift', i.severity === 'CRITICAL' && i.status !== 'CLOSED' && 'ring-2 ring-red-400')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{i.incident_number}</span>
                  <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
                  <Badge tone={i.status === 'CLOSED' ? 'green' : i.status === 'IN_PROGRESS' ? 'blue' : 'amber'}>{i.status.replace('_', ' ')}</Badge>
                  <span className="text-sm text-slate-600">{i.category}</span>
                  {i.request_number && <Link to={`/ops/requests/${i.request_id}`} className="text-sm font-semibold text-brand-700" onClick={(e: any) => e.stopPropagation()}>{i.request_number}</Link>}
                </div>
                <p className="mt-1 text-sm text-slate-700">{i.description}</p>
                {i.actions && <p className="mt-1 text-xs text-slate-600"><strong>Actions:</strong> {i.actions}</p>}
                {i.resolution && <p className="mt-1 text-xs text-emerald-800"><strong>Resolution:</strong> {i.resolution} — {i.closed_by}, {fmtDateTime(i.closed_at)}</p>}
              </div>
              <div className="text-right text-xs text-slate-500">Reported by {i.reporter_name} ({i.reporter_type})<br />{fmtDateTime(i.created_at)}{i.companion_name && <><br />Companion: {i.companion_name}</>}</div>
            </button>
          ))}
          {!data?.length && <p className="card p-10 text-center text-sm text-slate-500">No incidents here. 🙏</p>}
        </div>
      )}
      {creating && <IncidentModal categories={settings?.settings.lists.incident_categories || []} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {edit && <IncidentEdit i={edit} canClose={can('incident.close')} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function IncidentEdit({ i, canClose, onClose, onDone }: { i: any; canClose: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ status: i.status, severity: i.severity, actions: i.actions || '', escalation: i.escalation || '', resolution: i.resolution || '' });
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} size="lg" title={`${i.incident_number} · ${i.category}`} footer={<><button className="btn btn-secondary" onClick={onClose}>Close</button><Button loading={!!busy} onClick={async () => { if (await run('s', () => patch(`/api/v1/incidents/${i.id}`, f), 'Incident updated')) onDone(); }}>Save</Button></>}>
      <p className="rounded-xl bg-slate-50 p-3 text-sm">{i.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={[{ value: 'OPEN', label: 'Open' }, { value: 'IN_PROGRESS', label: 'In progress' }, ...(canClose ? [{ value: 'CLOSED', label: 'Closed' }] : [])]} /></Field>
        <Field label="Severity"><Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} /></Field>
        <Field label="Actions taken" className="sm:col-span-2"><Textarea value={f.actions} onChange={(e) => setF({ ...f, actions: e.target.value })} /></Field>
        <Field label="Escalation" className="sm:col-span-2"><Input value={f.escalation} onChange={(e) => setF({ ...f, escalation: e.target.value })} placeholder="e.g. Escalated to Ops Manager / hospital admin" /></Field>
        <Field label={`Resolution${f.status === 'CLOSED' ? ' (required to close)' : ''}`} className="sm:col-span-2"><Textarea value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
