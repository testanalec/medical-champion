import React, { useState } from 'react';
import { FiDownload, FiTarget, FiHeart } from 'react-icons/fi';
import { useApi } from '../../lib/api';
import { BarChart, HBars, Input, PageHeader, PageLoader, Section, Stat, cx, pct, ErrorState } from '../../components/ui';
import { useOps } from './OpsApp';
import { fmtINR, fmtDuration } from '../../../shared/constants';

const iso = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);

export default function Reports() {
  const { can } = useOps();
  const [range, setRange] = useState({ from: iso(new Date(Date.now() - 29 * 86400000)), to: iso(new Date()) });
  const { data: r, loading, error } = useApi<any>(`/api/v1/reports/summary?from=${range.from}&to=${range.to}`);
  const preset = (days: number) => setRange({ from: iso(new Date(Date.now() - (days - 1) * 86400000)), to: iso(new Date()) });
  if (error) return <ErrorState error={error} />;
  return (
    <div>
      <PageHeader title="Reports" sub="Demand, operations, unit economics and customer trust"
        actions={<div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => <button key={d} className="btn btn-secondary btn-sm" onClick={() => preset(d)}>{d}d</button>)}
          <Input type="date" className="!w-auto !py-1.5" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <Input type="date" className="!w-auto !py-1.5" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          {can('report.export') && <a className="btn btn-secondary btn-sm" href={`/api/v1/reports/export?type=requests&from=${range.from}&to=${range.to}`}><FiDownload /> CSV</a>}
        </div>} />
      {loading || !r ? <PageLoader /> : (
        <div className="space-y-5">
          {/* North-star metrics (FRD §44) */}
          <div className="grid gap-4 md:grid-cols-2">
            <NorthStar icon={<FiTarget />} title="Urgent requests reached within SLA" value={pct(r.north_star.sla_hit_rate)} good={(r.north_star.sla_hit_rate ?? 0) >= 0.85}
              sub={`${r.north_star.sla_hits} of ${r.north_star.sla_base} accepted urgent requests reached within ${r.north_star.arrival_target_minutes} min`} />
            <NorthStar icon={<FiHeart />} title="“Would you trust us to help your parent again?” — Yes" value={pct(r.north_star.trust_again_rate)} good={(r.north_star.trust_again_rate ?? 0) >= 0.9}
              sub={`${r.north_star.trust_yes} of ${r.north_star.trust_base} responses`} />
          </div>

          <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-slate-500">Demand</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Requests" value={r.demand.total} />
            <Stat label="Requests / day" value={r.demand.per_day_avg.toFixed(1)} />
            <Stat label="Urgent" value={r.demand.urgent} sub={pct(r.demand.total ? r.demand.urgent / r.demand.total : null)} />
            <Stat label="Scheduled / later" value={r.demand.scheduled} sub={pct(r.demand.total ? r.demand.scheduled / r.demand.total : null)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Requests per day">
              <BarChart data={r.demand.by_day.map((d: any) => ({ label: d.date.slice(8), value: d.n, title: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))} labelEvery={Math.ceil(r.demand.by_day.length / 10)} />
              <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">View as table</summary>
                <table className="mt-2 w-full"><tbody>{r.demand.by_day.map((d: any) => <tr key={d.date}><td>{d.date}</td><td className="text-right">{d.n}</td></tr>)}</tbody></table></details>
            </Section>
            <Section title="Requests by hour of day (IST)">
              <BarChart data={r.demand.by_hour.map((n: number, h: number) => ({ label: String(h), value: n, title: `${h}:00–${h + 1}:00` }))} labelEvery={3} />
            </Section>
            <Section title="By service type"><HBars data={r.demand.by_type} /></Section>
            <Section title="By pickup location"><HBars data={r.demand.by_location} /></Section>
          </div>

          <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-slate-500">Operations</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Median dispatch time" value={r.operations.median_dispatch_minutes != null ? `${Math.round(r.operations.median_dispatch_minutes)} min` : '—'} sub="request → assignment" />
            <Stat label="Median arrival (urgent)" value={r.operations.median_arrival_minutes != null ? `${Math.round(r.operations.median_arrival_minutes)} min` : '—'} sub="request → arrival" />
            <Stat label="Fulfilment rate" value={pct(r.operations.fulfilment_rate)} sub={`${r.operations.completed} completed · ${r.operations.cancelled} cancelled · ${r.operations.unfulfilled} unfulfilled`} />
            <Stat label="Companion acceptance" value={pct(r.operations.acceptance_rate)} sub={`${r.operations.offers} offers`} />
            <Stat label="Median service duration" value={fmtDuration(r.operations.median_duration_minutes != null ? Math.round(r.operations.median_duration_minutes) : null)} />
            <Stat label="Incidents" value={r.operations.incidents} sub={Object.entries(r.operations.incidents_by_severity).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ') || 'none'} tone={r.operations.incidents ? 'warn' : 'good'} />
          </div>

          <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-slate-500">Economics</h2>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Collected" value={fmtINR(Math.round(r.economics.collected))} tone="good" />
              <Stat label="Avg order value" value={fmtINR(r.economics.avg_order_value != null ? Math.round(r.economics.avg_order_value) : null)} />
              <Stat label="Contribution margin" value={fmtINR(Math.round(r.economics.contribution_margin))} tone={r.economics.contribution_margin >= 0 ? 'good' : 'bad'} sub={`${fmtINR(r.economics.contribution_per_job != null ? Math.round(r.economics.contribution_per_job) : null)} per completed job`} />
              <Stat label="Outstanding" value={fmtINR(Math.round(r.economics.outstanding))} tone={r.economics.outstanding ? 'warn' : undefined} />
            </div>
            <Section title="Unit economics (completed services)">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <Row l="Service revenue (ex-GST)" v={r.economics.service_revenue_ex_tax} />
                  <Row l="– Companion payouts (est.)" v={-r.economics.companion_payout} />
                  <Row l="– Absorbed expenses" v={-r.economics.absorbed_expenses} />
                  <Row l="– Gateway fees (2%)" v={-r.economics.gateway_fees} />
                  <Row l="Contribution margin" v={r.economics.contribution_margin} bold />
                  <Row l="Pass-through expenses billed (transport, parking…)" v={r.economics.billable_expenses} muted />
                  <Row l="GST collected" v={r.economics.tax_collected} muted />
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-400">Payout model configurable in Settings → Payout.</p>
            </Section>
          </div>

          <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-slate-500">Customer</h2>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Customers" value={r.customer.customers} />
              <Stat label="Repeat rate" value={pct(r.customer.repeat_rate)} sub="≥ 2 requests" />
              <Stat label="Referral rate" value={pct(r.customer.referral_rate)} sub="source = referral" />
              <Stat label="Average rating" value={r.customer.avg_rating ? `★ ${r.customer.avg_rating.toFixed(2)}` : '—'} sub={`${r.customer.ratings} ratings`} />
            </div>
            <Section title="Rating distribution">
              <BarChart height={140} data={r.customer.rating_distribution.map((n: number, i: number) => ({ label: `${i + 1}★`, value: n, title: `${i + 1} star` }))} />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ l, v, bold, muted }: { l: string; v: number; bold?: boolean; muted?: boolean }) {
  return <tr className={cx(bold && 'font-bold', muted && 'text-slate-400')}><td className="py-2">{l}</td><td className={cx('py-2 text-right tabular-nums', v < 0 && 'text-red-700')}>{fmtINR(Math.round(v))}</td></tr>;
}

function NorthStar({ icon, title, value, sub, good }: { icon: React.ReactNode; title: string; value: string; sub: string; good: boolean }) {
  return (
    <div className="card relative overflow-hidden p-6">
      <div className={cx('absolute right-0 top-0 h-full w-1.5', good ? 'bg-emerald-500' : 'bg-amber-500')} />
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">{icon} North-star metric</p>
      <p className="mt-2 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-2 font-display text-5xl font-semibold tracking-tight text-brand-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
    </div>
  );
}
