import React, { useEffect, useRef, useState } from 'react';
import {
  FiHome, FiClock, FiUser, FiPhone, FiNavigation, FiMapPin, FiCheck, FiX, FiCamera, FiAlertTriangle, FiMessageSquare, FiChevronRight,
  FiLogOut, FiWifiOff, FiShield, FiPlay, FiFlag, FiArrowLeft, FiBell, FiStar,
} from 'react-icons/fi';
import { ApiError, compressImage, fileToPayload, get, post, uid } from '../../lib/api';
import { useRoute, match, navigate, Link } from '../../lib/router';
import { Badge, Button, Countdown, Elapsed, Field, Input, Modal, PageLoader, Select, Textarea, cx, fmtDateTime, fmtTime, useToast, Logo } from '../../components/ui';
import { MOBILITY_LABEL, STATUS_LABEL, fmtDuration, fmtINR, URGENCY_LABEL } from '../../../shared/constants';

// ---------------------------------------------------------------- offline-tolerant action queue (FRD §46)
type Queued = { id: string; url: string; body: any; label: string; at: number };
const QKEY = 'mc_cmp_queue';
const readQ = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const writeQ = (q: Queued[]) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* storage unavailable */ } window.dispatchEvent(new Event('mc:queue')); };

async function sendAction(url: string, body: any, label: string): Promise<'sent' | 'queued'> {
  const payload = { ...body, idempotency_key: body.idempotency_key || uid() };
  try {
    await post(url, payload);
    return 'sent';
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 0) {
      writeQ([...readQ(), { id: payload.idempotency_key, url, body: payload, label, at: Date.now() }]);
      return 'queued';
    }
    throw e;
  }
}
async function flushQueue(onError?: (m: string) => void) {
  const q = readQ();
  if (!q.length || !navigator.onLine) return;
  const remaining: Queued[] = [];
  for (const item of q) {
    try { await post(item.url, item.body); } catch (e: any) {
      if (e instanceof ApiError && e.status === 0) remaining.push(item);
      else onError?.(`“${item.label}” could not be synced: ${e.message}`);
    }
  }
  writeQ(remaining);
}
function useQueue() {
  const [n, setN] = useState(readQ().length);
  useEffect(() => {
    const on = () => setN(readQ().length);
    window.addEventListener('mc:queue', on);
    return () => window.removeEventListener('mc:queue', on);
  }, []);
  return n;
}
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 5000, maximumAge: 60000 });
  });
}

