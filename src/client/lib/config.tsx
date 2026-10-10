import React, { createContext, useContext, useEffect, useState } from 'react';
import { get } from './api';
import { initAnalytics } from './analytics';

export interface PublicConfig {
  brand: { name: string; tagline: string; city: string };
  contact: { support_phone: string; support_phone_display: string; whatsapp_number: string; whatsapp_prefill: string; support_email: string; support_hours: string };
  emergency: { primary_number: string; primary_label: string; ambulance_number: string; ambulance_label: string };
  service_types: { id: string; label: string }[];
  pricing: any[];
  service_areas: { name: string; city: string }[];
  verification_claims: string[];
  lists: { languages: string[] };
  demo_mode: boolean;
  analytics?: { ga_id: string | null };
  demo_accounts?: [string, string, string][];
  integrations: { whatsapp: boolean; razorpay: boolean; sms: boolean };
}

const Ctx = createContext<{ config: PublicConfig | null; reload: () => void }>({ config: null, reload: () => {} });

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const load = () => get<PublicConfig>('/api/v1/public/config').then((c) => { setConfig(c); initAnalytics(c.analytics?.ga_id); }).catch(() => setTimeout(load, 3000));
  useEffect(() => { load(); }, []);
  return <Ctx.Provider value={{ config, reload: load }}>{children}</Ctx.Provider>;
}
export const useConfig = () => useContext(Ctx).config;
export const useConfigReload = () => useContext(Ctx).reload;

// ---- campaign attribution (FR-WEB-002)
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref'];
export function captureUtm() {
  try {
    const q = new URLSearchParams(location.search);
    const found: Record<string, string> = {};
    for (const k of UTM_KEYS) { const v = q.get(k); if (v) found[k] = v.slice(0, 80); }
    if (Object.keys(found).length) sessionStorage.setItem('mc_utm', JSON.stringify({ ...found, landing: location.pathname, at: new Date().toISOString() }));
  } catch { /* storage unavailable */ }
}
export function getUtm(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem('mc_utm') || '{}'); } catch { return {}; }
}

export function whatsappHref(c: PublicConfig | null) {
  const utm = getUtm();
  if (c?.contact.whatsapp_number) {
    return `https://wa.me/${c.contact.whatsapp_number.replace(/[^\d]/g, '')}?text=${encodeURIComponent(c.contact.whatsapp_prefill || 'Hi')}`;
  }
  const qs = new URLSearchParams(utm as any).toString();
  return `/whatsapp${qs ? '?' + qs : ''}`;
}
export const telHref = (c: PublicConfig | null) => `tel:${c?.contact.support_phone || ''}`;
