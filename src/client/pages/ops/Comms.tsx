import React, { useState } from 'react';
import { FiCheck, FiRefreshCw, FiMapPin } from 'react-icons/fi';
import { post, useApi } from '../../lib/api';
import { Link, navigate } from '../../lib/router';
import { Badge, Button, PageHeader, PageLoader, Tabs, cx, fmtDateTime, useAction, ago, Select } from '../../components/ui';
import { useOps } from './OpsApp';

const SEV: Record<string, string> = { CRITICAL: 'red', URGENT: 'coral', WARNING: 'amber', INFO: 'blue' };

export function Alerts() {
  const [tab, setTab] = useState('unacked');
  const { data, loading, reload } = useApi<any[]>(`/api/v1/alerts${tab === 'unacked' ? '?unacked=1' : ''}`, { poll: 8000 });
  const { run } = useAction();
  return (
    <div>
      <PageHeader title="Operations alerts" sub="New requests, SLA risk, declines & expired offers, escalations, incidents, failed notifications, low ratings"
        actions={<Button className="btn-secondary btn-sm" onClick={async () => { await run('a', () => post('/api/v1/alerts/ack-all'), 'All acknowledged'); reload(); }}><FiCheck /> Acknowledge all</Button>} />
      <Tabs tabs={[{ id: 'unacked', label: 'Needs attention' }, { id: 'all', label: 'All recent' }]} value={tab} onChange={setTab} />
      {loading && !data ? <PageLoader /> : (
        <ul className="mt-4 space-y-2">
          {(data || []).map((a) => (
            <li key={a.id} className={cx('card flex items-start gap-3 p-4', a.severity === 'CRITICAL' && !a.acknowledged_at && 'ring-2 ring-red-300')}>
              <Badge tone={SEV[a.severity]}>{a.severity}</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.title}</p>
                <p className="text-sm text-slate-600">{a.body}</p>
                <p className="mt-1 text-xs text-slate-400">{fmtDateTime(a.created_at)} · {ago(a.created_at)}{a.acknowledged_at && ` · acknowledged by ${a.acknowledged_by}`}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {a.request_id && <Link className="btn btn-secondary btn-sm" to={`/ops/requests/${a.request_id}`}>Open</Link>}
                {!a.acknowledged_at && <button className="btn btn-ghost btn-sm" onClick={async () => { await post(`/api/v1/alerts/${a.id}/ack`); reload(); }}>Ack</button>}
              </div>
            </li>
          ))}
          {!data?.length && <li className="card p-10 text-center text-sm text-slate-500">All caught up 🎉</li>}
        </ul>
      )}
    </div>
  );
}

