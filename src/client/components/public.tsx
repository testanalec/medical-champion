import React, { useState } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { FiPhone, FiMenu, FiX, FiAlertTriangle, FiArrowRight } from 'react-icons/fi';
import { Link, navigate } from '../lib/router';
import { useConfig, whatsappHref, telHref } from '../lib/config';
import { Logo, Modal, cx } from './ui';
import { track } from '../lib/analytics';

/** FR-EMR-001: emergency warning shown before booking starts. */
export function EmergencyGate({ open, onClose, onContinue }: { open: boolean; onClose: () => void; onContinue: () => void }) {
  const c = useConfig();
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><FiAlertTriangle className="text-red-600" /> Is this a medical emergency?</span>} size="md">
      <p className="text-[15px] leading-relaxed text-slate-700">
        If the person has potentially <strong>life-threatening symptoms</strong> — chest pain, difficulty breathing, unconsciousness, heavy bleeding, signs of stroke —
        or needs immediate medical intervention, contact the appropriate emergency medical service or hospital <strong>immediately</strong>.
      </p>
      <p className="mt-3 text-sm text-slate-500">Our companions are not doctors, nurses, paramedics or an ambulance service.</p>
      <div className="mt-5 grid gap-3">
        <a href={`tel:${c?.emergency.primary_number || '112'}`} onClick={() => track('emergency_call_click')} className="btn btn-danger btn-lg w-full">
          <FiPhone /> CALL EMERGENCY SERVICE ({c?.emergency.primary_number || '112'})
        </a>
        <a href={`tel:${c?.emergency.ambulance_number || '108'}`} className="btn btn-secondary w-full text-red-700">
          Call ambulance ({c?.emergency.ambulance_number || '108'})
        </a>
        <button className="btn btn-primary btn-lg w-full" onClick={onContinue}>
          CONTINUE WITH COMPANION REQUEST <FiArrowRight />
        </button>
      </div>
    </Modal>
  );
}

export function useHelpNow() {
  const c = useConfig();
  const [open, setOpen] = useState(false);
  const href = whatsappHref(c);
  const go = () => {
    setOpen(false);
    track('whatsapp_click', { page: location.pathname });
    if (href.startsWith('http')) window.open(href, '_blank', 'noopener');
    else navigate(href);
  };
  const gate = <EmergencyGate open={open} onClose={() => setOpen(false)} onContinue={go} />;
  return { start: () => setOpen(true), gate };
}

export function WhatsAppCTA({ className, label = 'GET HELP NOW ON WHATSAPP', size = 'lg' }: { className?: string; label?: string; size?: 'lg' | 'md' | 'sm' }) {
  const { start, gate } = useHelpNow();
  return (
    <>
      <button onClick={start} className={cx('btn btn-wa', size === 'lg' && 'btn-lg', size === 'sm' && 'btn-sm', className)} data-testid="wa-cta">
        <FaWhatsapp className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} /> {label}
      </button>
      {gate}
    </>
  );
}

export function CallCTA({ className, size = 'lg', label = 'CALL US' }: { className?: string; size?: 'lg' | 'md' | 'sm'; label?: string }) {
  const c = useConfig();
  return (
    <a href={telHref(c)} onClick={() => track('call_click', { page: location.pathname })} className={cx('btn btn-secondary', size === 'lg' && 'btn-lg', size === 'sm' && 'btn-sm', className)}>
      <FiPhone /> {label}
    </a>
  );
}

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const links = [['How it works', '/#how'], ['Services', '/#services'], ['Pricing', '/#pricing'], ['Safety', '/#safety'], ['FAQ', '/#faq']];
  const nav = (to: string) => {
    setOpen(false);
    const [p, h] = to.split('#');
    if (location.pathname !== (p || '/')) navigate(p || '/');
    setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  return (
    <header className="sticky top-0 z-40 border-b border-warm-200/60 bg-warm-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" style={{ height: 76 }}>
        <Link to="/" aria-label="ChampOnCall home"><Logo /></Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map(([l, h]) => <button key={h} onClick={() => nav(h)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:text-ink">{l}</button>)}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <CallCTA size="sm" label="Call us" />
          <WhatsAppCTA size="sm" label="Get help now" />
        </div>
        <button className="btn btn-ghost p-2 lg:hidden sm:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <FiX className="h-5 w-5" /> : <FiMenu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <div className="border-t border-warm-200 bg-warm-50 px-4 pb-4 sm:hidden">
          {links.map(([l, h]) => <button key={h} onClick={() => nav(h)} className="block w-full rounded-lg px-2 py-3 text-left font-medium">{l}</button>)}
          <Link to="/track-lookup" className="block rounded-lg px-2 py-3 font-medium" onClick={() => setOpen(false)}>Track a request</Link>
        </div>
      )}
    </header>
  );
}

export function MobileCTABar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-[1fr_auto] gap-2 border-t border-slate-200 bg-white/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
      <WhatsAppCTA size="md" label="Get help now" className="w-full py-3" />
      <CallCTA size="md" label="Call" className="py-3" />
    </div>
  );
}

export function PublicFooter() {
  const c = useConfig();
  return (
    <footer className="bg-brand-950 pb-24 text-brand-100 sm:pb-0">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-200">
            {c?.brand.tagline} Verified companions who accompany your parents to hospitals, clinics and diagnostic centres across {c?.brand.city || 'Gurugram'} — and keep you updated every step of the way.
          </p>
          <p className="mt-4 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-brand-200 ring-1 ring-white/10">
            <strong className="text-white">Not an emergency service.</strong> We do not diagnose, prescribe, treat or replace doctors, nurses, ambulances or emergency medical services.
            In an emergency call {c?.emergency.primary_number || '112'} or {c?.emergency.ambulance_number || '108'}.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-300">Contact</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a className="hover:text-white" href={telHref(c)}>{c?.contact.support_phone_display}</a></li>
            <li><a className="hover:text-white" href={`mailto:${c?.contact.support_email}`}>{c?.contact.support_email}</a></li>
            <li className="text-brand-300">{c?.contact.support_hours}</li>
            <li className="text-brand-300">Serving {c?.service_areas.map((a) => a.name).join(', ') || 'Gurugram'}</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-300">Company</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/track-lookup">Track a request</Link></li>
            <li><Link className="hover:text-white" to="/book">Book online</Link></li>
            <li><Link className="hover:text-white" to="/safety">Safety & medical boundary</Link></li>
            <li><Link className="hover:text-white" to="/privacy">Privacy notice</Link></li>
            <li><Link className="hover:text-white" to="/terms">Terms of service</Link></li>
            <li><Link className="hover:text-white" to="/companion">Companion app</Link></li>
            <li><Link className="hover:text-white" to="/ops">Operations login</Link></li>
            {c?.demo_mode && <li><Link className="hover:text-white" to="/demo">Demo guide</Link></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-brand-300">© {new Date().getFullYear()} ChampOnCall. All rights reserved.</div>
    </footer>
  );
}

export function PublicShell({ children, footer = true, ctaBar = true }: { children: React.ReactNode; footer?: boolean; ctaBar?: boolean }) {
  return (
    <div className="min-h-screen bg-warm-50">
      <PublicHeader />
      <main>{children}</main>
      {footer && <PublicFooter />}
      {ctaBar && <MobileCTABar />}
    </div>
  );
}
