import React, { useEffect, useState } from 'react';
import {
  FiArrowLeft, FiPhone, FiNavigation, FiEdit2, FiUserPlus, FiXCircle, FiAlertTriangle, FiSend, FiMessageSquare, FiCheckCircle,
  FiClock, FiCreditCard, FiFileText, FiAlertOctagon, FiStar, FiExternalLink, FiCopy, FiRotateCcw, FiFlag, FiShield, FiRefreshCw, FiPlus, FiChevronDown,
} from 'react-icons/fi';
import { post, patch, useApi, fileToPayload } from '../../lib/api';
import { Link, navigate } from '../../lib/router';
import {
  Avatar, Badge, Button, ErrorState, Field, Input, KV, Modal, PageLoader, Section, Select, StatusBadge, Textarea, cx, fmtDateTime, fmtTime,
  useAction, ago, PayBadge, Toggle, toLocalInput, fromLocalInput,
} from '../../components/ui';
import { RequestFlags, UrgencyBadge } from '../../components/ops';
import { useOps } from './OpsApp';
import { useConfig } from '../../lib/config';
import { SERVICE_TYPE_LABEL, MOBILITY_LABEL, STATUS_LABEL, SERVICE_EVENTS, fmtINR, fmtDuration, URGENCY_LABEL } from '../../../shared/constants';