export function NotificationLog() {
  const { can } = useOps();
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useApi<any[]>(`/api/v1/notifications${status ? `?status=${status}` : ''}`, { poll: 15000 });
  const { busy, run } = useAction();
  return (
    <div>
      <PageHeader title="Notification log" sub="Every WhatsApp / SMS / in-app notification with delivery status (QUEUED → SENT → DELIVERED → READ, or FAILED with automatic retry)" />
      <Select className="max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED']} />
      <div className="card mt-4 overflow-x-auto">
        {loading && !data ? <PageLoader /> : (
          <table className="table-base">
            <thead><tr><th>Time</th><th>Request</th><th>Event</th><th>Recipient</th><th>Channel</th><th>Message</th><th>Status</th><th>Attempts</th><th /></tr></thead>
            <tbody>{(data || []).map((n) => (
              <tr key={n.id}>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(n.created_at)}</td>
                <td>{n.request_number ? <Link className="text-xs font-semibold text-brand-800" to={`/ops/requests/${n.request_id}`}>{n.request_number}</Link> : '—'}</td>
                <td className="text-xs">{n.template || n.event}</td>
                <td className="text-xs">{n.recipient_type}<br /><span className="text-slate-400">{n.recipient_type === 'companion' && n.channel === 'INTERNAL' ? 'in-app' : n.recipient}</span></td>
                <td className="text-xs">{n.channel}</td>
                <td className="max-w-[340px] truncate text-xs" title={n.body}>{n.body}</td>
                <td><Badge tone={n.status === 'FAILED' ? 'red' : n.status === 'READ' ? 'blue' : n.status === 'QUEUED' ? 'amber' : 'green'}>{n.status}</Badge>{n.error && <p className="max-w-[160px] truncate text-[11px] text-red-600" title={n.error}>{n.error}</p>}</td>
                <td className="text-xs">{n.attempts}</td>
                <td>{n.status === 'FAILED' && can('notification.send') && <button className="btn btn-ghost btn-sm" disabled={busy === n.id} onClick={async () => { await run(n.id, () => post(`/api/v1/notifications/${n.id}/retry`), 'Retried'); reload(); }}><FiRefreshCw /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function Conversations() {
  const { data, loading } = useApi<any[]>('/api/v1/whatsapp/conversations', { poll: 10000 });
  const [sel, setSel] = useState<string | null>(null);
  const { data: conv } = useApi<any>(sel ? `/api/v1/whatsapp/conversations/${sel}` : null, { poll: 5000 });
  return (
    <div>
      <PageHeader title="WhatsApp conversations" sub="Booking sessions mapped to phone number, customer, stage and request (FRD §9, §33)" />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="card max-h-[75vh] overflow-y-auto">
          {loading && !data && <PageLoader />}
          <ul className="divide-y divide-slate-100">
            {(data || []).map((c) => (
              <li key={c.id}>
                <button className={cx('w-full px-4 py-3 text-left hover:bg-slate-50', sel === c.id && 'bg-brand-50')} onClick={() => setSel(c.id)}>
                  <div className="flex justify-between gap-2"><p className="font-semibold">{c.customer_name || c.profile_name || c.wa_phone_number}</p><span className="text-[11px] text-slate-400">{ago(c.updated_at)}</span></div>
                  <p className="text-xs text-slate-500">{c.wa_phone_number} · step <span className="font-mono">{c.current_step}</span>{c.request_number && ` · ${c.request_number}`}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-600">{c.last_message}</p>
                  <div className="mt-1 flex gap-1"><Badge tone={c.source === 'simulator' ? 'violet' : 'green'}>{c.source}</Badge><Badge tone="gray">{c.message_count} msgs</Badge></div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card flex max-h-[75vh] flex-col">
          {!conv ? <p className="m-auto p-10 text-sm text-slate-500">Select a conversation</p> : (
            <>
              <div className="border-b border-slate-100 p-4 text-sm">
                <p className="font-bold">{conv.wa_phone_number}</p>
                <p className="text-xs text-slate-500">Session {conv.session_status} · current step {conv.current_step} · last inbound {fmtDateTime(conv.last_inbound_at)} · last outbound {fmtDateTime(conv.last_outbound_at)}</p>
              </div>
              <div className="wa-bg flex-1 space-y-2 overflow-y-auto p-4">
                {conv.messages.map((m: any) => (
                  <div key={m.id} className={cx('max-w-[80%] rounded-xl px-3 py-2 text-[13px] shadow-sm', m.direction === 'IN' ? 'ml-auto bg-[#d9fdd3]' : 'bg-white')}>
                    <p className="whitespace-pre-line">{m.msg_type === 'location' ? <><FiMapPin className="inline text-red-500" /> {m.body}</> : m.body}</p>
                    {m.payload?.buttons && <p className="mt-1 text-[11px] text-sky-700">[{m.payload.buttons.map((b: any) => b.title).join('] [')}]</p>}
                    {m.payload?.list && <p className="mt-1 text-[11px] text-sky-700">☰ {m.payload.list.rows.map((r: any) => r.title).join(' · ')}</p>}
                    <p className="mt-0.5 text-right text-[10px] text-slate-400">{fmtDateTime(m.created_at)} · {m.status} · <span className="font-mono">{m.provider_message_id?.slice(0, 16)}…</span></p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
