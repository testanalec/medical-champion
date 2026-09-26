import React, { useState } from 'react';
import { FiDownload, FiFileText, FiExternalLink } from 'react-icons/fi';
import { post, useApi } from '../../lib/api';
import { Link } from '../../lib/router';
import { Badge, PageHeader, PageLoader, Stat, Tabs, fmtDateTime, useAction, PayBadge, Select } from '../../components/ui';
import { useOps } from './OpsApp';
import { fmtINR } from '../../../shared/constants';

export function Payments() {
  const { can } = useOps();
  const [status, setStatus] = useState('');
  const { data, loading } = useApi<any[]>(`/api/v1/payments${status ? `?status=${status}` : ''}`, { poll: 15000 });
  const rows = data || [];
  const sum = (s: string[]) => rows.filter((p) => s.includes(p.status)).reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount || 0), 0);
  return (
    <div>
      <PageHeader title="Payments" sub="Gateway status is confirmed server-side via signed webhooks" actions={can('report.export') && <a className="btn btn-secondary btn-sm" href="/api/v1/reports/export?type=payments"><FiDownload /> Export CSV</a>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Collected" value={fmtINR(sum(['PAID', 'PARTIALLY_REFUNDED']))} tone="good" />
        <Stat label="Outstanding" value={fmtINR(sum(['PENDING', 'CREATED']))} tone="warn" />
        <Stat label="Failed" value={rows.filter((p) => p.status === 'FAILED').length} tone={rows.some((p) => p.status === 'FAILED') ? 'bad' : undefined} />
        <Stat label="Refunded" value={fmtINR(rows.reduce((a, p) => a + Number(p.refunded_amount || 0), 0))} />
      </div>
      <Select className="mt-4 max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']} />
      <div className="card mt-4 overflow-x-auto">
        {loading && !data ? <PageLoader /> : (
          <table className="table-base">
            <thead><tr><th>Request</th><th>Customer</th><th>Amount</th><th>Status</th><th>Provider</th><th>Method</th><th>Reference</th><th>Refunded</th><th>Created</th><th>Paid</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/ops/requests/${p.request_id}`} className="font-semibold text-brand-800">{p.request_number}</Link></td>
                <td>{p.customer_name}</td><td className="tabular-nums font-semibold">{fmtINR(p.amount)}</td><td><PayBadge status={p.status} />{p.failure_reason && <p className="text-[11px] text-red-600">{p.failure_reason}</p>}</td>
                <td className="text-xs">{p.provider}</td><td className="text-xs">{p.method || '—'}</td><td className="font-mono text-[11px]">{p.provider_payment_id || '—'}</td>
                <td className="tabular-nums">{Number(p.refunded_amount) ? fmtINR(p.refunded_amount) : '—'}</td><td className="text-xs">{fmtDateTime(p.created_at)}</td><td className="text-xs">{fmtDateTime(p.paid_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function Expenses() {
  const { can } = useOps();
  const [tab, setTab] = useState('PENDING');
  const { data, loading, reload } = useApi<any[]>(`/api/v1/expenses${tab ? `?status=${tab}` : ''}`, { poll: 15000 });
  const { busy, run } = useAction();
  const review = async (id: string, decision: string) => {
    const note = decision === 'REJECTED' ? prompt('Reason for rejection?') : null;
    if (decision === 'REJECTED' && note === null) return;
    if (await run(id, () => post(`/api/v1/expenses/${id}/review`, { decision, note }), `Expense ${decision.toLowerCase()}`)) reload();
  };
  return (
    <div>
      <PageHeader title="Expenses" sub="Third-party costs recorded by companions and operations, with receipts" />
      <Tabs tabs={[{ id: 'PENDING', label: 'Pending approval' }, { id: 'APPROVED', label: 'Approved' }, { id: 'REJECTED', label: 'Rejected' }, { id: '', label: 'All' }]} value={tab} onChange={setTab} />
      <div className="card mt-4 overflow-x-auto">
        {loading && !data ? <PageLoader /> : (
          <table className="table-base">
            <thead><tr><th>Request</th><th>Category</th><th>Amount</th><th>Description</th><th>Receipt</th><th>Submitted by</th><th>Billing</th><th>Status</th><th /></tr></thead>
            <tbody>{(data || []).map((e) => (
              <tr key={e.id}>
                <td><Link to={`/ops/requests/${e.request_id}`} className="font-semibold text-brand-800">{e.request_number}</Link><p className="text-[11px] text-slate-500">payment {e.payment_status.toLowerCase()}</p></td>
                <td>{e.category}</td><td className="font-semibold tabular-nums">{fmtINR(e.amount)}</td><td className="max-w-[220px] text-xs">{e.description}</td>
                <td>{e.receipt_file_id ? <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`/api/v1/files/${e.receipt_file_id}`}><FiFileText /> View</a> : <span className="text-xs text-amber-700">No receipt</span>}</td>
                <td className="text-xs">{e.submitted_by_name}<br />{fmtDateTime(e.created_at)}</td>
                <td><Badge tone={e.bill_to_customer ? 'blue' : 'gray'}>{e.bill_to_customer ? 'Billable' : 'Absorbed'}</Badge></td>
                <td><Badge tone={e.approval_status === 'APPROVED' ? 'green' : e.approval_status === 'REJECTED' ? 'red' : 'amber'}>{e.approval_status}</Badge>{e.reviewed_by && <p className="text-[11px] text-slate-500">{e.reviewed_by}</p>}</td>
                <td className="whitespace-nowrap">{can('expense.approve') && e.approval_status === 'PENDING' && <>
                  <button className="btn btn-ghost btn-sm text-emerald-700" disabled={busy === e.id} onClick={() => review(e.id, 'APPROVED')}>Approve</button>
                  <button className="btn btn-ghost btn-sm text-red-700" disabled={busy === e.id} onClick={() => review(e.id, 'REJECTED')}>Reject</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {data && !data.length && <p className="p-8 text-center text-sm text-slate-500">Nothing here.</p>}
      </div>
    </div>
  );
}