// ---------------------------------------------------------------- app shell
export default function CompanionApp() {
  const { path } = useRoute();
  const toast = useToast();
  const [home, setHome] = useState<any>(undefined);
  const [online, setOnline] = useState(navigator.onLine);
  const pending = useQueue();
  const load = async () => {
    try { setHome(await get('/api/v1/companion/home')); }
    catch (e: any) { if (e.status === 401) setHome(null); else if (home === undefined) setHome(null); }
  };
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') { flushQueue((m) => toast('error', m)).then(load); } }, 6000);
    const on = () => { setOnline(navigator.onLine); if (navigator.onLine) flushQueue((m) => toast('error', m)).then(load); };
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => { clearInterval(id); window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);
  // New offer alert (vibration + sound)
  const offerIds = useRef<string>('');
  useEffect(() => {
    const ids = (home?.offers || []).map((o: any) => o.assignment_id).join(',');
    if (ids && ids !== offerIds.current && offerIds.current !== undefined) {
      try { navigator.vibrate?.([300, 150, 300]); const ctx = new AudioContext(); const o = ctx.createOscillator(); o.frequency.value = 740; o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25); } catch { /* ignore */ }
    }
    offerIds.current = ids;
  }, [home?.offers?.length]);

  if (home === undefined) return <PageLoader />;
  if (home === null) return <Login onDone={load} />;
  let m: any;
  const page = (m = match('/companion/job/:id', path)) ? <Job id={m.id} home={home} reloadHome={load} />
    : path === '/companion/history' ? <History />
    : path === '/companion/profile' ? <Profile home={home} />
    : <Home home={home} reload={load} />;
  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50 pb-24">
      {(!online || pending > 0) && (
        <div className={cx('sticky top-0 z-30 flex items-center gap-2 px-4 py-2 text-xs font-semibold', online ? 'bg-amber-100 text-amber-900' : 'bg-slate-900 text-white')}>
          <FiWifiOff /> {online ? `Syncing ${pending} update${pending > 1 ? 's' : ''}…` : `Offline — ${pending ? `${pending} update(s) saved, will sync automatically` : 'updates will be saved and synced'}`}
        </div>
      )}
      {page}
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-md grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {[['/companion', 'Home', <FiHome key="h" />], ['/companion/history', 'History', <FiClock key="c" />], ['/companion/profile', 'Profile', <FiUser key="u" />]].map(([to, l, icon]: any) => (
          <Link key={to} to={to} className={cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', (to === '/companion' ? path === '/companion' || path.startsWith('/companion/job') : path.startsWith(to)) ? 'text-brand-700' : 'text-slate-400')}>
            <span className="text-xl">{icon}</span>{l}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [demo, setDemo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try { const r = await post('/api/v1/companion/auth/otp', { phone }); setDemo(r.demo_code); setStep('code'); toast('info', r.message || 'OTP sent'); }
    catch (er: any) { toast('error', er.message); } finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await post('/api/v1/companion/auth/verify', { phone, code }); navigate('/companion', true); onDone(); }
    catch (er: any) { toast('error', er.message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-gradient-to-b from-brand-800 to-brand-950 px-6 pt-16 text-white">
      <Logo light />
      <h1 className="mt-12 font-display text-3xl font-semibold">Companion app</h1>
      <p className="mt-2 text-brand-100">Sign in with your registered mobile number.</p>
      <div className="mt-8 rounded-3xl bg-white p-6 text-ink shadow-lift">
        {step === 'phone' ? (
          <form onSubmit={send}>
            <Field label="Mobile number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="70000 00101" autoFocus data-testid="cmp-phone" /></Field>
            <Button className="btn-primary mt-4 w-full py-3" loading={busy} data-testid="cmp-send-otp">Send OTP</Button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="text-sm text-slate-600">{demo ? `Enter the 6-digit code for ${phone}` : `Enter the 6-digit code we sent on WhatsApp to ${phone}`}</p>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="mt-3 text-center text-2xl tracking-[.5em]" autoFocus data-testid="cmp-otp" />
            {demo && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-900">Demo mode – your OTP is <strong className="font-mono text-base" data-testid="cmp-demo-otp">{demo}</strong></p>}
            <Button className="btn-primary mt-4 w-full py-3" loading={busy} data-testid="cmp-verify">Verify & sign in</Button>
            <button type="button" className="btn btn-ghost mt-2 w-full" onClick={() => setStep('phone')}>Change number</button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-brand-200">Demo: use 70000 00101 (Amit Kumar). <Link to="/" className="underline">Website</Link></p>
    </div>
  );
}

// ---------------------------------------------------------------- home
function Home({ home, reload }: { home: any; reload: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [decline, setDecline] = useState<any>(null);
  const me = home.me;
  const setAvail = async (a: string) => {
    setBusy('av');
    try {
      const pos = a === 'AVAILABLE' ? await getPosition() : null;
      await post('/api/v1/companion/availability', { availability: a, ...(pos || {}) });
      reload();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(null); }
  };
  const accept = async (o: any) => {
    setBusy(o.assignment_id);
    try { await post(`/api/v1/assignments/${o.assignment_id}/accept`, { idempotency_key: uid() }); toast('success', 'Job accepted'); await reload(); navigate(`/companion/job/${o.job.id}`); }
    catch (e: any) { toast('error', e.message); reload(); } finally { setBusy(null); }
  };
  return (
    <div>
      <header className="bg-gradient-to-br from-brand-700 to-brand-900 px-5 pb-6 pt-6 text-white">
        <div className="flex items-center justify-between">
          <div><p className="text-xs text-brand-200">{me.code} · {me.zone}</p><h1 className="text-xl font-bold">Namaste, {me.name.split(' ')[0]} 👋</h1></div>
          <a href={`tel:${home.ops_phone}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15"><FiPhone /></a>
        </div>
        <div className="mt-5 rounded-2xl bg-white/10 p-1 ring-1 ring-white/15">
          {me.availability === 'BUSY' ? (
            <p className="py-2.5 text-center text-sm font-semibold">🟦 On a job — you’re marked BUSY</p>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {['AVAILABLE', 'OFFLINE'].map((a) => (
                <button key={a} disabled={busy === 'av' || !me.verification_complete} onClick={() => me.availability !== a && setAvail(a)} data-testid={`avail-${a}`}
                  className={cx('rounded-xl py-2.5 text-sm font-bold transition', me.availability === a ? (a === 'AVAILABLE' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800') : 'text-white/70')}>
                  {a === 'AVAILABLE' ? '● Available' : 'Offline'}
                </button>
              ))}
            </div>
          )}
        </div>
        {!me.verification_complete && <p className="mt-3 rounded-xl bg-amber-400/20 p-2.5 text-xs">Your verification/onboarding isn’t complete yet. Operations will activate you once done.</p>}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/10 py-2"><p className="text-lg font-bold">{home.stats.today}</p><p className="text-[10px] text-brand-200">Today</p></div>
          <div className="rounded-xl bg-white/10 py-2"><p className="text-lg font-bold">{home.stats.completed}</p><p className="text-[10px] text-brand-200">All jobs</p></div>
          <div className="rounded-xl bg-white/10 py-2"><p className="text-lg font-bold">{home.stats.rating ? `★ ${home.stats.rating}` : '—'}</p><p className="text-[10px] text-brand-200">Rating</p></div>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {home.offers.map((o: any) => (
          <div key={o.assignment_id} className="fade-up overflow-hidden rounded-3xl bg-white shadow-lift ring-2 ring-coral-500" data-testid="offer-card">
            <div className="flex items-center justify-between bg-coral-500 px-4 py-2.5 text-white">
              <p className="flex items-center gap-2 font-bold"><FiBell /> New Job</p>
              <p className="text-sm font-semibold">Respond in <Countdown to={o.expires_at} onDone={reload} /></p>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between"><p className="text-lg font-bold">{o.job.service_type}</p><Badge tone={o.job.urgency === 'ASAP' || o.job.urgency === 'WITHIN_2_HOURS' ? 'coral' : 'blue'}>{URGENCY_LABEL[o.job.urgency]}</Badge></div>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><FiMapPin className="shrink-0 text-brand-600" /> {o.job.pickup_area}{o.distance_km != null && ` · ${Math.round(o.distance_km * 10) / 10} km · ~${o.eta_minutes} min`}</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><FiFlag className="shrink-0 text-brand-600" /> {o.job.destination}</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><FiClock className="shrink-0 text-brand-600" /> {fmtDateTime(o.job.requested_datetime)} · {MOBILITY_LABEL[o.job.mobility]}</p>
              <p className="mt-2 text-[11px] text-slate-400">Full address and patient details appear after you accept.</p>
              <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
                <button className="btn btn-secondary py-3" onClick={() => setDecline(o)} data-testid="decline-btn">DECLINE</button>
                <Button className="btn-primary py-3 text-base" loading={busy === o.assignment_id} onClick={() => accept(o)} data-testid="accept-btn"><FiCheck /> ACCEPT</Button>
              </div>
            </div>
          </div>
        ))}

        {home.active_job ? (
          <Link to={`/companion/job/${home.active_job.id}`} className="block rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-200" data-testid="active-job">
            <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Active job</p><Badge tone="brand">{STATUS_LABEL[home.active_job.status]}</Badge></div>
            <p className="mt-2 text-lg font-bold">{home.active_job.patient_name || 'Patient'} <span className="text-sm font-normal text-slate-500">{home.active_job.patient_age ? `${home.active_job.patient_age} yrs` : ''}</span></p>
            <p className="text-sm text-slate-600">{home.active_job.request_number} · {home.active_job.service_type}</p>
            {home.active_job.service_start_time && <p className="mt-2 text-sm">Service time <Elapsed from={home.active_job.service_start_time} className="font-bold text-brand-800" /></p>}
            <p className="mt-3 flex items-center justify-end text-sm font-semibold text-brand-700">Open job <FiChevronRight /></p>
          </Link>
        ) : !home.offers.length && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-soft ring-1 ring-slate-200">
            <p className="text-4xl">{me.availability === 'AVAILABLE' ? '🟢' : '😴'}</p>
            <p className="mt-2 font-semibold">{me.availability === 'AVAILABLE' ? 'You’re available. New jobs will appear here.' : 'You’re offline.'}</p>
            <p className="mt-1 text-sm text-slate-500">{me.availability === 'AVAILABLE' ? 'Keep this app open — we’ll buzz when Operations offers you a job.' : 'Go available when you’re ready to take jobs.'}</p>
          </div>
        )}

        {home.alerts.length > 0 && (
          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Recent</p>
            <ul className="mt-2 divide-y divide-slate-100">{home.alerts.map((a: any) => <li key={a.id} className="py-2 text-sm"><span className="font-semibold">{a.title}</span> <span className="text-slate-500">{a.body}</span><p className="text-[11px] text-slate-400">{fmtDateTime(a.created_at)}</p></li>)}</ul>
          </div>
        )}
      </div>
      {decline && <DeclineModal o={decline} onClose={() => setDecline(null)} onDone={() => { setDecline(null); reload(); }} />}
    </div>
  );
}

function DeclineModal({ o, onClose, onDone }: { o: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal open onClose={onClose} title="Decline this job?" footer={<Button className="btn-danger" loading={busy} onClick={async () => {
      setBusy(true);
      try { await post(`/api/v1/assignments/${o.assignment_id}/decline`, { reason, idempotency_key: uid() }); toast('info', 'Declined – Operations notified'); onDone(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
    }}>Decline</Button>}>
      <div className="grid gap-2">{['Too far', 'Not available at that time', 'Unwell', 'Other job running late', 'Other'].map((r) => <button key={r} onClick={() => setReason(r)} className={cx('rounded-xl p-3 text-left text-sm ring-1', reason === r ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200')}>{r}</button>)}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------- job flow (FRD §16)
function Job({ id, home, reloadHome }: { id: string; home: any; reloadHome: () => void }) {
  const toast = useToast();
  const [j, setJ] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<string[]>([]);
  const load = () => get(`/api/v1/companion/jobs/${id}`).then((d) => { setJ(d); setOptimistic([]); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === 'visible' && load(), 8000); return () => clearInterval(t); }, [id]);
  if (err && !j) return <p className="p-10 text-center text-sm text-slate-500">{err}</p>;
  if (!j) return <PageLoader />;
  const done = new Set([...j.done, ...optimistic]);
  const doEvent = async (type: string, label: string, extra: any = {}) => {
    setBusy(type);
    try {
      const pos = ['reached_parent', 'reached_hospital', 'companion_dispatched'].includes(type) ? await getPosition() : null;
      const res = await sendAction(`/api/v1/companion/jobs/${id}/event`, { event_type: type, ...(pos || {}), ...extra }, label);
      if (res === 'queued') { toast('info', `Saved offline: ${label}. Will sync when back online.`); setOptimistic((x) => [...x, type]); }
      else { toast('success', label); await load(); reloadHome(); }
      return true;
    } catch (e: any) { toast('error', e.message); return false; } finally { setBusy(null); }
  };
  const s = j.status;
  // Primary next action for the recommended companion flow
  let primary: { type: string; label: string; icon: React.ReactNode; onClick?: () => void } | null = null;
  if (s === 'COMPANION_ACCEPTED') primary = { type: 'companion_dispatched', label: 'START NAVIGATION', icon: <FiNavigation />, onClick: () => { window.open(j.pickup_nav, '_blank'); doEvent('companion_dispatched', 'On the way'); } };
  else if (s === 'EN_ROUTE') primary = { type: 'reached_parent', label: 'ARRIVED', icon: <FiMapPin /> };
  else if (s === 'WITH_PATIENT' && !j.verified && !done.has('patient_verified')) primary = { type: 'patient_verified', label: 'VERIFY PATIENT', icon: <FiShield />, onClick: () => setModal('verify') };
  else if (s === 'WITH_PATIENT' && !j.service_start_time && !done.has('service_started')) primary = { type: 'service_started', label: 'START SERVICE', icon: <FiPlay /> };
  else if (s === 'WITH_PATIENT' && !done.has('leaving_for_hospital')) primary = { type: 'leaving_for_hospital', label: 'LEAVING HOME', icon: <FiHome /> };
  else if (s === 'WITH_PATIENT') primary = { type: 'reached_hospital', label: 'REACHED HOSPITAL', icon: <FiFlag /> };
  else if (s === 'RETURNING' && !done.has('parent_home')) primary = { type: 'parent_home', label: 'PARENT HOME', icon: <FiHome /> };
  else if (s === 'RETURNING' && !done.has('handover_completed')) primary = { type: 'handover_completed', label: 'HANDOVER DONE', icon: <FiCheck /> };
  const activities = j.next_events.filter((e: any) => ['registration_completed', 'consultation_underway', 'tests', 'pharmacy', 'admission_underway'].includes(e.type));
  const terminal = ['COMPLETED', 'CANCELLED', 'UNFULFILLED'].includes(s);
  return (
    <div>
      <header className="sticky top-0 z-10 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/companion')} className="btn btn-ghost p-2"><FiArrowLeft /></button>
          <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{j.request_number} · {j.service_type}</p><p className="font-bold">{STATUS_LABEL[s]}</p></div>
          <a href={`tel:${j.ops_phone}`} className="btn btn-secondary btn-sm"><FiPhone /> Ops</a>
        </div>
        {j.service_start_time && !j.service_end_time && <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm"><span className="font-semibold text-brand-800">Service timer</span><Elapsed from={j.service_start_time} className="font-mono text-lg font-bold text-brand-900" /></div>}
      </header>

      <div className="space-y-3 p-4">
        {!terminal && primary && (
          <Button className="btn-primary w-full rounded-2xl py-5 text-lg shadow-lift" loading={busy === primary.type} onClick={primary.onClick || (() => doEvent(primary!.type, primary!.label))} data-testid="primary-action">
            {primary.icon} {primary.label}
          </Button>
        )}
        {!terminal && s === 'AT_HOSPITAL' && (
          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Service activities</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {activities.map((e: any) => <Button key={e.type} className={cx('btn-secondary py-3 text-[13px]', done.has(e.type) && '!bg-emerald-50 !text-emerald-800 !ring-emerald-200')} loading={busy === e.type} onClick={() => doEvent(e.type, e.label)} data-testid={`act-${e.type}`}>{done.has(e.type) && <FiCheck />}{e.label}</Button>)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="btn-primary py-3.5" loading={busy === 'returning_home'} onClick={() => doEvent('returning_home', 'Returning home')} data-testid="act-returning">RETURNING HOME</Button>
              <Button className="btn-secondary py-3.5" loading={busy === 'handover_completed'} disabled={done.has('handover_completed')} onClick={() => doEvent('handover_completed', 'Handover completed')}>{done.has('handover_completed') ? <><FiCheck /> Handed over</> : 'ADMITTED → HANDOVER'}</Button>
            </div>
          </div>
        )}
        {!terminal && j.can_complete && (
          <Button className="w-full rounded-2xl bg-emerald-600 py-4 text-base text-white hover:bg-emerald-700" onClick={() => setModal('complete')} data-testid="complete-btn"><FiCheck /> COMPLETE JOB</Button>
        )}
        {terminal && (
          <div className="rounded-3xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200">
            <p className="text-3xl">✅</p><p className="mt-1 font-bold text-emerald-900">Job {s.toLowerCase()}</p>
            {j.duration_minutes && <p className="text-sm text-emerald-800">{fmtDuration(j.duration_minutes)} · {j.completion_type}</p>}
          </div>
        )}

        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-lg font-bold">{j.patient_name || 'Patient'} <span className="text-sm font-normal text-slate-500">{[j.patient_age && `${j.patient_age} yrs`, j.patient_gender, j.relationship].filter(Boolean).join(' · ')}</span></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={j.mobility === 'BEDRIDDEN' ? 'red' : j.mobility === 'NEEDS_ASSISTANCE' ? 'amber' : 'green'}>{MOBILITY_LABEL[j.mobility]}</Badge>
            {j.patient_language && <Badge tone="blue">🗣 {j.patient_language}</Badge>}
            <Badge tone="gray">{URGENCY_LABEL[j.urgency]} · {fmtTime(j.requested_datetime)}</Badge>
          </div>
          {j.special_instructions && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">📝 {j.special_instructions}</p>}
          <div className="mt-4 space-y-3">
            <a href={j.pickup_nav} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white"><FiMapPin /></span>
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase text-slate-500">Pickup</span><span className="text-sm">{j.pickup_address}</span></span>
              <FiNavigation className="text-brand-700" />
            </a>
            <a href={j.destination_nav || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-500 text-white"><FiFlag /></span>
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase text-slate-500">Destination</span><span className="text-sm">{j.destination}</span></span>
              {j.destination_nav && <FiNavigation className="text-brand-700" />}
            </a>
          </div>
        </div>

        {!terminal && (
          <div className="grid grid-cols-3 gap-2">
            <button className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-xs font-semibold ring-1 ring-slate-200" onClick={() => setModal('expense')} data-testid="add-expense"><FiCamera className="text-lg text-brand-700" /> Expense</button>
            <button className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-xs font-semibold ring-1 ring-slate-200" onClick={() => setModal('note')}><FiMessageSquare className="text-lg text-brand-700" /> Note</button>
            <button className="flex flex-col items-center gap-1 rounded-2xl bg-red-50 py-3 text-xs font-semibold text-red-700 ring-1 ring-red-200" onClick={() => setModal('incident')} data-testid="report-incident"><FiAlertTriangle className="text-lg" /> Incident / SOS</button>
          </div>
        )}

        {j.expenses.length > 0 && (
          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">My expenses</p>
            <ul className="mt-2 divide-y divide-slate-100">{j.expenses.map((e: any) => <li key={e.id} className="flex items-center justify-between py-2 text-sm"><span>{e.category}{e.receipt_file_id && ' 🧾'}<span className="block text-xs text-slate-500">{e.description}</span></span><span className="text-right font-semibold">{fmtINR(e.amount)}<Badge tone={e.approval_status === 'APPROVED' ? 'green' : e.approval_status === 'REJECTED' ? 'red' : 'amber'} className="ml-2">{e.approval_status}</Badge></span></li>)}</ul>
          </div>
        )}

        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Timeline</p>
          <ol className="mt-3">
            {j.events.map((e: any, i: number) => (
              <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < j.events.length - 1 && <span className="absolute left-[4px] top-3 h-full w-px bg-slate-200" />}
                <span className="relative mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-brand-500" />
                <div className="flex-1 text-sm"><span className="font-medium">{e.label}</span>{e.notes && <span className="block text-xs text-slate-500">{e.notes}</span>}</div>
                <span className="text-[11px] text-slate-400">{fmtTime(e.created_at)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {modal === 'verify' && <VerifyModal onClose={() => setModal(null)} opsPhone={j.ops_phone} onSubmit={async (v) => { if (await doEvent('patient_verified', 'Patient verified', { verification: v })) setModal(null); }} />}
      {modal === 'complete' && <CompleteModal types={home.lists.completion_types} onClose={() => setModal(null)} onSubmit={async (t, notes) => {
        try {
          const r = await sendAction(`/api/v1/companion/jobs/${id}/complete`, { completion_type: t, notes }, 'Complete job');
          toast(r === 'queued' ? 'info' : 'success', r === 'queued' ? 'Saved offline – will complete when back online' : 'Job completed. Thank you! 🙏');
          setModal(null); load(); reloadHome();
        } catch (e: any) { toast('error', e.message); }
      }} />}
      {modal === 'expense' && <ExpenseModal categories={home.lists.expense_categories} onClose={() => setModal(null)} onSubmit={async (body) => {
        try { const r = await sendAction(`/api/v1/companion/jobs/${id}/expenses`, body, 'Expense'); toast(r === 'queued' ? 'info' : 'success', r === 'queued' ? 'Expense saved offline' : 'Expense submitted for approval'); setModal(null); load(); } catch (e: any) { toast('error', e.message); }
      }} />}
      {modal === 'note' && <NoteModal onClose={() => setModal(null)} onSubmit={async (note) => {
        try { await sendAction(`/api/v1/companion/jobs/${id}/notes`, { note }, 'Note'); toast('success', 'Note saved'); setModal(null); load(); } catch (e: any) { toast('error', e.message); }
      }} />}
      {modal === 'incident' && <IncidentSOS emergency={home.emergency} opsPhone={j.ops_phone} categories={home.lists.incident_categories} onClose={() => setModal(null)} onSubmit={async (body) => {
        try { await sendAction(`/api/v1/companion/jobs/${id}/incidents`, body, 'Incident'); toast('success', 'Incident reported – Operations alerted'); setModal(null); load(); } catch (e: any) { toast('error', e.message); }
      }} />}
    </div>
  );
}

function VerifyModal({ onClose, onSubmit, opsPhone }: { onClose: () => void; onSubmit: (v: any) => void; opsPhone: string }) {
  const [code, setCode] = useState('');
  return (
    <Modal open onClose={onClose} title="Verify patient handover">
      <p className="text-sm text-slate-600">Ask the family or patient for the <strong>4-digit booking code</strong> from their confirmation.</p>
      <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className="mt-3 text-center text-3xl tracking-[.6em]" placeholder="••••" autoFocus data-testid="verify-code" />
      <Button className="btn-primary mt-4 w-full py-3" disabled={code.length !== 4} onClick={() => onSubmit({ method: 'booking_code', code })} data-testid="verify-submit">Verify</Button>
      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">No code? <a href={`tel:${opsPhone}`} className="font-semibold text-brand-700 underline">Call Operations</a> for assisted verification — they’ll record it for you.</div>
    </Modal>
  );
}

function CompleteModal({ types, onClose, onSubmit }: { types: string[]; onClose: () => void; onSubmit: (t: string, notes: string) => void }) {
  const [t, setT] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <Modal open onClose={onClose} title="Complete job" footer={<Button className="btn-primary w-full py-3" disabled={!t || (t === 'Other' && !notes)} onClick={() => onSubmit(t, notes)} data-testid="complete-submit">Complete job</Button>}>
      <p className="mb-3 text-sm text-slate-600">How did the service end?</p>
      <div className="grid gap-2">{types.map((x) => <button key={x} onClick={() => setT(x)} className={cx('rounded-xl p-3.5 text-left text-sm font-medium ring-1', t === x ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200')} data-testid={`outcome-${x.split(' ')[0]}`}>{x}</button>)}</div>
      <Field label={`Notes${t === 'Other' ? ' (required)' : ''}`} className="mt-3"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Handed over to son, medicines explained to house help" /></Field>
    </Modal>
  );
}

function ExpenseModal({ categories, onClose, onSubmit }: { categories: string[]; onClose: () => void; onSubmit: (b: any) => Promise<void> }) {
  const [f, setF] = useState({ category: categories[0], amount: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Add expense" footer={<Button className="btn-primary w-full py-3" loading={busy} disabled={!f.amount} onClick={async () => {
      setBusy(true);
      try { await onSubmit({ ...f, amount: Number(f.amount), receipt: file ? await fileToPayload(file) : null }); } finally { setBusy(false); }
    }} data-testid="expense-submit">Submit for approval</Button>}>
      <div className="space-y-3">
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={categories} /></Field>
        <Field label="Amount (₹)"><Input type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="expense-amount" /></Field>
        <Field label="What was it for?"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Auto from home to Medanta" /></Field>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-4 text-sm text-slate-600">
          {preview ? <img src={preview} alt="Receipt" className="max-h-40 rounded-lg" /> : <><FiCamera className="text-2xl text-brand-700" /> Take photo of receipt</>}
          <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" data-testid="expense-file" onChange={async (e) => {
            const raw = e.target.files?.[0];
            if (!raw) return;
            const c = await compressImage(raw);
            setFile(c);
            setPreview(c.type.startsWith('image/') ? URL.createObjectURL(c) : null);
          }} />
        </label>
        {file && <p className="text-center text-xs text-slate-500">{file.name} · {Math.round(file.size / 1024)} KB</p>}
      </div>
    </Modal>
  );
}

function NoteModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (n: string) => void }) {
  const [n, setN] = useState('');
  return (
    <Modal open onClose={onClose} title="Add note for Operations" footer={<Button className="btn-primary w-full" disabled={!n} onClick={() => onSubmit(n)}>Save note</Button>}>
      <Textarea rows={4} value={n} onChange={(e) => setN(e.target.value)} placeholder="Visible to Operations only. No medical details." autoFocus />
    </Modal>
  );
}

function IncidentSOS({ emergency, opsPhone, categories, onClose, onSubmit }: { emergency: any; opsPhone: string; categories: string[]; onClose: () => void; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category: '', severity: 'HIGH', description: '' });
  return (
    <Modal open onClose={onClose} title={<span className="text-red-700">Incident / Emergency</span>} footer={<Button className="btn-danger w-full py-3" disabled={!f.category || !f.description} onClick={() => onSubmit(f)} data-testid="incident-submit">Report to Operations</Button>}>
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:${emergency.primary_number}`} className="btn btn-danger py-4"><FiPhone /> {emergency.primary_number}</a>
        <a href={`tel:${emergency.ambulance_number}`} className="btn btn-danger py-4"><FiPhone /> {emergency.ambulance_number} Ambulance</a>
      </div>
      <a href={`tel:${opsPhone}`} className="btn btn-secondary mt-2 w-full"><FiPhone /> Call Operations</a>
      <p className="my-3 text-xs text-slate-500">If life is at risk, call emergency first. Then record what happened:</p>
      <div className="space-y-3">
        <Field label="What happened?"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Select" options={categories} /></Field>
        <Field label="Severity"><div className="grid grid-cols-4 gap-1.5">{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <button key={s} onClick={() => setF({ ...f, severity: s })} className={cx('rounded-lg py-2 text-[11px] font-bold ring-1', f.severity === s ? 'bg-red-600 text-white ring-red-600' : 'ring-slate-200')}>{s}</button>)}</div></Field>
        <Field label="Details"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function History() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { get('/api/v1/companion/history').then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Job history</h1>
      {!rows ? <PageLoader /> : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id + r.offered_at}>
              <Link to={['ACCEPTED', 'COMPLETED'].includes(r.assignment_status) ? `/companion/job/${r.id}` : '/companion/history'} className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div><p className="font-semibold">{r.request_number}</p><p className="text-xs text-slate-500">{fmtDateTime(r.offered_at)} · {r.completion_type || STATUS_LABEL[r.current_status]}</p></div>
                <div className="text-right"><Badge tone={r.assignment_status === 'COMPLETED' ? 'green' : r.assignment_status === 'ACCEPTED' ? 'blue' : 'gray'}>{r.assignment_status}</Badge>
                  {r.service_duration_minutes && <p className="mt-1 text-xs text-slate-500">{fmtDuration(r.service_duration_minutes)}</p>}{r.rating && <p className="text-xs text-amber-500">{'★'.repeat(r.rating)}</p>}</div>
              </Link>
            </li>
          ))}
          {!rows.length && <p className="p-8 text-center text-sm text-slate-500">No jobs yet.</p>}
        </ul>
      )}
    </div>
  );
}

function Profile({ home }: { home: any }) {
  const me = home.me;
  return (
    <div className="p-4">
      <div className="rounded-3xl bg-white p-5 text-center ring-1 ring-slate-200">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-800">{me.name.split(' ').map((x: string) => x[0]).join('')}</div>
        <p className="mt-3 text-lg font-bold">{me.name}</p>
        <p className="text-sm text-slate-500">{me.code} · {me.phone}</p>
        <p className="mt-1 text-sm">🗣 {me.languages.join(', ')}</p>
        <div className="mt-3">{me.verification_complete ? <Badge tone="green"><FiShield /> Verified companion</Badge> : <Badge tone="amber">Verification pending</Badge>}</div>
      </div>
      <div className="mt-4 space-y-2 rounded-3xl bg-white p-4 text-sm ring-1 ring-slate-200">
        <p className="font-bold">Remember</p>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li>You accompany and coordinate — never diagnose, prescribe or treat.</li>
          <li>If someone is seriously unwell, call {home.emergency.primary_number} / {home.emergency.ambulance_number} first, then Operations.</li>
          <li>Keep updates short and free of medical details.</li>
          <li>Photograph every receipt.</li>
        </ul>
        <a href={`tel:${home.ops_phone}`} className="btn btn-secondary mt-2 w-full"><FiPhone /> Operations {home.ops_phone_display}</a>
      </div>
      <button className="btn btn-secondary mt-4 w-full" onClick={async () => { await post('/api/v1/companion/auth/logout'); location.href = '/companion'; }} data-testid="cmp-logout"><FiLogOut /> Sign out</button>
    </div>
  );
}
