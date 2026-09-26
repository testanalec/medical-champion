import React, { useEffect, useRef, useState } from 'react';
import { FiSend, FiPaperclip, FiMapPin, FiArrowLeft, FiList, FiExternalLink, FiPhone, FiRefreshCw, FiInfo, FiNavigation } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { PublicShell } from '../../components/public';
import { get, post, useApi } from '../../lib/api';
import { getUtm, useConfig } from '../../lib/config';
import { Link } from '../../lib/router';
import { Button, Field, Input, Modal, cx, fmtTime, useToast } from '../../components/ui';

type Msg = { id: string; direction: 'IN' | 'OUT'; body: string; status: string; created_at: string; buttons?: { id: string; title: string }[]; list?: { button: string; rows: { id: string; title: string; description?: string }[] }; actions?: { type: string; title: string; url: string }[]; location?: any };

function fmtWa(text: string) {
  // WhatsApp-style *bold* and _italic_
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g);
  return parts.map((p, i) =>
    p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <strong key={i}>{p.slice(1, -1)}</strong>
    : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
    : /^https?:\/\//.test(p) ? <a key={i} href={p} className="break-all text-sky-700 underline">{p}</a>
    : <React.Fragment key={i}>{p}</React.Fragment>,
  );
}

export default function WhatsAppDemo() {
  const c = useConfig();
  const toast = useToast();
  const [phone, setPhone] = useState<string>(() => { try { return localStorage.getItem('mc_sim_phone') || ''; } catch { return ''; } });
  const [name, setName] = useState<string>(() => { try { return localStorage.getItem('mc_sim_name') || ''; } catch { return ''; } });
  const [draftPhone, setDraftPhone] = useState(phone);
  const [draftName, setDraftName] = useState(name);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [listFor, setListFor] = useState<Msg | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const { data, reload, error } = useApi<{ messages: Msg[]; step: string; active_request: any }>(phone ? `/api/v1/whatsapp/simulator/messages?phone=${encodeURIComponent(phone)}` : null, { poll: 2500 });
  const scroller = useRef<HTMLDivElement>(null);
  const count = data?.messages.length || 0;
  useEffect(() => { scroller.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); }, [count, sending]);

  const send = async (payload: any) => {
    setSending(true);
    try {
      await post('/api/v1/whatsapp/simulator/send', { phone, name, utm: getUtm(), ...payload });
      await reload();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setSending(false);
    }
  };

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    const d = draftPhone.replace(/[^\d+]/g, '');
    if (d.replace(/\D/g, '').length < 10) return toast('error', 'Enter a 10-digit mobile number');
    try { localStorage.setItem('mc_sim_phone', d); localStorage.setItem('mc_sim_name', draftName); } catch { /* ignore */ }
    setPhone(d);
    setName(draftName);
    setTimeout(() => post('/api/v1/whatsapp/simulator/send', { phone: d, name: draftName, utm: getUtm(), text: 'Hi' }).then(() => reload()).catch((er) => toast('error', er.message)), 50);
  };

  const lastOut = [...(data?.messages || [])].reverse().find((m) => m.direction === 'OUT');

  return (
    <PublicShell footer={false} ctaBar={false}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_400px] lg:py-12">
        <div className="order-2 lg:order-1">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200"><FaWhatsapp /> WhatsApp booking</span>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Book a companion in under two minutes</h1>
          <p className="mt-3 max-w-xl text-slate-600">
            This is our WhatsApp booking assistant. Tap the options, share a location and confirm — your request goes straight to our operations team, and every update about the visit arrives here.
          </p>
          <div className="mt-6 rounded-2xl bg-white p-5 text-sm ring-1 ring-warm-200">
            <p className="flex items-center gap-2 font-semibold"><FiInfo className="text-brand-600" /> {c?.integrations.whatsapp ? 'Live channel' : 'Sandbox channel'}</p>
            <p className="mt-2 leading-relaxed text-slate-600">
              {c?.integrations.whatsapp
                ? 'Our official WhatsApp Business number is live. You can also message us directly from the WhatsApp app.'
                : 'This in-browser chat runs on the same webhook, conversation engine and notification service as the official WhatsApp Business API. Once the business number is connected, the identical flow runs inside WhatsApp — no real messages are sent from this page.'}
            </p>
          </div>
          {data?.active_request && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-700 p-5 text-white">
              <div><p className="text-xs text-brand-200">Your request</p><p className="text-lg font-bold">{data.active_request.request_number}</p></div>
              <Link to={`/track/${data.active_request.request_number}?t=${data.active_request.tracking_token}`} className="btn bg-white text-brand-800 hover:bg-brand-50"><FiExternalLink /> Track live</Link>
            </div>
          )}
          <ol className="mt-6 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {['Who needs help', 'Their location (pin or address)', 'Type of help', 'When you need us', 'Can they walk independently?', 'Hospital / clinic', 'Anything important', 'Confirm → Request ID'].map((s, i) => (
              <li key={s} className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700 ring-1 ring-warm-200">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </div>

        {/* PHONE */}
        <div className="order-1 lg:order-2">
          <div className="mx-auto flex h-[min(760px,calc(100dvh-7rem))] max-w-[400px] flex-col overflow-hidden rounded-[2.2rem] border-[9px] border-slate-900 bg-slate-900 shadow-lift">
            <div className="flex items-center gap-3 bg-[#075e54] px-3 py-3 text-white">
              <FiArrowLeft className="opacity-70" />
              <img src="/icon.svg" alt="" className="h-9 w-9 rounded-full bg-white" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold">{c?.brand.name || 'Medical Champion'}</p>
                <p className="text-[11px] text-emerald-100">{sending ? 'typing…' : 'Business account · usually replies instantly'}</p>
              </div>
              {phone && (
                <button title="Restart conversation" className="rounded-full p-2 hover:bg-white/10" onClick={async () => { await post('/api/v1/whatsapp/simulator/reset', { phone }); send({ text: 'Hi' }); }}>
                  <FiRefreshCw />
                </button>
              )}
              <a href={`tel:${c?.contact.support_phone}`} className="rounded-full p-2 hover:bg-white/10" title="Call"><FiPhone /></a>
            </div>

            {!phone ? (
              <form onSubmit={start} className="wa-bg flex flex-1 flex-col justify-center gap-4 p-6">
                <div className="rounded-2xl bg-white p-5 shadow-sm">
                  <p className="font-semibold">Start a WhatsApp chat</p>
                  <p className="mt-1 text-xs text-slate-500">Your number identifies your chat, exactly like WhatsApp. We’ll use it only for this booking.</p>
                  <Field label="Your mobile number" className="mt-4"><Input value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} inputMode="tel" placeholder="98765 43210" autoFocus data-testid="sim-phone" /></Field>
                  <Field label="Your name" className="mt-3"><Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. Rohan" data-testid="sim-name" /></Field>
                  <Button className="btn-wa mt-4 w-full" type="submit"><FaWhatsapp /> Start chat</Button>
                  <p className="mt-3 text-[11px] leading-snug text-slate-400">By continuing you agree to our <Link to="/privacy" className="underline">privacy notice</Link> and <Link to="/terms" className="underline">terms</Link>.</p>
                </div>
              </form>
            ) : (
              <>
                <div ref={scroller} className="wa-bg flex-1 space-y-2 overflow-y-auto px-3 py-4" data-testid="sim-messages">
                  <p className="mx-auto w-fit rounded-lg bg-[#fff3c4] px-3 py-1.5 text-center text-[11px] text-slate-600 shadow-sm">🔒 Messages are secured. Chatting as {phone}</p>
                  {error && <p className="text-center text-xs text-red-600">{error.message}</p>}
                  {data?.messages.map((m) => (
                    <div key={m.id} className={cx('flex flex-col', m.direction === 'IN' ? 'items-end' : 'items-start')}>
                      <div className={cx('max-w-[86%] rounded-xl px-3 py-2 text-[13.5px] leading-snug shadow-sm', m.direction === 'IN' ? 'rounded-tr-sm bg-[#d9fdd3]' : 'rounded-tl-sm bg-white')}>
                        {m.location ? (
                          <div className="flex items-center gap-2"><FiMapPin className="text-red-500" /><span>{m.location.address || m.location.name || `${m.location.latitude}, ${m.location.longitude}`}</span></div>
                        ) : (
                          <p className="whitespace-pre-line text-slate-800">{fmtWa(m.body || '')}</p>
                        )}
                        <p className="mt-0.5 text-right text-[10px] text-slate-400">{fmtTime(m.created_at)}{m.direction === 'IN' && <span className="ml-1 text-sky-500">✓✓</span>}</p>
                      </div>
                      {m.direction === 'OUT' && (m.buttons?.length || m.list || m.actions?.length) ? (
                        <div className="mt-1 grid w-[86%] gap-1">
                          {m.buttons?.map((b) => (
                            <button key={b.id} disabled={sending || m !== lastOut} onClick={() => send({ reply: { id: b.id, title: b.title } })}
                              className="rounded-xl bg-white py-2 text-center text-[13px] font-medium text-sky-700 shadow-sm transition hover:bg-sky-50 disabled:opacity-60" data-testid={`btn-${b.id}`}>
                              {b.title}
                            </button>
                          ))}
                          {m.list && (
                            <button disabled={sending || m !== lastOut} onClick={() => setListFor(m)} className="flex items-center justify-center gap-2 rounded-xl bg-white py-2 text-[13px] font-medium text-sky-700 shadow-sm hover:bg-sky-50 disabled:opacity-60" data-testid="btn-list">
                              <FiList /> {m.list.button}
                            </button>
                          )}
                          {m.actions?.map((a) => (
                            <a key={a.title} href={a.url} target={a.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                              className="flex items-center justify-center gap-2 rounded-xl bg-white py-2 text-[13px] font-medium text-sky-700 shadow-sm hover:bg-sky-50">
                              {a.type === 'call' ? <FiPhone /> : <FiExternalLink />} {a.title}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {sending && <div className="w-16 rounded-xl rounded-tl-sm bg-white px-3 py-2.5 shadow-sm"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />)}</span></div>}
                </div>
                <form className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; const t = text; setText(''); send({ text: t }); }}>
                  <button type="button" className={cx('rounded-full p-2.5 text-slate-600 hover:bg-white', data?.step === 'LOCATION' && 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400')} onClick={() => setLocOpen(true)} title="Share location" data-testid="sim-location"><FiPaperclip /></button>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-sm outline-none" data-testid="sim-input" />
                  <button className="rounded-full bg-[#00a884] p-2.5 text-white disabled:opacity-60" disabled={sending} aria-label="Send"><FiSend /></button>
                </form>
              </>
            )}
          </div>
          {phone && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Not you? <button className="font-semibold underline" onClick={() => { try { localStorage.removeItem('mc_sim_phone'); } catch { /* */ } setPhone(''); }}>Use another number</button>
            </p>
          )}
        </div>
      </div>

      <Modal open={!!listFor} onClose={() => setListFor(null)} title={listFor?.list?.button || 'Choose'} size="sm">
        <ul className="-mx-2">
          {listFor?.list?.rows.map((r) => (
            <li key={r.id}>
              <button className="w-full rounded-xl px-3 py-3 text-left hover:bg-slate-50" data-testid={`row-${r.id}`} onClick={() => { setListFor(null); send({ reply: { id: r.id, title: r.title, kind: 'list' } }); }}>
                <p className="text-sm font-medium">{r.title}</p>
                {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      <LocationPicker open={locOpen} onClose={() => setLocOpen(false)} onPick={(l) => { setLocOpen(false); send({ location: l }); }} />
    </PublicShell>
  );
}

function LocationPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (l: { lat: number; lng: number; name?: string; address?: string }) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => get(`/api/v1/public/places?type=locality&q=${encodeURIComponent(q)}`).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, open]);
  return (
    <Modal open={open} onClose={onClose} title="Send location" size="sm">
      <button className="btn btn-secondary w-full" disabled={geoBusy} onClick={() => {
        if (!navigator.geolocation) return toast('error', 'Location not available on this device');
        setGeoBusy(true);
        navigator.geolocation.getCurrentPosition(
          (p) => { setGeoBusy(false); onPick({ lat: p.coords.latitude, lng: p.coords.longitude, name: 'Current location' }); },
          () => { setGeoBusy(false); toast('error', 'Could not get your location. Pick a place below.'); },
          { timeout: 8000 },
        );
      }}><FiNavigation /> {geoBusy ? 'Locating…' : 'Send my current location'}</button>
      <p className="my-3 text-center text-xs text-slate-400">or drop a pin at</p>
      <Input placeholder="Search area, e.g. Sushant Lok" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 max-h-72 overflow-y-auto">
        {results.map((p) => (
          <li key={p.name}>
            <button className="flex w-full items-start gap-2 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50" onClick={() => onPick({ lat: p.lat, lng: p.lng, name: p.name, address: `House 21, ${p.address}` })} data-testid={`place-${p.name}`}>
              <FiMapPin className="mt-0.5 shrink-0 text-red-500" />
              <span><span className="block text-sm font-medium">{p.name}</span><span className="text-xs text-slate-500">{p.address}{p.in_area === false && ' · outside service area'}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
