import React, { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle, FiMapPin, FiNavigation, FiAlertTriangle, FiArrowRight } from 'react-icons/fi';
import { PublicShell, EmergencyGate } from '../../components/public';
import { get, post, uid } from '../../lib/api';
import { useConfig, getUtm } from '../../lib/config';
import { Link } from '../../lib/router';
import { Button, Field, Input, Textarea, cx, useToast, fromLocalInput, toLocalInput } from '../../components/ui';
import { fmtINR, RELATIONSHIPS } from '../../../shared/constants';

export function Chips<T extends string>({ value, onChange, options, testid }: { value: T | ''; onChange: (v: T) => void; options: [T, string][]; testid?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map(([v, l]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} data-testid={testid ? `${testid}-${v}` : undefined}
          className={cx('rounded-xl px-3.5 py-2 text-sm font-medium ring-1 transition', value === v ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-300 hover:ring-brand-400')}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function PlaceInput({ value, onChange, onPick, type, placeholder, testid }: { value: string; onChange: (v: string) => void; onPick: (p: any) => void; type?: 'hospital' | 'locality'; placeholder?: string; testid?: string }) {
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || value.length < 2) { setResults([]); return; }
    const t = setTimeout(() => get(`/api/v1/public/places?q=${encodeURIComponent(value)}${type ? `&type=${type}` : ''}`).then(setResults).catch(() => setResults([])), 220);
    return () => clearTimeout(t);
  }, [value, open]);
  return (
    <div className="relative">
      <Input value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 180)} placeholder={placeholder} data-testid={testid} />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-white p-1 shadow-lift ring-1 ring-slate-200">
          {results.map((p) => (
            <li key={p.name + p.address}>
              <button type="button" className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50" onMouseDown={() => { onPick(p); setOpen(false); }}>
                <FiMapPin className="mt-1 shrink-0 text-brand-600" />
                <span><span className="block text-sm font-medium">{p.name}</span><span className="text-xs text-slate-500">{p.address}{p.in_area === false ? ' · outside service area' : ''}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Book() {
  const c = useConfig();
  const toast = useToast();
  const [gate, setGate] = useState(true);
  const [f, setF] = useState<any>({ relationship: '', urgency: '', mobility: '', service_type: '', consent: false, emergency_acknowledged: false });
  const [pickup, setPickup] = useState<{ text: string; lat?: number; lng?: number; in_area?: boolean | null }>({ text: '' });
  const [dest, setDest] = useState<{ text: string; lat?: number; lng?: number }>({ text: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [key] = useState(uid());
  const set = (k: string) => (v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const rule = useMemo(() => c?.pricing.find((p) => p.service_type === f.service_type) || c?.pricing.find((p) => p.service_type === '*'), [c, f.service_type]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = [!f.relationship && 'who needs help', !pickup.text && 'pickup address', !f.service_type && 'type of help', !f.urgency && 'when', f.urgency === 'SCHEDULED' && !f.requested_at && 'date & time', !f.mobility && 'mobility', !f.customer_name && 'your name', !f.customer_phone && 'your mobile'].filter(Boolean);
    if (missing.length) return toast('error', `Please add: ${missing.join(', ')}`);
    if (!f.consent) return toast('error', 'Please accept the privacy notice and terms');
    setBusy(true);
    try {
      const r = await post('/api/v1/requests', {
        ...f, pickup_address: pickup.text, pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_source: pickup.lat ? 'web_pin' : 'typed',
        destination_name: dest.text || null, destination_lat: dest.lat, destination_lng: dest.lng, emergency_acknowledged: true,
        requested_at: f.urgency === 'SCHEDULED' ? fromLocalInput(f.requested_at) : null, utm: getUtm(), idempotency_key: key,
      });
      setDone(r);
      window.scrollTo({ top: 0 });
    } catch (er: any) { toast('error', er.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <PublicShell footer={false}>
        <div className="mx-auto max-w-lg px-4 py-14">
          <div className="card p-8 text-center fade-up">
            <FiCheckCircle className="mx-auto h-14 w-14 text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold">We’ve received your request.</h1>
            <p className="mt-2 text-slate-600">Request ID</p>
            <p className="font-display text-4xl font-semibold text-brand-800" data-testid="book-request-number">{done.request_number}</p>
            <p className="mt-4 text-slate-600">Our support team is reviewing it and will contact you shortly{done.human_review_required ? ' — because of the details you shared, a care team member will call you personally before confirming' : ''}.</p>
            <div className="mt-5 rounded-xl bg-red-50 p-3 text-left text-sm text-red-900 ring-1 ring-red-100">
              <FiAlertTriangle className="mr-1 inline" /> This is not an emergency service. If your loved one has life-threatening symptoms, call {c?.emergency.primary_number} or {c?.emergency.ambulance_number} now.
            </div>
            <Link to={done.track_url} className="btn btn-primary btn-lg mt-6 w-full">Track this request <FiArrowRight /></Link>
          </div>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell footer={false}>
      <EmergencyGate open={gate} onClose={() => setGate(false)} onContinue={() => { setGate(false); set('emergency_acknowledged')(true); }} />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="kicker">Book online</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-brand-950">Request a companion</h1>
        <p className="mt-2 text-slate-600">Prefer chatting? <Link to="/whatsapp" className="font-semibold text-brand-700 underline">Book on WhatsApp</Link> or <a href={`tel:${c?.contact.support_phone}`} className="font-semibold text-brand-700 underline">call us</a>.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <section className="card space-y-4 p-5 sm:p-6">
            <h2 className="font-bold">1. Who needs assistance?</h2>
            <Chips value={f.relationship} onChange={set('relationship')} options={RELATIONSHIPS.map((r) => [r, r] as [string, string])} testid="rel" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Their name" className="sm:col-span-2"><Input value={f.patient_name || ''} onChange={(e) => set('patient_name')(e.target.value)} placeholder="e.g. Kamla Devi" /></Field>
              <Field label="Age"><Input type="number" min={1} max={120} value={f.patient_age || ''} onChange={(e) => set('patient_age')(e.target.value)} /></Field>
              <Field label="Preferred language"><select className="input" value={f.patient_language || ''} onChange={(e) => set('patient_language')(e.target.value)}><option value="">Any</option>{c?.lists.languages.map((l) => <option key={l}>{l}</option>)}</select></Field>
              <Field label="Their mobile (optional)" className="sm:col-span-2"><Input value={f.patient_phone || ''} onChange={(e) => set('patient_phone')(e.target.value)} inputMode="tel" /></Field>
            </div>
          </section>

          <section className="card space-y-4 p-5 sm:p-6">
            <h2 className="font-bold">2. Where and what</h2>
            <Field label="Pickup address" hint="House/flat, society, sector. Start typing an area to pin it.">
              <PlaceInput value={pickup.text} type="locality" placeholder="e.g. B-12, Sushant Lok 1" testid="book-pickup"
                onChange={(v) => setPickup({ text: v })}
                onPick={(p) => setPickup({ text: `${pickup.text && !pickup.text.toLowerCase().includes(p.name.toLowerCase()) ? pickup.text + ', ' : ''}${p.address}`, lat: p.lat, lng: p.lng, in_area: p.in_area })} />
            </Field>
            <button type="button" className="btn btn-ghost btn-sm -mt-2" onClick={() => navigator.geolocation?.getCurrentPosition((pos) => setPickup((x) => ({ ...x, lat: pos.coords.latitude, lng: pos.coords.longitude, text: x.text || 'Current location (pinned)' })), () => toast('error', 'Could not get location'))}><FiNavigation /> Use current location</button>
            {pickup.lat && <p className="-mt-2 text-xs text-emerald-700">📍 Location pinned{pickup.in_area === false ? ' — this looks outside Gurugram; our team will review before confirming' : ''}</p>}
            <Field label="Type of help">
              <Chips value={f.service_type} onChange={set('service_type')} options={(c?.service_types || []).map((s) => [s.id, s.label] as [string, string])} testid="svc" />
            </Field>
            <Field label="Hospital / clinic" hint="Leave empty if not decided yet">
              <PlaceInput value={dest.text} type="hospital" placeholder="e.g. Medanta" onChange={(v) => setDest({ text: v })} onPick={(p) => setDest({ text: p.name, lat: p.lat, lng: p.lng })} testid="book-dest" />
            </Field>
          </section>

          <section className="card space-y-4 p-5 sm:p-6">
            <h2 className="font-bold">3. When & mobility</h2>
            <Chips value={f.urgency} onChange={set('urgency')} options={[['ASAP', 'ASAP'], ['WITHIN_2_HOURS', 'Within 2 hours'], ['LATER_TODAY', 'Later today'], ['SCHEDULED', 'Schedule']]} testid="urg" />
            {f.urgency === 'SCHEDULED' && <Field label="Date & time"><Input type="datetime-local" min={toLocalInput(new Date(Date.now() + 30 * 60000))} value={f.requested_at || ''} onChange={(e) => set('requested_at')(e.target.value)} /></Field>}
            <Field label="Can they walk independently?">
              <Chips value={f.mobility} onChange={set('mobility')} options={[['INDEPENDENT', 'Yes'], ['NEEDS_ASSISTANCE', 'Needs some assistance'], ['BEDRIDDEN', 'No / Bedridden']]} testid="mob" />
            </Field>
            {f.mobility === 'BEDRIDDEN' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">Thank you. A care team member will personally review this and call you before confirming — some situations need medical transport rather than a companion.</p>}
            <Field label="Anything important we should know?" hint={`Only what the companion needs — e.g. “uses a walker”, “hard of hearing”. Please don’t share medical history. ${(f.special_instructions || '').length}/300`}>
              <Textarea maxLength={300} value={f.special_instructions || ''} onChange={(e) => set('special_instructions')(e.target.value)} />
            </Field>
          </section>

          <section className="card space-y-4 p-5 sm:p-6">
            <h2 className="font-bold">4. Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name"><Input value={f.customer_name || ''} onChange={(e) => set('customer_name')(e.target.value)} data-testid="book-name" /></Field>
              <Field label="Your mobile (WhatsApp)"><Input value={f.customer_phone || ''} onChange={(e) => set('customer_phone')(e.target.value)} inputMode="tel" placeholder="98765 43210" data-testid="book-phone" /></Field>
              <Field label="Email (optional)" className="sm:col-span-2"><Input type="email" value={f.customer_email || ''} onChange={(e) => set('customer_email')(e.target.value)} /></Field>
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-700" checked={f.consent} onChange={(e) => set('consent')(e.target.checked)} data-testid="book-consent" />
              <span>I agree to the <Link to="/privacy" className="underline">privacy notice</Link> and <Link to="/terms" className="underline">terms</Link>, and I have the consent of the person receiving assistance to share their details for this service.</span>
            </label>
          </section>

          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            {rule && <div><p className="text-xs text-slate-500">Estimated</p><p className="text-lg font-bold">{fmtINR(rule.base_fee)} <span className="text-sm font-normal text-slate-500">first {rule.included_minutes / 60} h · then {fmtINR(rule.extension_rate_per_hour)}/h{Number(rule.tax_percent) ? ` + ${rule.tax_percent}% GST` : ''}</span></p><p className="text-xs text-slate-500">Pay after the service</p></div>}
            <Button className="btn-primary btn-lg" loading={busy} data-testid="book-submit">Confirm request</Button>
          </div>
        </form>
      </div>
    </PublicShell>
  );
}