export default function RequestDetail({ id }: { id: string }) {
  const { data: d, error, loading, reload, setData } = useApi<any>(`/api/v1/requests/${id}`, { poll: 8000 });
  const { can } = useOps();
  const { busy, run } = useAction();
  const [modal, setModal] = useState<string | null>(null);
  const { data: settings } = useApi<any>('/api/v1/admin/settings');
  if (loading && !d) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const lists = settings?.settings?.lists || {};
  const act = async (key: string, fn: () => Promise<any>, msg?: string) => {
    const r = await run(key, fn, msg);
    if (r && r.id && r.events) setData(r); else reload();
    return r;
  };
  const transition = (to: string, extra: any = {}) => act(to, () => post(`/api/v1/requests/${d.id}/status`, { to, ...extra }), `Moved to ${STATUS_LABEL[to]}`);
  const s = d.current_status;
  const allowed: string[] = d.allowed_transitions;
  const terminal = ['COMPLETED', 'CANCELLED', 'UNFULFILLED'].includes(s);

  return (
    <div>
      <button onClick={() => (history.length > 1 ? history.back() : navigate('/ops'))} className="btn btn-ghost btn-sm -ml-2 mb-2"><FiArrowLeft /> Back</button>
      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="req-number">{d.request_number}</h1>
              <StatusBadge status={s} />
              <UrgencyBadge urgency={d.urgency} at={d.requested_datetime} />
              <Badge tone="gray">{d.channel}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">{SERVICE_TYPE_LABEL[d.service_type]} · {d.patient?.relationship || 'Patient'}{d.patient?.age ? `, ${d.patient.age}` : ''} · created {fmtDateTime(d.created_at)} ({ago(d.created_at)})</p>
            <div className="mt-2"><RequestFlags r={d} /></div>
            {d.human_review_required && d.human_review_reason && <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900 ring-1 ring-amber-200"><FiAlertTriangle className="mt-0.5 shrink-0" />{d.human_review_reason}</p>}
            {d.sla_risk && <p className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800 ring-1 ring-red-200"><FiClock className="mt-0.5 shrink-0" />SLA risk: {d.sla_risk_reason}</p>}
          </div>
          <div className="flex flex-wrap gap-2" data-testid="actions">
            {can('request.transition') && s === 'NEW' && <Button loading={busy === 'AWAITING_CONFIRMATION'} className="btn-secondary" onClick={() => transition('AWAITING_CONFIRMATION')}>Start review</Button>}
            {can('request.transition') && (s === 'NEW' || s === 'AWAITING_CONFIRMATION') && (
              <Button loading={busy === 'confirm'} onClick={() => act('confirm', async () => {
                if (s === 'NEW') await post(`/api/v1/requests/${d.id}/status`, { to: 'AWAITING_CONFIRMATION' });
                return post(`/api/v1/requests/${d.id}/status`, { to: 'SEARCHING_COMPANION' });
              }, 'Confirmed – customer notified')} data-testid="confirm-btn"><FiCheckCircle /> Confirm & find companion</Button>
            )}
            {can('companion.assign') && ['NEW', 'AWAITING_CONFIRMATION', 'SEARCHING_COMPANION'].includes(s) && <Button className={s === 'SEARCHING_COMPANION' ? 'btn-primary' : 'btn-secondary'} onClick={() => setModal('dispatch')} data-testid="assign-btn"><FiUserPlus /> Assign companion</Button>}
            {can('request.transition') && ['COMPANION_ASSIGNED', 'COMPANION_ACCEPTED'].includes(s) && <Button className="btn-secondary" loading={busy === 'SEARCHING_COMPANION'} onClick={() => confirm('Withdraw the current companion and search again?') && transition('SEARCHING_COMPANION', { notes: 'Reassigning' })}><FiRotateCcw /> Reassign</Button>}
            {can('request.transition') && d.allowed_events.length > 0 && <Button className="btn-secondary" onClick={() => setModal('event')}><FiFlag /> Record update</Button>}
            {can('request.transition') && ['AT_HOSPITAL', 'RETURNING'].includes(s) && <Button onClick={() => setModal('complete')}><FiCheckCircle /> Complete service</Button>}
            <MoreMenu items={[
              can('request.escalate') && { label: 'Medical / emergency escalation', icon: <FiAlertTriangle className="text-red-600" />, onClick: () => setModal('escalate') },
              can('notification.send') && { label: 'Send customer update', icon: <FiSend />, onClick: () => setModal('notify') },
              { label: 'Add internal note', icon: <FiMessageSquare />, onClick: () => setModal('note') },
              can('incident.create') && { label: 'Report incident', icon: <FiAlertOctagon />, onClick: () => setModal('incident') },
              can('request.edit') && { label: 'Edit details', icon: <FiEdit2 />, onClick: () => setModal('edit') },
              can('request.escalate') && { label: d.human_review_required ? 'Clear human-review flag' : 'Flag for human review', icon: <FiFlag />, onClick: () => act('flag', () => post(`/api/v1/requests/${d.id}/flags`, { flag: 'human_review_required', value: !d.human_review_required, reason: 'Set by operations' })) },
              can('request.transition') && allowed.includes('UNFULFILLED') && { label: 'Mark unfulfilled', icon: <FiXCircle />, onClick: () => setModal('unfulfilled') },
              can('request.cancel') && allowed.includes('CANCELLED') && { label: 'Cancel request', icon: <FiXCircle className="text-red-600" />, danger: true, onClick: () => setModal('cancel') },
              { label: 'Open customer tracking page', icon: <FiExternalLink />, onClick: () => window.open(d.track_url, '_blank') },
            ]} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Section title="Request details" action={can('request.edit') && <button className="btn btn-ghost btn-sm" onClick={() => setModal('edit')}><FiEdit2 /> Edit</button>}>
            <KV items={[
              ['Customer', <span key="c">{d.customer.name || '—'} {can('customer.view') && <Link className="text-xs text-brand-700 underline" to={`/ops/customers/${d.customer.id}`}>profile</Link>}</span>],
              ['Customer phone', <a key="p" className="font-medium text-brand-800" href={`tel:${d.customer.phone}`}><FiPhone className="mr-1 inline" />{d.customer.phone}</a>],
              ['Patient', `${d.patient?.name || '—'}${d.patient?.gender ? ` · ${d.patient.gender}` : ''}`],
              ['Age / relationship', `${d.patient?.age ?? '—'} · ${d.patient?.relationship || '—'}`],
              ['Language', d.patient?.language || 'Any'],
              ['Patient phone', d.patient?.phone ? <a key="pp" href={`tel:${d.patient.phone}`}>{d.patient.phone}</a> : '—'],
              ['Pickup', <span key="pk">{d.pickup?.address || '—'} {d.pickup_nav && <a className="ml-1 text-xs text-brand-700 underline" href={d.pickup_nav} target="_blank" rel="noreferrer"><FiNavigation className="inline" /> map</a>}{d.pickup?.lat ? <span className="block text-[11px] text-slate-400">{d.pickup.lat.toFixed(5)}, {d.pickup.lng.toFixed(5)} · {d.pickup.source}</span> : <span className="block text-[11px] text-amber-600">Not geocoded – confirm manually</span>}</span>],
              ['Destination', d.destination ? <span key="ds">{d.destination.place_name || d.destination.address} {d.destination_nav && <a className="ml-1 text-xs text-brand-700 underline" href={d.destination_nav} target="_blank" rel="noreferrer"><FiNavigation className="inline" /> map</a>}</span> : <span className="text-amber-700">Not decided</span>],
              ['Service type', SERVICE_TYPE_LABEL[d.service_type]],
              ['Mobility', <span key="m" className={d.mobility_status === 'BEDRIDDEN' ? 'font-semibold text-red-700' : ''}>{MOBILITY_LABEL[d.mobility_status]}</span>],
              ['Requested time', `${URGENCY_LABEL[d.urgency]} · ${fmtDateTime(d.requested_datetime)}`],
              ['Zone', d.zone || <span className="text-violet-700">Outside / unverified</span>],
              ['Special instructions', d.special_instructions || '—'],
              ['Booking code (verification)', <span key="bc" className="font-mono text-base font-bold tracking-widest" data-testid="booking-code">{d.booking_code}</span>],
              ['Source', `${d.source || d.channel}${d.utm && Object.keys(d.utm).length ? ' · ' + Object.entries(d.utm).filter(([k]) => k.startsWith('utm') || k === 'gclid').map(([k, v]) => `${k}=${v}`).join(' ') : ''}`],
            ]} />
          </Section>

          <Section title="Service times & SLA">
            <KV cols={3} items={[
              ['Assigned companion', d.companion?.name || '—'], ['ETA', fmtDateTime(d.estimated_arrival)], ['Actual arrival', fmtDateTime(d.actual_arrival)],
              ['Service start', fmtDateTime(d.service_start_time)], ['Service end', fmtDateTime(d.service_end_time)], ['Duration', fmtDuration(d.service_duration_minutes)],
              ['Verification', d.verified_at ? `${d.verification_result} via ${d.verification_method?.replace('_', ' ')} · ${fmtTime(d.verified_at)}` : '—'],
              ['Completion', d.completion_type ? `${d.completion_type}${d.completion_notes ? ' – ' + d.completion_notes : ''}` : '—'],
              ['Cancellation', d.cancellation_reason ? `${d.cancellation_reason} (${d.cancelled_by})` : '—'],
            ]} />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[['Request → assignment', d.metrics.request_to_assignment, d.metrics.targets.urgent_dispatch_minutes], ['Assignment → acceptance', d.metrics.assignment_to_acceptance, d.metrics.targets.acceptance_minutes],
                ['Acceptance → arrival', d.metrics.acceptance_to_arrival, null], ['Request → arrival', d.metrics.request_to_arrival, d.metrics.targets.arrival_minutes]].map(([l, v, t]: any) => (
                <div key={l} className={cx('rounded-xl p-3 ring-1', v != null && t != null && v > t ? 'bg-red-50 ring-red-200' : 'bg-slate-50 ring-slate-200')}>
                  <p className="text-[11px] font-semibold text-slate-500">{l}</p>
                  <p className="text-lg font-bold tabular-nums">{v != null ? `${v} min` : '—'}</p>
                  {t != null && <p className="text-[11px] text-slate-500">target {t} min</p>}
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Timeline · ${d.events.length} events`} action={<span className="text-xs text-slate-400">immutable audit trail</span>}>
            <ol data-testid="timeline">
              {d.events.map((e: any, i: number) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < d.events.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />}
                  <span className={cx('relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4', e.to_status ? 'bg-brand-600 ring-brand-50' : e.customer_visible ? 'bg-sky-500 ring-sky-50' : 'bg-slate-400 ring-slate-100')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><span className="font-semibold">{e.label}</span>{e.from_status && e.to_status && <span className="ml-2 text-[11px] text-slate-400">{STATUS_LABEL[e.from_status] || e.from_status} → {STATUS_LABEL[e.to_status]}</span>}</p>
                    {e.notes && <p className="text-sm text-slate-600">{e.notes}</p>}
                    <p className="text-[11px] text-slate-500">
                      {e.actor_name} ({e.actor_type}) · {fmtDateTime(e.created_at)}
                      {!e.customer_visible && ' · internal'}
                      {e.notification_status !== 'NONE' && <span className={cx('ml-1', e.notification_status === 'FAILED' ? 'font-semibold text-red-600' : 'text-emerald-700')}> · WhatsApp {e.notification_status.toLowerCase()}</span>}
                      {e.metadata?.location && <a className="ml-1 underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${e.metadata.location.lat},${e.metadata.location.lng}`}>location</a>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title={`Customer notifications · ${d.notifications.length}`}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Time</th><th>To</th><th>Channel</th><th>Template</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {d.notifications.map((n: any) => (
                    <tr key={n.id}>
                      <td className="whitespace-nowrap text-xs">{fmtDateTime(n.created_at)}</td>
                      <td className="text-xs">{n.recipient_type}</td>
                      <td className="text-xs">{n.channel}</td>
                      <td className="text-xs" title={n.body}>{n.template || n.title || n.event}</td>
                      <td><Badge tone={n.status === 'FAILED' ? 'red' : n.status === 'READ' ? 'blue' : 'green'}>{n.status}</Badge>{n.error && <p className="text-[11px] text-red-600">{n.error}</p>}</td>
                      <td>{n.status === 'FAILED' && can('notification.send') && <button className="btn btn-ghost btn-sm" onClick={() => act('retry', () => post(`/api/v1/notifications/${n.id}/retry`), 'Retried')}><FiRefreshCw /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <CompanionPanel d={d} onAssign={() => setModal('dispatch')} />
          <PaymentPanel d={d} act={act} busy={busy} />
          <ExpensePanel d={d} act={act} lists={lists} />
          <EscalationPanel d={d} act={act} onNew={() => setModal('escalate')} />
          <IncidentPanel d={d} onNew={() => setModal('incident')} />
          {(d.rating || d.trust) && (
            <Section title="Rating & trust">
              {d.rating && <p className="text-2xl text-amber-500">{'★'.repeat(d.rating.overall)}<span className="text-slate-200">{'★'.repeat(5 - d.rating.overall)}</span></p>}
              {d.rating?.comment && <p className="mt-1 text-sm italic text-slate-600">“{d.rating.comment}”</p>}
              {d.trust && <p className="mt-2 text-sm">Would trust us again: <Badge tone={d.trust.trust_again ? 'green' : 'red'}>{d.trust.trust_again ? 'YES' : 'NO'}</Badge>{d.trust.reason && <span className="ml-1 text-slate-600">– {d.trust.reason}</span>}</p>}
            </Section>
          )}
          {d.prior_requests.length > 0 && (
            <Section title="Customer’s previous requests">
              <ul className="space-y-1.5 text-sm">{d.prior_requests.map((p: any) => <li key={p.request_number} className="flex justify-between"><Link className="font-medium text-brand-800" to={`/ops/requests/${p.request_number}`}>{p.request_number}</Link><span className="text-xs text-slate-500">{STATUS_LABEL[p.current_status]} · {fmtDateTime(p.created_at)}</span></li>)}</ul>
            </Section>
          )}
        </div>
      </div>

      {modal === 'dispatch' && <DispatchModal d={d} onClose={() => setModal(null)} onDone={(r) => { setModal(null); setData(r); }} />}
      {modal === 'event' && <EventModal d={d} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'complete' && <CompleteModal d={d} types={lists.completion_types || []} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {(modal === 'cancel' || modal === 'unfulfilled') && <CancelModal d={d} to={modal === 'cancel' ? 'CANCELLED' : 'UNFULFILLED'} reasons={lists.cancellation_reasons || []} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'escalate' && <EscalateModal d={d} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'notify' && <NotifyModal d={d} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'note' && <NoteModal d={d} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'incident' && <IncidentModal requestId={d.id} categories={lists.incident_categories || []} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'edit' && <EditModal d={d} onClose={() => setModal(null)} onDone={(r) => { setModal(null); setData(r); }} />}
    </div>
  );
}

function MoreMenu({ items }: { items: any[] }) {
  const [open, setOpen] = useState(false);
  const list = items.filter(Boolean);
  return (
    <div className="relative">
      <button className="btn btn-secondary" onClick={() => setOpen(!open)} data-testid="more-menu">More <FiChevronDown /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl bg-white p-1.5 shadow-lift ring-1 ring-slate-200">
            {list.map((it) => (
              <button key={it.label} className={cx('flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50', it.danger && 'text-red-700')} onClick={() => { setOpen(false); it.onClick(); }}>{it.icon}{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- panels
function CompanionPanel({ d, onAssign }: { d: any; onAssign: () => void }) {
  const { can } = useOps();
  return (
    <Section title="Companion & dispatch">
      {d.companion ? (
        <div className="flex items-center gap-3">
          <Avatar name={d.companion.name} src={d.companion.photo_url} size={48} />
          <div className="min-w-0 flex-1">
            <Link to={`/ops/companions/${d.companion.id}`} className="font-bold text-brand-900">{d.companion.name}</Link>
            <p className="text-xs text-slate-500">{d.companion.code} · {d.companion.languages.join(', ')}</p>
            <p className="text-xs">{d.open_offer ? <span className="font-semibold text-violet-700">Offer pending · expires {fmtTime(d.open_offer.expires_at)}</span> : <span className="text-emerald-700">Accepted {fmtTime(d.accepted_at)}</span>}</p>
          </div>
          <a className="btn btn-secondary btn-sm" href={`tel:${d.companion.phone}`}><FiPhone /></a>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-slate-500">No companion assigned</p>
          {can('companion.assign') && ['NEW', 'AWAITING_CONFIRMATION', 'SEARCHING_COMPANION'].includes(d.current_status) && <Button className="btn-primary mt-3 w-full" onClick={onAssign}><FiUserPlus /> Find & assign companion</Button>}
        </div>
      )}
      {d.assignments.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
          {d.assignments.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <span>{a.companion_name} <span className="text-slate-400">({fmtTime(a.offered_at)}{a.eta_minutes ? ` · ETA ${a.eta_minutes}m` : ''})</span></span>
              <Badge tone={a.status === 'ACCEPTED' || a.status === 'COMPLETED' ? 'green' : a.status === 'OFFERED' ? 'violet' : 'gray'}>{a.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PaymentPanel({ d, act, busy }: { d: any; act: any; busy: string | null }) {
  const { can } = useOps();
  const [modal, setModal] = useState<null | { type: 'paid' | 'refund'; p: any }>(null);
  const b = d.charge_breakdown;
  const latest = d.payments?.filter((p: any) => p.status !== 'CANCELLED').at(-1);
  if (!can('payment.view')) return null;
  return (
    <Section title="Payment" action={<PayBadge status={d.payment_status} />}>
      <div className="flex items-end justify-between">
        <div><p className="text-xs text-slate-500">{d.final_amount != null ? 'Final charge' : 'Quoted (base)'}</p><p className="text-2xl font-bold tabular-nums">{fmtINR(d.final_amount ?? d.quoted_amount)}</p></div>
        {d.pricing_rule && <p className="text-right text-[11px] text-slate-500">{d.pricing_rule.name}<br />{fmtINR(d.pricing_rule.base_fee)} / {d.pricing_rule.included_minutes / 60}h + {fmtINR(d.pricing_rule.extension_rate_per_hour)}/h</p>}
      </div>
      {b && (
        <table className="mt-3 w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-1 text-slate-500">Base</td><td className="text-right">{fmtINR(b.base_fee)}</td></tr>
            <tr><td className="py-1 text-slate-500">Extension ({b.extension_blocks} × {Math.round(b.extra_minutes)}m extra)</td><td className="text-right">{fmtINR(b.extension_amount)}</td></tr>
            {b.urgent_surcharge > 0 && <tr><td className="py-1 text-slate-500">Urgent</td><td className="text-right">{fmtINR(b.urgent_surcharge)}</td></tr>}
            <tr><td className="py-1 text-slate-500">Tax {b.tax_percent}%</td><td className="text-right">{fmtINR(b.tax)}</td></tr>
            <tr><td className="py-1 text-slate-500">Expenses (billable)</td><td className="text-right">{fmtINR(b.expenses)}</td></tr>
          </tbody>
        </table>
      )}
      <ul className="mt-3 space-y-2">
        {(d.payments || []).map((p: any) => (
          <li key={p.id} className={cx('rounded-xl p-2.5 text-xs ring-1', p.status === 'CANCELLED' ? 'opacity-50 ring-slate-100' : 'ring-slate-200')}>
            <div className="flex items-center justify-between"><span className="font-semibold tabular-nums">{fmtINR(p.amount)} · {p.provider}</span><PayBadge status={p.status} /></div>
            <p className="mt-0.5 text-slate-500">{fmtDateTime(p.created_at)}{p.method ? ` · ${p.method}` : ''}{p.provider_payment_id ? ` · ${p.provider_payment_id}` : ''}</p>
            {p.failure_reason && <p className="text-red-600">{p.failure_reason}</p>}
            {Number(p.refunded_amount) > 0 && <p className="text-violet-700">Refunded {fmtINR(p.refunded_amount)}</p>}
            {p.status !== 'CANCELLED' && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.payment_link_url && ['PENDING', 'CREATED', 'FAILED'].includes(p.status) && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(p.payment_link_url.startsWith('/') ? location.origin + p.payment_link_url : p.payment_link_url); }}><FiCopy /> Copy link</button>
                  <a className="btn btn-ghost btn-sm" href={p.payment_link_url} target="_blank" rel="noreferrer"><FiExternalLink /> Open</a>
                </>}
                {can('payment.manage') && ['PENDING', 'CREATED', 'FAILED'].includes(p.status) && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'paid', p })}>Mark paid</button>}
                {can('payment.refund') && ['PAID', 'PARTIALLY_REFUNDED'].includes(p.status) && <button className="btn btn-ghost btn-sm text-red-700" onClick={() => setModal({ type: 'refund', p })}><FiRotateCcw /> Refund</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {can('payment.manage') && d.current_status === 'COMPLETED' && !['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(d.payment_status) && (
        <Button className="btn-secondary mt-3 w-full" loading={busy === 'paylink'} onClick={() => act('paylink', () => post(`/api/v1/requests/${d.id}/payments`, {}), 'New payment link created')}><FiCreditCard /> Regenerate payment link</Button>
      )}
      {modal && <PaymentActionModal m={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); act('x', async () => null); }} />}
    </Section>
  );
}

function PaymentActionModal({ m, onClose, onDone }: { m: { type: 'paid' | 'refund'; p: any }; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState('upi');
  const [ref, setRef] = useState('');
  const [amount, setAmount] = useState(String(Number(m.p.amount) - Number(m.p.refunded_amount)));
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  const submit = async () => {
    const r = m.type === 'paid'
      ? await run('s', () => post(`/api/v1/payments/${m.p.id}/mark-paid`, { method, reference: ref }), 'Marked as paid')
      : await run('s', () => post(`/api/v1/payments/${m.p.id}/refund`, { amount: Number(amount), reason }), 'Refund issued');
    if (r) onDone();
  };
  return (
    <Modal open onClose={onClose} title={m.type === 'paid' ? 'Record offline payment' : 'Issue refund'} footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} onClick={submit} className={m.type === 'refund' ? 'btn-danger' : 'btn-primary'}>{m.type === 'paid' ? 'Mark paid' : `Refund ₹${amount}`}</Button></>}>
      {m.type === 'paid' ? (
        <div className="space-y-3">
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={['upi', 'cash', 'bank_transfer', 'card']} /></Field>
          <Field label="Reference (UTR / receipt no.)"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={`Amount (max ₹${Number(m.p.amount) - Number(m.p.refunded_amount)})`}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

function ExpensePanel({ d, act, lists }: { d: any; act: any; lists: any }) {
  const { can } = useOps();
  const [open, setOpen] = useState(false);
  return (
    <Section title={`Expenses · ${d.expenses.length}`} action={can('expense.create') && <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><FiPlus /> Add</button>}>
      {!d.expenses.length && <p className="text-sm text-slate-500">No expenses recorded.</p>}
      <ul className="space-y-2">
        {d.expenses.map((e: any) => (
          <li key={e.id} className="rounded-xl p-2.5 text-xs ring-1 ring-slate-200">
            <div className="flex justify-between gap-2"><span className="font-semibold">{e.category} · {fmtINR(e.amount)}</span><Badge tone={e.approval_status === 'APPROVED' ? 'green' : e.approval_status === 'REJECTED' ? 'red' : 'amber'}>{e.approval_status}</Badge></div>
            <p className="text-slate-500">{e.description} · by {e.submitted_by_name} · {fmtTime(e.created_at)}{e.bill_to_customer ? ' · billable' : ' · absorbed'}</p>
            <div className="mt-1 flex gap-1">
              {e.receipt_file_id && <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`/api/v1/files/${e.receipt_file_id}`}><FiFileText /> Receipt</a>}
              {can('expense.approve') && e.approval_status === 'PENDING' && <>
                <button className="btn btn-ghost btn-sm text-emerald-700" onClick={() => act('exp', () => post(`/api/v1/expenses/${e.id}/review`, { decision: 'APPROVED' }), 'Expense approved')}>Approve</button>
                <button className="btn btn-ghost btn-sm text-red-700" onClick={() => { const note = prompt('Reason for rejection?'); if (note !== null) act('exp', () => post(`/api/v1/expenses/${e.id}/review`, { decision: 'REJECTED', note }), 'Expense rejected'); }}>Reject</button>
              </>}
            </div>
          </li>
        ))}
      </ul>
      {open && <ExpenseModal requestId={d.id} categories={lists.expense_categories || []} onClose={() => setOpen(false)} onDone={() => { setOpen(false); act('x', async () => null); }} />}
    </Section>
  );
}

function ExpenseModal({ requestId, categories, onClose, onDone }: { requestId: string; categories: string[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ category: categories[0], amount: '', description: '', bill_to_customer: true, auto_approve: true });
  const [file, setFile] = useState<File | null>(null);
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Record expense" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} onClick={async () => {
      const r = await run('s', async () => post(`/api/v1/requests/${requestId}/expenses`, { ...f, amount: Number(f.amount), receipt: file ? await fileToPayload(file) : null }), 'Expense recorded');
      if (r) onDone();
    }}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={categories} /></Field>
        <Field label="Amount (₹)"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Receipt (image or PDF, max 3 MB)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" /></Field>
        <Toggle checked={f.bill_to_customer} onChange={(v) => setF({ ...f, bill_to_customer: v })} label="Bill to customer" />
        <Toggle checked={f.auto_approve} onChange={(v) => setF({ ...f, auto_approve: v })} label="Approve now" />
      </div>
    </Modal>
  );
}

function EscalationPanel({ d, act, onNew }: { d: any; act: any; onNew: () => void }) {
  const { can } = useOps();
  if (!d.escalations.length && !d.emergency_review) return null;
  return (
    <Section title={<span className="flex items-center gap-2 text-red-700"><FiAlertTriangle /> Escalations</span>} action={can('request.escalate') && <button className="btn btn-ghost btn-sm" onClick={onNew}><FiPlus /></button>}>
      <ul className="space-y-2">
        {d.escalations.map((e: any) => (
          <li key={e.id} className={cx('rounded-xl p-3 text-xs ring-1', e.status === 'OPEN' ? 'bg-red-50 ring-red-200' : 'ring-slate-200')}>
            <div className="flex justify-between"><span className="font-semibold">{e.reason}</span><Badge tone={e.status === 'OPEN' ? 'red' : 'green'}>{e.status}</Badge></div>
            {e.action_taken && <p className="mt-1">Action: {e.action_taken}</p>}
            {e.notes && <p className="text-slate-600">{e.notes}</p>}
            <p className="mt-1 text-slate-500">{e.agent_name} · {fmtDateTime(e.created_at)}</p>
            {e.resolution && <p className="mt-1 text-emerald-800">Resolution: {e.resolution} ({e.resolved_by}, {fmtDateTime(e.resolved_at)})</p>}
            {e.status === 'OPEN' && can('request.escalate') && <button className="btn btn-secondary btn-sm mt-2" onClick={() => { const r = prompt('Resolution'); if (r) act('esc', () => post(`/api/v1/escalations/${e.id}/resolve`, { resolution: r }), 'Escalation resolved'); }}>Resolve</button>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function IncidentPanel({ d, onNew }: { d: any; onNew: () => void }) {
  const { can } = useOps();
  return (
    <Section title={`Incidents · ${d.incidents.length}`} action={can('incident.create') && <button className="btn btn-ghost btn-sm" onClick={onNew}><FiPlus /> Report</button>}>
      {!d.incidents.length ? <p className="text-sm text-slate-500">No incidents.</p> : (
        <ul className="space-y-2">
          {d.incidents.map((i: any) => (
            <li key={i.id} className="rounded-xl p-2.5 text-xs ring-1 ring-slate-200">
              <div className="flex justify-between"><Link to="/ops/incidents" className="font-semibold text-brand-800">{i.incident_number} · {i.category}</Link><Badge tone={i.status === 'CLOSED' ? 'green' : i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'red' : 'amber'}>{i.status === 'CLOSED' ? 'CLOSED' : i.severity}</Badge></div>
              <p className="mt-0.5 text-slate-600">{i.description}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------- modals
function DispatchModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: (r: any) => void }) {
  const { data, loading } = useApi<any[]>(`/api/v1/requests/${d.id}/candidates`);
  const { busy, run } = useAction();
  const [note, setNote] = useState('');
  const [all, setAll] = useState(false);
  const list = (data || []).filter((c) => all || c.eligible || c.availability === 'AVAILABLE');
  return (
    <Modal open onClose={onClose} size="xl" title={`Assign companion · ${d.request_number}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Pickup: <strong>{d.pickup?.address}</strong>{d.patient?.language ? ` · prefers ${d.patient.language}` : ''} · {MOBILITY_LABEL[d.mobility_status]}</p>
        <Toggle checked={all} onChange={setAll} label="Show all companions" />
      </div>
      <p className="mb-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">Manual dispatch: V1 never auto-assigns. The companion gets an offer and must accept within the configured window; you’ll be alerted if they decline or don’t respond.</p>
      {loading ? <PageLoader /> : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Companion</th><th>Distance / ETA</th><th>Status</th><th>Zone</th><th>Training</th><th>Languages</th><th>Rating</th><th>Acceptance</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className={cx(!c.eligible && 'opacity-60')}>
                  <td><div className="flex items-center gap-2"><Avatar name={c.name} src={c.photo_url} size={32} /><div><p className="font-semibold">{c.name}</p><p className="text-[11px] text-slate-500">{c.code} · {c.jobs_completed} jobs</p></div></div></td>
                  <td className="whitespace-nowrap tabular-nums">{c.distance_km != null ? `${c.distance_km} km` : '—'}<p className="text-[11px] text-slate-500">{c.eta_minutes ? `~${c.eta_minutes} min` : ''}</p></td>
                  <td><Badge tone={c.availability === 'AVAILABLE' ? 'green' : c.availability === 'BUSY' ? 'amber' : 'gray'}>{c.availability}</Badge>{c.active_request && <p className="text-[11px] text-slate-500">on {c.active_request}</p>}</td>
                  <td className="text-xs">{c.zone || '—'}{c.same_zone && <span className="ml-1 text-emerald-700">✓</span>}</td>
                  <td>{c.training_complete ? <Badge tone="green"><FiShield /> Trained</Badge> : <Badge tone="amber">Pending</Badge>}{c.verification_missing.length > 0 && <p className="text-[11px] text-red-600">Missing: {c.verification_missing.length} checks</p>}</td>
                  <td className="text-xs">{c.languages.join(', ')}{c.speaks_patient_language && <span className="ml-1 font-semibold text-emerald-700">✓ match</span>}</td>
                  <td className="whitespace-nowrap">{c.rating ? <><FiStar className="inline text-amber-500" /> {c.rating}</> : '—'}</td>
                  <td>{c.acceptance_rate != null ? `${c.acceptance_rate}%` : '—'}</td>
                  <td><Button className="btn-primary btn-sm" disabled={!c.eligible} loading={busy === c.id} data-testid={`assign-${c.code}`}
                    onClick={async () => { const r = await run(c.id, () => post(`/api/v1/requests/${d.id}/assign`, { companion_id: c.id, note }), `Offer sent to ${c.name}`); if (r) onDone(r); }}>
                    Assign</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <p className="p-6 text-center text-sm text-slate-500">No available companions. Toggle “Show all” or call your on-call pool.</p>}
        </div>
      )}
      <Field label="Note for the timeline (optional)" className="mt-3"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function EventModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const events = SERVICE_EVENTS.filter((e) => d.allowed_events.includes(e.type));
  const [type, setType] = useState(events[0]?.type || '');
  const [notes, setNotes] = useState('');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState('operations_assisted');
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Record service update" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} onClick={async () => {
      const r = await run('e', () => post(`/api/v1/requests/${d.id}/status`, { event_type: type, notes, verification: type === 'patient_verified' ? { method, code } : undefined }), 'Update recorded');
      if (r) onDone();
    }}>Record</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Record on behalf of the companion (e.g. they called in). Customer-facing updates are sent on WhatsApp automatically.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {events.map((e) => (
          <button key={e.type} onClick={() => setType(e.type)} className={cx('rounded-xl p-2.5 text-left text-sm ring-1', type === e.type ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200 hover:bg-slate-50')}>
            <span className="font-semibold">{e.label}</span>
            <span className="block text-[11px] text-slate-500">{e.toStatus ? `→ ${STATUS_LABEL[e.toStatus]}` : 'Journey update'}{e.customer ? ' · notifies customer' : ''}</span>
          </button>
        ))}
      </div>
      {type === 'patient_verified' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: 'operations_assisted', label: 'Operations-assisted (called family)' }, { value: 'booking_code', label: 'Booking code' }, { value: 'otp', label: 'OTP' }]} /></Field>
          {method === 'booking_code' && <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>}
        </div>
      )}
      <Field label="Notes (optional, no medical details)" className="mt-3"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
    </Modal>
  );
}

function CompleteModal({ d, types, onClose, onDone }: { d: any; types: string[]; onClose: () => void; onDone: () => void }) {
  const [t, setT] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Complete service" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} disabled={!t} onClick={async () => { const r = await run('c', () => post(`/api/v1/requests/${d.id}/complete`, { completion_type: t, notes }), 'Service completed – customer notified'); if (r) onDone(); }}>Complete & bill</Button></>}>
      <div className="grid gap-2">{types.map((x) => <button key={x} onClick={() => setT(x)} className={cx('rounded-xl p-3 text-left text-sm ring-1', t === x ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200')}>{x}</button>)}</div>
      <Field label="Notes" className="mt-3"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <p className="mt-2 text-xs text-slate-500">Service end time is recorded now; the final charge is calculated from the pricing rule and billable expenses, and a payment link is sent.</p>
    </Modal>
  );
}

function CancelModal({ d, to, reasons, onClose, onDone }: { d: any; to: string; reasons: string[]; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, run } = useAction();
  const options = reasons.includes('Other') ? reasons : [...reasons, 'Other'];
  const isOther = reason === 'Other';
  const finalReason = isOther ? custom.trim() : reason;
  return (
    <Modal open onClose={onClose} title={to === 'CANCELLED' ? `Cancel ${d.request_number}` : `Mark ${d.request_number} unfulfilled`} footer={<><button className="btn btn-secondary" onClick={onClose}>Back</button><Button className="btn-danger" loading={!!busy} disabled={!finalReason} onClick={async () => { const r = await run('c', () => post(`/api/v1/requests/${d.id}/status`, { to, reason: finalReason, notes }), 'Request closed'); if (r) onDone(); }} data-testid="cancel-confirm">Confirm</Button></>}>
      <Field label="Reason (sent to the customer)"><Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Select a reason" options={options} /></Field>
      {isOther && <Field label="Type the reason" className="mt-3"><Input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={200} placeholder="e.g. Doctor's appointment moved to next week" autoFocus data-testid="cancel-reason-text" /></Field>}
      <Field label="Internal notes (not sent to the customer)" className="mt-3"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <p className="mt-2 text-xs text-slate-500">The customer is informed on WhatsApp with this reason. Any pending companion offer is withdrawn.</p>
    </Modal>
  );
}

function EscalateModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ reason: '', action_taken: '', notes: '' });
  const { busy, run } = useAction();
  const c = useConfig();
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2 text-red-700"><FiAlertTriangle /> Medical / Emergency escalation</span>} footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button className="btn-danger" loading={!!busy} onClick={async () => { const r = await run('e', () => post(`/api/v1/requests/${d.id}/escalations`, f), 'Escalation recorded'); if (r) onDone(); }}>Record escalation</Button></>}>
      <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-900">If life is at risk: instruct the companion/family to call <strong>{c?.emergency.primary_number}</strong> / <strong>{c?.emergency.ambulance_number}</strong> immediately, then record it here.</p>
      <div className="space-y-3">
        <Field label="Reason *"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Patient breathless in waiting area" /></Field>
        <Field label="Action taken"><Input value={f.action_taken} onChange={(e) => setF({ ...f, action_taken: e.target.value })} placeholder="e.g. Taken to emergency dept; family called" /></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <p className="mt-2 text-xs text-slate-500">Timestamp and agent are recorded automatically. Resolution is captured when you resolve it.</p>
    </Modal>
  );
}

function NotifyModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const { data: templates } = useApi<any[]>('/api/v1/admin/templates');
  const [tpl, setTpl] = useState('status_update');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Send customer update (WhatsApp)" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} onClick={async () => { const r = await run('n', () => post(`/api/v1/requests/${d.id}/notify`, { template: tpl, label, notes }), 'Update sent'); if (r) onDone(); }}><FiSend /> Send</Button></>}>
      <Field label="Template"><Select value={tpl} onChange={(e) => setTpl(e.target.value)} options={(templates || []).map((t) => ({ value: t.key, label: t.name }))} /></Field>
      {tpl === 'status_update' && <>
        <Field label="Headline" className="mt-3"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Waiting for scan – about 30 min" /></Field>
        <Field label="Details" className="mt-3" hint="Avoid sensitive medical details."><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </>}
      <p className="mt-3 whitespace-pre-line rounded-xl bg-[#d9fdd3] p-3 text-xs text-slate-700">{(templates || []).find((t) => t.key === tpl)?.body}</p>
    </Modal>
  );
}

function NoteModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Internal note" footer={<Button loading={!!busy} onClick={async () => { const r = await run('n', () => post(`/api/v1/requests/${d.id}/notes`, { note }), 'Note added'); if (r) onDone(); }}>Add note</Button>}>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Visible to operations only" autoFocus />
    </Modal>
  );
}

export function IncidentModal({ requestId, categories, onClose, onDone }: { requestId?: string | null; categories: string[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ severity: 'MEDIUM', category: '', description: '', request_id: requestId || '' });
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Report incident" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} onClick={async () => {
      const r = await run('i', () => post(requestId ? `/api/v1/requests/${requestId}/incidents` : '/api/v1/incidents', f), 'Incident created');
      if (r) onDone();
    }}>Create incident</Button></>}>
      <div className="space-y-3">
        {!requestId && <Field label="Request ID (optional)"><Input value={f.request_id} onChange={(e) => setF({ ...f, request_id: e.target.value.toUpperCase() })} placeholder="MC-10452" /></Field>}
        <Field label="Severity"><div className="grid grid-cols-4 gap-2">{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <button type="button" key={s} onClick={() => setF({ ...f, severity: s })} className={cx('rounded-xl py-2 text-xs font-bold ring-1', f.severity === s ? (s === 'CRITICAL' || s === 'HIGH' ? 'bg-red-600 text-white ring-red-600' : 'bg-slate-900 text-white ring-slate-900') : 'ring-slate-200')}>{s}</button>)}</div></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Select" options={categories} /></Field>
        <Field label="What happened?"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={4} /></Field>
      </div>
    </Modal>
  );
}

function EditModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: (r: any) => void }) {
  const c = useConfig();
  const [f, setF] = useState<any>({
    customer_name: d.customer.name || '', customer_email: d.customer.email || '', patient_name: d.patient?.name || '', patient_age: d.patient?.age ?? '', patient_gender: d.patient?.gender || '',
    patient_language: d.patient?.language || '', patient_phone: d.patient?.phone || '', relationship: d.patient?.relationship || '', service_type: d.service_type, urgency: d.urgency,
    requested_datetime: toLocalInput(d.requested_datetime), estimated_arrival: toLocalInput(d.estimated_arrival), mobility_status: d.mobility_status, special_instructions: d.special_instructions || '',
    destination_name: d.destination?.place_name || d.destination?.address || '', pickup_address: d.pickup?.address || '',
  });
  const { busy, run } = useAction();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const body: any = {};
    const orig: any = { customer_name: d.customer.name || '', customer_email: d.customer.email || '', patient_name: d.patient?.name || '', patient_age: d.patient?.age ?? '', patient_gender: d.patient?.gender || '', patient_language: d.patient?.language || '', patient_phone: d.patient?.phone || '', relationship: d.patient?.relationship || '', service_type: d.service_type, urgency: d.urgency, requested_datetime: toLocalInput(d.requested_datetime), estimated_arrival: toLocalInput(d.estimated_arrival), mobility_status: d.mobility_status, special_instructions: d.special_instructions || '', destination_name: d.destination?.place_name || d.destination?.address || '', pickup_address: d.pickup?.address || '' };
    for (const k of Object.keys(f)) if (String(f[k]) !== String(orig[k])) body[k] = ['requested_datetime', 'estimated_arrival'].includes(k) ? fromLocalInput(f[k]) : f[k];
    if (!Object.keys(body).length) return onClose();
    const r = await run('s', () => patch(`/api/v1/requests/${d.id}`, body), 'Request updated');
    if (r) onDone(r);
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`Edit ${d.request_number}`} footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><Button loading={!!busy} onClick={save}>Save changes</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name"><Input value={f.customer_name} onChange={set('customer_name')} /></Field>
        <Field label="Customer email"><Input value={f.customer_email} onChange={set('customer_email')} /></Field>
        <Field label="Patient name"><Input value={f.patient_name} onChange={set('patient_name')} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Age"><Input type="number" value={f.patient_age} onChange={set('patient_age')} /></Field><Field label="Gender"><Select value={f.patient_gender} onChange={set('patient_gender')} placeholder="—" options={['Female', 'Male', 'Other']} /></Field></div>
        <Field label="Relationship"><Input value={f.relationship} onChange={set('relationship')} /></Field>
        <Field label="Language"><Select value={f.patient_language} onChange={set('patient_language')} placeholder="Any" options={c?.lists.languages || []} /></Field>
        <Field label="Patient phone"><Input value={f.patient_phone} onChange={set('patient_phone')} /></Field>
        <Field label="Service type"><Select value={f.service_type} onChange={set('service_type')} options={Object.entries(SERVICE_TYPE_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Urgency"><Select value={f.urgency} onChange={set('urgency')} options={Object.entries(URGENCY_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Requested time"><Input type="datetime-local" value={f.requested_datetime} onChange={set('requested_datetime')} /></Field>
        <Field label="ETA (override)"><Input type="datetime-local" value={f.estimated_arrival} onChange={set('estimated_arrival')} /></Field>
        <Field label="Mobility"><Select value={f.mobility_status} onChange={set('mobility_status')} options={Object.entries(MOBILITY_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Pickup address" className="sm:col-span-2"><Input value={f.pickup_address} onChange={set('pickup_address')} /></Field>
        <Field label="Destination" className="sm:col-span-2"><Input value={f.destination_name} onChange={set('destination_name')} placeholder="Hospital / clinic" /></Field>
        <Field label="Special instructions" className="sm:col-span-2"><Textarea value={f.special_instructions} onChange={set('special_instructions')} maxLength={300} /></Field>
      </div>
      <p className="mt-2 text-xs text-slate-500">Changes are recorded in the timeline and audit log with before/after values.</p>
    </Modal>
  );
}
