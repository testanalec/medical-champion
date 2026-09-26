import React, { useEffect, useState } from 'react';
import { FiCheck, FiPhone, FiShield, FiClock, FiMapPin, FiStar, FiCreditCard, FiAlertTriangle, FiFileText, FiThumbsUp, FiThumbsDown, FiSearch } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { PublicShell } from '../../components/public';
import { useApi, post } from '../../lib/api';
import { useRoute, navigate, Link } from '../../lib/router';
import { Avatar, Badge, Button, ErrorState, Field, Input, PageLoader, Textarea, cx, fmtDateTime, fmtTime, useToast, PayBadge } from '../../components/ui';
import { fmtINR, fmtDuration, URGENCY_LABEL } from '../../../shared/constants';

const STAGES: [string, string[]][] = [
  ['Received', ['NEW', 'AWAITING_CONFIRMATION']],
  ['Confirmed', ['SEARCHING_COMPANION', 'COMPANION_ASSIGNED']],
  ['Companion assigned', ['COMPANION_ACCEPTED']],
  ['On the way', ['EN_ROUTE']],
  ['With your loved one', ['WITH_PATIENT']],
  ['At hospital', ['AT_HOSPITAL']],
  ['Returning', ['RETURNING']],
  ['Completed', ['COMPLETED']],
];

