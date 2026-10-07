import React, { useState } from 'react';
import { FiCheckCircle, FiCreditCard, FiLock, FiSmartphone, FiXCircle, FiGlobe } from 'react-icons/fi';
import { PublicShell } from '../../components/public';
import { useApi, post } from '../../lib/api';
import { useRoute, Link } from '../../lib/router';
import { Button, ErrorState, PageLoader, cx, fmtDateTime, useToast } from '../../components/ui';
import { fmtINR, fmtDuration } from '../../../shared/constants';

export default function Pay({ id }: { id: string }) {
  const { search } = useRoute();
  const t = search.get('t') || '';
  const { data, error, loading, reload } = useApi<any>(`/api/v1/public/pay/${id}?t=${encodeURIComponent(t)}`);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  if (loading && !data) return <PublicShell footer={false}><PageLoader /></PublicShell>;
  if (error) return <PublicShell footer={false}><ErrorState error={error} /></PublicShell>;
  const p = data;
  const pay = async (outcome: 'success' | 'failure') => {
    setBusy(outcome);
    try {
      const r = await post(`/api/v1/public/pay/${id}/checkout?t=${encodeURIComponent(t)}`, { method, outcome });
      if (r.status === 'PAID') toast('success', 'Payment successful');
      else if (r.status === 'FAILED') toast('error', 'Payment failed. You can try again.');
      await reload();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(null); }
  };
  const b = p.breakdown || {};
  return (
    <PublicShell footer={false} ctaBar={false}>
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="card overflow-hidden">
          <div className="bg-slate-900 px-6 py-5 text-white">
            <p className="flex items-center gap-2 text-xs text-slate-300"><FiLock /> Secure checkout · {p.provider === 'razorpay' ? 'Razorpay' : 'Payment gateway (sandbox)'}</p>
            <p className="mt-2 text-sm text-slate-300">ChampOnCall · {p.request_number}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums" data-testid="pay-amount">{fmtINR(p.amount)}</p>
            {p.duration_minutes && <p className="mt-1 text-xs text-slate-400">Companion service · {fmtDuration(p.duration_minutes)}{b.expenses ? ` · incl. ${fmtINR(b.expenses)} expenses` : ''}</p>}
          </div>
          {p.status === 'PAID' ? (
            <div className="p-8 text-center">
              <FiCheckCircle className="mx-auto h-14 w-14 text-emerald-500" />
              <p className="mt-3 text-xl font-bold" data-testid="pay-success">Payment received</p>
              <p className="mt-1 text-sm text-slate-500">{p.method?.toUpperCase()} · {fmtDateTime(p.paid_at)}</p>
              <Link to={`${p.track_url}&view=rate`} className="btn btn-primary mt-6 w-full">Rate your experience</Link>
              <Link to={`${p.track_url}&view=summary`} className="btn btn-ghost mt-2 w-full">View summary</Link>
            </div>
          ) : p.status === 'CANCELLED' ? (
            <div className="p-8 text-center"><p className="font-semibold">This payment link has been replaced.</p><Link to={p.track_url} className="btn btn-primary mt-4">Open latest summary</Link></div>
          ) : p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED' ? (
            <div className="p-8 text-center"><p className="font-semibold">This payment has been {p.status === 'REFUNDED' ? 'refunded' : 'partially refunded'}.</p></div>
          ) : p.gateway_live ? (
            <div className="p-6">
              <a href={p.link} className="btn btn-coral btn-lg w-full"><FiCreditCard /> Continue to pay {fmtINR(p.amount)}</a>
            </div>
          ) : (
            <div className="p-6">
              {p.status === 'FAILED' && <p className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"><FiXCircle /> {p.failure_reason || 'Last attempt failed'} — please try again.</p>}
              <p className="text-sm font-semibold">Pay using</p>
              <div className="mt-2 grid gap-2">
                {[['upi', 'UPI', 'GPay, PhonePe, Paytm, BHIM', <FiSmartphone key="u" />], ['card', 'Card', 'Visa, Mastercard, RuPay', <FiCreditCard key="c" />], ['netbanking', 'Netbanking', 'All major banks', <FiGlobe key="n" />]].map(([k, l, s, icon]: any) => (
                  <button key={k} onClick={() => setMethod(k)} className={cx('flex items-center gap-3 rounded-xl p-3 text-left ring-1 transition', method === k ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200 hover:bg-slate-50')}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-slate-200">{icon}</span>
                    <span><span className="block text-sm font-semibold">{l}</span><span className="text-xs text-slate-500">{s}</span></span>
                  </button>
                ))}
              </div>
              <Button className="btn-coral btn-lg mt-5 w-full" loading={busy === 'success'} onClick={() => pay('success')} data-testid="pay-submit">Pay {fmtINR(p.amount)}</Button>
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                <strong>Sandbox gateway.</strong> No money moves. Payment status is confirmed through a signed server-side webhook, exactly as with Razorpay in production.
                <button className="mt-1 block font-semibold underline" disabled={!!busy} onClick={() => pay('failure')}>Simulate a failed payment</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
