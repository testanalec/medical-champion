import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FiX, FiCheckCircle, FiAlertTriangle, FiInfo, FiLoader } from 'react-icons/fi';
import { STATUS_LABEL } from '../../shared/constants';

export const cx = (...c: any[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- formatting
const TZ = 'Asia/Kolkata';
export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }) : '—');
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—');
export const fmtDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }) : '—';
export function ago(d?: string | Date | null) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const f = Math.abs(s);
  const suffix = s >= 0 ? 'ago' : 'from now';
  if (f < 45) return s >= 0 ? 'just now' : 'in a moment';
  if (f < 3600) return `${Math.round(f / 60)} min ${suffix}`;
  if (f < 86400) return `${Math.round(f / 3600)} h ${suffix}`;
  return `${Math.round(f / 86400)} d ${suffix}`;
}
export const toLocalInput = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(new Date(d).getTime() + 330 * 60000);
  return x.toISOString().slice(0, 16);
};
export const fromLocalInput = (s: string) => (s ? new Date(s + ':00+05:30').toISOString() : null);
export const pct = (x: number | null | undefined, digits = 0) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`);

// ---------------------------------------------------------------- primitives
export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <FiLoader className={cx('animate-spin text-brand-600', className)} aria-label="Loading" />;
}
export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: any; onRetry?: () => void }) {
  return (
    <div className="card mx-auto my-10 max-w-md p-6 text-center">
      <FiAlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
      <p className="mt-3 font-semibold">{error?.message || 'Something went wrong'}</p>
      {onRetry && <button className="btn btn-secondary mt-4" onClick={onRetry}>Try again</button>}
    </div>
  );
}
export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-3xl text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Button({ loading, children, className = 'btn-primary', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button className={cx('btn', className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <FiLoader className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const TONES: Record<string, string> = {
  gray: 'bg-slate-50 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  coral: 'bg-orange-50 text-orange-800 ring-orange-200',
  dark: 'bg-slate-800 text-white ring-slate-800',
};
export function Badge({ tone = 'gray', children, className, title }: { tone?: string; children: React.ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cx('chip', TONES[tone] || TONES.gray, className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, string> = {
  NEW: 'coral', AWAITING_CONFIRMATION: 'amber', SEARCHING_COMPANION: 'amber', COMPANION_ASSIGNED: 'violet', COMPANION_ACCEPTED: 'blue',
  EN_ROUTE: 'blue', WITH_PATIENT: 'brand', AT_HOSPITAL: 'brand', RETURNING: 'brand', COMPLETED: 'green', CANCELLED: 'gray', UNFULFILLED: 'red',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status] || status}</Badge>;
}
export const PAY_TONE: Record<string, string> = { PAID: 'green', PENDING: 'amber', CREATED: 'amber', FAILED: 'red', REFUNDED: 'gray', PARTIALLY_REFUNDED: 'violet', AUTHORIZED: 'blue', NOT_DUE: 'gray', CANCELLED: 'gray' };
export function PayBadge({ status }: { status: string }) {
  return <Badge tone={PAY_TONE[status]}>{status === 'NOT_DUE' ? 'Not due' : status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const hue = [...(name || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
  const bg = ['bg-brand-100 text-brand-800', 'bg-orange-100 text-orange-800', 'bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-emerald-100 text-emerald-800'][hue];
  if (src) return <img src={src} alt={name} className={cx('rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  return (
    <div className={cx('flex shrink-0 items-center justify-center rounded-full font-bold', bg, className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('input', p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx('input', p.className)} />;
export function Select({ options, placeholder, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <select {...p} className={cx('input pr-8', p.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2.5 select-none', disabled && 'cursor-not-allowed opacity-50')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className={cx('fade-up flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-lift sm:rounded-3xl', w)}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-bold">{title}</h3>
          <button className="btn btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Close"><FiX className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }: { tabs: { id: string; label: React.ReactNode; count?: number }[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cx('scrollbar-thin flex gap-1 overflow-x-auto border-b border-slate-200', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition',
            value === t.id ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-ink')}>
          {t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'warn' | 'bad'; icon?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">{label}{icon && <span className="text-slate-400">{icon}</span>}</div>
      <div className={cx('mt-1.5 text-2xl font-bold tracking-tight', tone === 'good' && 'text-emerald-700', tone === 'warn' && 'text-amber-700', tone === 'bad' && 'text-red-700')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function KV({ items, cols = 2 }: { items: [React.ReactNode, React.ReactNode][]; cols?: number }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3', cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : '')}>
      {items.filter(Boolean).map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('card', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Countdown({ to, onDone, className }: { to: string; onDone?: () => void; className?: string }) {
  const [now, setNow] = useState(Date.now());
  const done = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(to).getTime() - now);
  useEffect(() => { if (left === 0 && !done.current) { done.current = true; onDone?.(); } }, [left]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <span className={cx('tabular-nums', className)}>{m}:{String(s).padStart(2, '0')}</span>;
}

export function Elapsed({ from, className }: { from: string; className?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const t = Math.max(0, now - new Date(from).getTime());
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return <span className={cx('tabular-nums', className)}>{h}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>;
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = (kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
        {items.map((t) => (
          <div key={t.id} role="status" className={cx('fade-up pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lift',
            t.kind === 'success' && 'bg-emerald-700 text-white', t.kind === 'error' && 'bg-red-600 text-white', t.kind === 'info' && 'bg-slate-900 text-white')}>
            {t.kind === 'success' ? <FiCheckCircle className="mt-0.5 shrink-0" /> : t.kind === 'error' ? <FiAlertTriangle className="mt-0.5 shrink-0" /> : <FiInfo className="mt-0.5 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Wrap an async action with loading state + toast on error/success. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (success) toast('success', success);
      return r;
    } catch (e: any) {
      toast('error', e.message || 'Something went wrong');
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function Logo({ light, compact }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
      {!compact && (
        <span className="whitespace-nowrap leading-none">
          <span className={cx('block font-display text-[19px] font-semibold tracking-tight', light ? 'text-white' : 'text-brand-900')}>ChampOnCall</span>
          <span className={cx('mt-0.5 block text-[9.5px] font-semibold uppercase tracking-[.14em]', light ? 'text-brand-200' : 'text-brand-600')}>Trusted help, any time</span>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- charts (single-series; accessible, hover tooltips)
export function BarChart({ data, height = 180, format = (v: number) => String(v), labelEvery = 1 }: { data: { label: string; value: number; title?: string }[]; height?: number; format?: (v: number) => string; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 100 / Math.max(1, data.length);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <figure className="relative">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0 text-right text-[10px] tabular-nums text-slate-400" style={{ height }}>
          {[...ticks].reverse().map((t, i) => <span key={i}>{format(t)}</span>)}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t, i) => <div key={i} className="absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: `${(t / max) * 100}%` }} />)}
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Bar chart">
            {data.map((d, i) => {
              const h = (d.value / max) * (height - 2);
              return (
                <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={i * W} y={0} width={W} height={height} fill="transparent" />
                  <rect x={i * W + W * 0.16} y={height - h} width={W * 0.68} height={Math.max(h, d.value ? 1.5 : 0)} rx={Math.min(1.2, W * 0.2)}
                    className={cx('transition-colors', hover === i ? 'fill-brand-700' : 'fill-brand-500')} />
                </g>
              );
            })}
          </svg>
          {hover != null && (
            <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={{ left: `${(hover + 0.5) * W}%`, bottom: `${(data[hover].value / max) * 100}%`, marginBottom: 6 }}>
              <div className="font-semibold">{format(data[hover].value)}</div>
              <div className="text-slate-300">{data[hover].title || data[hover].label}</div>
            </div>
          )}
        </div>
      </div>
      <div className="ml-8 mt-1.5 flex text-[10px] text-slate-400">
        {data.map((d, i) => <span key={i} className="flex-1 truncate text-center">{i % labelEvery === 0 ? d.label : ''}</span>)}
      </div>
    </figure>
  );
}

export function HBars({ data, format = (v: number) => String(v) }: { data: { k: string; n: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.k} className="group" title={`${d.k}: ${format(d.n)}`}>
          <div className="mb-1 flex justify-between text-xs"><span className="truncate text-slate-700">{d.k}</span><span className="font-semibold tabular-nums text-slate-900">{format(d.n)}</span></div>
          <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500 transition-all group-hover:bg-brand-700" style={{ width: `${(d.n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