export default function Track({ number }: { number: string }) {
  const { search } = useRoute();
  const t = search.get('t') || '';
  const view = search.get('view');
  const { data, error, loading, reload } = useApi<any>(`/api/v1/public/track/${number}?t=${encodeURIComponent(t)}`, { poll: 10000 });
  useEffect(() => {
    if (!data || !view) return;
    if (view === 'pay' && data.payment?.status && ['PENDING', 'CREATED', 'FAILED'].includes(data.payment.status) && data.payment.url) {
      if (data.payment.url.startsWith('http') && !data.payment.url.includes(location.host)) location.href = data.payment.url;
      else navigate(data.payment.url.replace(/^https?:\/\/[^/]+/, ''), true);
      return;
    }
    setTimeout(() => document.getElementById(view)?.scrollIntoView({ behavior: 'smooth' }), 200);
  }, [!!data, view]);

  if (loading && !data) return <PublicShell footer={false}><PageLoader /></PublicShell>;
  if (error) return <PublicShell footer={false}><ErrorState error={error} /><div className="text-center"><Link to="/track-lookup" className="btn btn-secondary">Find my request</Link></div></PublicShell>;
  const d = data;
  const stageIdx = d.status === 'CANCELLED' || d.status === 'UNFULFILLED' ? -1 : STAGES.findIndex(([, s]) => s.includes(d.status));
  const done = d.status === 'COMPLETED';
  return (
    <PublicShell footer={false}>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-200">Request {d.request_number}</p>
                <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl" data-testid="track-status">{d.status_label}</h1>
                <p className="mt-1 text-sm text-brand-100">{d.service_type} for {d.patient_ref}{d.destination ? ` · ${d.destination}` : ''}</p>
              </div>
              <Badge tone={d.status === 'COMPLETED' ? 'green' : d.status === 'CANCELLED' ? 'gray' : 'brand'} className="!bg-white/15 !text-white !ring-white/20">
                {d.urgency === 'SCHEDULED' ? `Scheduled · ${fmtDateTime(d.requested_datetime)}` : URGENCY_LABEL[d.urgency]}
              </Badge>
            </div>
          </div>
          {stageIdx >= 0 ? (
            <div className="scrollbar-thin overflow-x-auto px-4 py-5">
              <ol className="flex min-w-[640px] items-start">
                {STAGES.map(([label], i) => (
                  <li key={label} className="relative flex flex-1 flex-col items-center text-center">
                    {i > 0 && <span className={cx('absolute right-1/2 top-3.5 h-0.5 w-full', i <= stageIdx ? 'bg-brand-600' : 'bg-slate-200')} />}
                    <span className={cx('relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white',
                      i < stageIdx || done ? 'bg-brand-600 text-white' : i === stageIdx ? 'bg-coral-500 text-white' : 'bg-slate-200 text-slate-500')}>
                      {i < stageIdx || done ? <FiCheck /> : i + 1}
                    </span>
                    <span className={cx('mt-2 px-1 text-[11px] font-semibold leading-tight', i <= stageIdx ? 'text-ink' : 'text-slate-400')}>{label}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="px-6 py-4 text-sm text-slate-600">This request was {d.status.toLowerCase()}{d.cancellation_reason ? ` — ${d.cancellation_reason}` : ''}. Please call us if you still need help.</div>
          )}
          {d.human_review_required && !done && stageIdx <= 1 && (
            <div className="mx-4 mb-4 flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <FiAlertTriangle className="mt-0.5 shrink-0" />Our care team is personally reviewing this request and will call you before confirming.
            </div>
          )}
        </div>

        {d.companion && (
          <div className="card flex flex-wrap items-center gap-4 p-5">
            <Avatar name={d.companion.name} src={d.companion.photo_url} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your companion</p>
              <p className="text-lg font-bold">{d.companion.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><FiShield /> Verified</span>
                <span>ID {d.companion.code}</span>
                <span>🗣 {d.companion.languages.join(', ')}</span>
              </p>
            </div>
            {!done && !d.actual_arrival && d.eta && (
              <div className="rounded-2xl bg-brand-50 px-4 py-3 text-center">
                <p className="text-[11px] font-semibold uppercase text-brand-700">ETA</p>
                <p className="text-xl font-bold text-brand-900">{fmtTime(d.eta)}</p>
              </div>
            )}
            {d.actual_arrival && !done && <Badge tone="green">Arrived {fmtTime(d.actual_arrival)}</Badge>}
          </div>
        )}

        {done && <Summary d={d} />}
        {done && <RatingCard d={d} number={number} token={t} onDone={reload} />}

        <div className="card p-5">
          <h2 className="font-bold">Timeline</h2>
          <ol className="mt-4">
            {d.timeline.map((e: any, i: number) => (
              <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                {i < d.timeline.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-slate-200" />}
                <span className={cx('relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full ring-4', i === d.timeline.length - 1 ? 'bg-coral-500 ring-coral-100' : 'bg-brand-500 ring-brand-50')} />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{e.label}</p>
                  {e.notes && <p className="text-sm text-slate-600">{e.notes}</p>}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtDateTime(e.created_at)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-bold">Need to talk to us?</p>
            <p className="text-sm text-slate-500">Our operations team is watching this visit · {d.support.hours}</p>
          </div>
          <div className="flex gap-2">
            <a className="btn btn-primary" href={`tel:${d.support.phone}`}><FiPhone /> Call support</a>
            <Link className="btn btn-wa" to="/whatsapp"><FaWhatsapp /> WhatsApp</Link>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-slate-500">
          <FiAlertTriangle className="mr-1 inline" />Medical emergency? Call <a className="font-semibold underline" href={`tel:${d.emergency.number}`}>{d.emergency.number}</a> or <a className="font-semibold underline" href={`tel:${d.emergency.ambulance}`}>{d.emergency.ambulance}</a>.
        </p>
      </div>
    </PublicShell>
  );
}

function Summary({ d }: { d: any }) {
  const b = d.charge_breakdown || {};
  const unpaid = d.payment && ['PENDING', 'CREATED', 'FAILED'].includes(d.payment.status);
  return (
    <div id="summary" className="card scroll-mt-20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><FiFileText className="text-brand-600" /> Visit summary</h2>
        <PayBadge status={d.payment_status} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Duration</p><p className="font-bold">{fmtDuration(d.duration_minutes)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Outcome</p><p className="font-bold">{d.completion_type}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Companion</p><p className="font-bold">{d.companion?.name || '—'}</p></div>
      </div>
      <table className="mt-5 w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          <tr><td className="py-2 text-slate-600">Base fee (first {Math.round((b.included_minutes || 0) / 60)} h)</td><td className="py-2 text-right tabular-nums">{fmtINR(b.base_fee)}</td></tr>
          {b.extension_blocks > 0 && <tr><td className="py-2 text-slate-600">Extra time ({b.extension_blocks} × hour)</td><td className="py-2 text-right tabular-nums">{fmtINR(b.extension_amount)}</td></tr>}
          {b.urgent_surcharge > 0 && <tr><td className="py-2 text-slate-600">Urgent dispatch</td><td className="py-2 text-right tabular-nums">{fmtINR(b.urgent_surcharge)}</td></tr>}
          {b.tax > 0 && <tr><td className="py-2 text-slate-600">GST ({b.tax_percent}%)</td><td className="py-2 text-right tabular-nums">{fmtINR(b.tax)}</td></tr>}
          {d.expenses.map((e: any, i: number) => <tr key={i}><td className="py-2 text-slate-600">{e.category}{e.description ? ` · ${e.description}` : ''} <span className="text-xs text-slate-400">(at actuals)</span></td><td className="py-2 text-right tabular-nums">{fmtINR(e.amount)}</td></tr>)}
          <tr className="font-bold"><td className="py-3">Total</td><td className="py-3 text-right text-lg tabular-nums">{fmtINR(d.final_amount)}</td></tr>
        </tbody>
      </table>
      {unpaid && d.payment.url && (
        <a href={d.payment.url.replace(/^https?:\/\/[^/]+(?=\/pay\/)/, '')} className="btn btn-coral btn-lg mt-2 w-full" data-testid="pay-now"><FiCreditCard /> PAY NOW · {fmtINR(d.payment.amount)}</a>
      )}
      {d.payment?.status === 'PAID' && <p className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><FiCheck /> Paid {d.payment.method ? `via ${d.payment.method.toUpperCase()}` : ''} · {fmtDateTime(d.payment.paid_at)}</p>}
    </div>
  );
}

function RatingCard({ d, number, token, onDone }: { d: any; number: string; token: string; onDone: () => void }) {
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [trust, setTrust] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (d.rating) {
    return (
      <div id="rate" className="card scroll-mt-20 p-5 text-center">
        <p className="text-2xl text-amber-500">{'★'.repeat(d.rating.overall)}<span className="text-slate-200">{'★'.repeat(5 - d.rating.overall)}</span></p>
        <p className="mt-1 font-semibold">Thank you for your feedback</p>
        {d.trust_again != null && <p className="text-sm text-slate-500">{d.trust_again ? 'We’re honoured you’d trust us again.' : 'We’re sorry — our team will reach out to understand what went wrong.'}</p>}
      </div>
    );
  }
  const submit = async () => {
    if (!stars) return toast('error', 'Please choose a star rating');
    if (trust === null) return toast('error', 'Please answer the trust question');
    setBusy(true);
    try {
      await post(`/api/v1/public/track/${number}/rating?t=${encodeURIComponent(token)}`, { overall: stars, trust_again: trust, comment, reason });
      toast('success', 'Thank you for rating us');
      onDone();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <div id="rate" className="card scroll-mt-20 p-5">
      <h2 className="flex items-center gap-2 font-bold"><FiStar className="text-amber-500" /> Rate your experience</h2>
      <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Overall rating">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} role="radio" aria-checked={stars === s} onClick={() => setStars(s)} className={cx('text-4xl transition hover:scale-110', s <= stars ? 'text-amber-400' : 'text-slate-200')} data-testid={`star-${s}`}>★</button>
        ))}
      </div>
      <p className="mt-5 font-semibold">Would you trust us to help your parent again?</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <button onClick={() => setTrust(true)} className={cx('btn py-3', trust === true ? 'bg-emerald-600 text-white' : 'btn-secondary')} data-testid="trust-yes"><FiThumbsUp /> Yes</button>
        <button onClick={() => setTrust(false)} className={cx('btn py-3', trust === false ? 'bg-red-600 text-white' : 'btn-secondary')} data-testid="trust-no"><FiThumbsDown /> No</button>
      </div>
      {trust === false && <Field label="What should we have done better?" className="mt-4"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      <Field label="Anything you’d like to share? (optional)" className="mt-4"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} /></Field>
      <Button className="btn-primary mt-4 w-full" loading={busy} onClick={submit} data-testid="rate-submit">Submit feedback</Button>
    </div>
  );
}

export function TrackLookup() {
  const [rn, setRn] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <PublicShell footer={false}>
      <div className="mx-auto max-w-md px-4 py-14">
        <div className="card p-6">
          <FiSearch className="h-7 w-7 text-brand-600" />
          <h1 className="mt-3 text-xl font-bold">Track your request</h1>
          <p className="mt-1 text-sm text-slate-500">Use the link in your WhatsApp messages, or enter your request ID and the mobile number you booked with.</p>
          <form className="mt-5 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await post('/api/v1/public/track-lookup', { request_number: rn, phone });
              navigate(r.track_url);
            } catch (er: any) { toast('error', er.message); } finally { setBusy(false); }
          }}>
            <Field label="Request ID"><Input value={rn} onChange={(e) => setRn(e.target.value.toUpperCase())} placeholder="MC-10452" required /></Field>
            <Field label="Mobile number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" required /></Field>
            <Button className="btn-primary w-full" loading={busy}>Track</Button>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}
