import React, { useMemo, useState } from 'react';
import { FiColumns, FiList, FiMapPin, FiArrowRight, FiUser, FiRefreshCw } from 'react-icons/fi';
import { useApi } from '../../lib/api';
import { Link, navigate } from '../../lib/router';
import { PageHeader, Stat, Select, StatusBadge, cx, ago, fmtTime, PageLoader, ErrorState, PayBadge } from '../../components/ui';
import { RequestFlags, UrgencyBadge } from '../../components/ops';
import { STATUS_LABEL, SERVICE_TYPE_LABEL, isUrgent, BOARD_COLUMNS } from '../../../shared/constants';

export default function Board() {
  const { data, error, loading, reload } = useApi<any>('/api/v1/board', { poll: 5000 });
  const [view, setView] = useState<'board' | 'list'>(() => (window.innerWidth < 768 ? 'list' : 'board'));
  const [f, setF] = useState({ urgency: '', type: '', companion: '', zone: '', flag: '', payment: '' });
  const rows = useMemo(() => (data?.requests || []).filter((r: any) =>
    (!f.urgency || (f.urgency === 'urgent' ? isUrgent(r.urgency) : !isUrgent(r.urgency))) &&
    (!f.type || r.service_type === f.type) && (!f.companion || r.companion_name === f.companion) && (!f.zone || (r.zone || 'Unzoned') === f.zone) &&
    (!f.payment || r.payment_status === f.payment) &&
    (!f.flag || (f.flag === 'emergency' ? r.emergency_review : f.flag === 'review' ? r.human_review_required : f.flag === 'sla' ? r.sla_risk : f.flag === 'incident' ? r.incident_flag : true)),
  ), [data, f]);
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const open = data.requests.filter((r: any) => !['COMPLETED', 'CANCELLED', 'UNFULFILLED'].includes(r.current_status));
  const unassignedUrgent = open.filter((r: any) => isUrgent(r.urgency) && ['NEW', 'AWAITING_CONFIRMATION', 'SEARCHING_COMPANION'].includes(r.current_status)).length;
  const inService = open.filter((r: any) => ['COMPANION_ACCEPTED', 'EN_ROUTE', 'WITH_PATIENT', 'AT_HOSPITAL', 'RETURNING'].includes(r.current_status)).length;
  const slaRisk = open.filter((r: any) => r.sla_risk).length;
  const avail = data.companions.find((c: any) => c.availability === 'AVAILABLE')?.n || 0;
  const busy = data.companions.find((c: any) => c.availability === 'BUSY')?.n || 0;
  const uniq = (k: string) => [...new Set(data.requests.map((r: any) => r[k]).filter(Boolean))] as string[];
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      <PageHeader title="Live queue" sub={<span className="inline-flex items-center gap-1.5"><span className="relative flex h-2 w-2 text-emerald-500"><span className="pulse-ring absolute inset-0" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>Auto-refreshing · updated {fmtTime(data.server_time)}</span>}
        actions={<>
          <div className="flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
            <button className={cx('btn btn-sm', view === 'board' ? 'bg-slate-900 text-white' : 'btn-ghost')} onClick={() => setView('board')}><FiColumns /> Board</button>
            <button className={cx('btn btn-sm', view === 'list' ? 'bg-slate-900 text-white' : 'btn-ghost')} onClick={() => setView('list')}><FiList /> List</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={reload}><FiRefreshCw /></button>
        </>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open requests" value={open.length} />
        <Stat label="Urgent, no companion yet" value={unassignedUrgent} tone={unassignedUrgent ? 'warn' : undefined} />
        <Stat label="In service now" value={inService} />
        <Stat label="SLA at risk" value={slaRisk} tone={slaRisk ? 'bad' : 'good'} />
        <Stat label="Companions" value={<span>{avail} <span className="text-sm font-medium text-slate-500">available · {busy} busy</span></span>} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Select value={f.urgency} onChange={set('urgency')} placeholder="All urgency" options={[{ value: 'urgent', label: 'Urgent (ASAP / 2h)' }, { value: 'scheduled', label: 'Scheduled / later' }]} />
        <Select value={f.type} onChange={set('type')} placeholder="All request types" options={Object.entries(SERVICE_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select value={f.zone} onChange={set('zone')} placeholder="All zones" options={[...uniq('zone'), 'Unzoned']} />
        <Select value={f.companion} onChange={set('companion')} placeholder="All companions" options={uniq('companion_name')} />
        <Select value={f.flag} onChange={set('flag')} placeholder="All flags" options={[{ value: 'emergency', label: 'Emergency review' }, { value: 'review', label: 'Human review' }, { value: 'sla', label: 'SLA risk' }, { value: 'incident', label: 'Incident' }]} />
        <Select value={f.payment} onChange={set('payment')} placeholder="All payment" options={['NOT_DUE', 'PENDING', 'PAID', 'FAILED']} />
      </div>
      {view === 'board' ? (
        <div className="scrollbar-thin mt-4 flex gap-3 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => {
            const items = rows.filter((r: any) => r.current_status === col || (col === 'CANCELLED' && r.current_status === 'UNFULFILLED'));
            return (
              <div key={col} className="w-[272px] shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{STATUS_LABEL[col]}</p>
                  <span className={cx('rounded-full px-2 text-xs font-bold', items.length ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500')}>{items.length}</span>
                </div>
                <div className="min-h-24 space-y-2 rounded-2xl bg-slate-100/70 p-2">
                  {items.map((r: any) => <Card key={r.id} r={r} />)}
                  {!items.length && <p className="py-6 text-center text-xs text-slate-400">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Request</th><th>Status</th><th>When</th><th>Service</th><th>Pickup</th><th>Companion</th><th>Flags</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/ops/requests/${r.id}`)}>
                  <td className="font-semibold text-brand-800">{r.request_number}<div className="text-xs font-normal text-slate-500">{r.customer_name}</div></td>
                  <td><StatusBadge status={r.current_status} /></td>
                  <td><UrgencyBadge urgency={r.urgency} at={r.requested_datetime} /></td>
                  <td className="whitespace-nowrap">{SERVICE_TYPE_LABEL[r.service_type]}</td>
                  <td className="max-w-[220px] truncate text-slate-600">{r.pickup_address}</td>
                  <td>{r.companion_name || <span className="text-slate-400">—</span>}</td>
                  <td><RequestFlags r={r} compact /></td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{ago(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-8 text-center text-sm text-slate-500">No requests match these filters.</p>}
        </div>
      )}
    </div>
  );
}

function Card({ r }: { r: any }) {
  const urgent = isUrgent(r.urgency);
  return (
    <Link to={`/ops/requests/${r.id}`} className={cx('block rounded-xl bg-white p-3 shadow-sm ring-1 transition hover:shadow-md hover:ring-brand-300',
      r.emergency_review || r.sla_risk ? 'ring-red-300' : 'ring-slate-200', urgent && !['COMPLETED', 'CANCELLED'].includes(r.current_status) && 'border-l-4 border-l-coral-500')} data-testid={`card-${r.request_number}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-brand-900">{r.request_number}</p>
        <UrgencyBadge urgency={r.urgency} at={r.requested_datetime} />
      </div>
      <p className="mt-1 text-[13px] font-medium">{SERVICE_TYPE_LABEL[r.service_type]}</p>
      <p className="text-xs text-slate-500">{r.relationship || 'Patient'}{r.patient_age ? `, ${r.patient_age}` : ''} · {r.customer_name || r.customer_phone}</p>
      <p className="mt-1.5 flex items-start gap-1 text-xs text-slate-600"><FiMapPin className="mt-0.5 shrink-0" /><span className="line-clamp-1">{r.pickup_address}</span></p>
      {(r.destination_name || r.destination_address) && <p className="flex items-start gap-1 text-xs text-slate-600"><FiArrowRight className="mt-0.5 shrink-0" /><span className="line-clamp-1">{r.destination_name || r.destination_address}</span></p>}
      {r.companion_name && <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-brand-800"><FiUser /> {r.companion_name}{r.estimated_arrival && !r.actual_arrival && ['COMPANION_ACCEPTED', 'EN_ROUTE'].includes(r.current_status) ? ` · ETA ${fmtTime(r.estimated_arrival)}` : ''}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <RequestFlags r={r} compact />
        <span className="ml-auto text-[11px] text-slate-400">{ago(r.created_at)}</span>
      </div>
      {r.current_status === 'COMPLETED' && <div className="mt-1.5"><PayBadge status={r.payment_status} /></div>}
    </Link>
  );
}
