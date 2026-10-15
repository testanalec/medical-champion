// Build-time renderer: turns the public pages into static HTML (run by scripts/build.mjs, never shipped to browsers).
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RouterProvider } from './lib/router';
import { ConfigProvider, PublicConfig } from './lib/config';
import { ToastProvider } from './components/ui';
import App from './App';
import { FAQ } from './pages/public/Landing';
import { SITE_URL, OG_IMAGE, LEGAL, HOURS, withGst } from '../shared/site';

export function renderPage(path: string, config: PublicConfig): string {
  return renderToString(
    <RouterProvider initialPath={path}>
      <ConfigProvider initial={config}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ConfigProvider>
    </RouterProvider>,
  );
}

/** schema.org markup for the home page: LocalBusiness, Service and FAQPage. */
export function homeSchema(c: PublicConfig): object[] {
  const general: any = c.pricing.find((p: any) => p.service_type === '*') || c.pricing[0];
  const bizId = `${SITE_URL}/#business`;
  const address: Record<string, string> = {
    '@type': 'PostalAddress',
    addressLocality: LEGAL.locality,
    addressRegion: LEGAL.region,
    addressCountry: LEGAL.country,
  };
  if (LEGAL.address) address.streetAddress = LEGAL.address;
  if (LEGAL.postal_code) address.postalCode = LEGAL.postal_code;
  const business: any = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': bizId,
    name: c.brand.name,
    legalName: LEGAL.name,
    description: 'Verified companions who accompany elderly parents to hospitals, OPD visits, diagnostic tests, admission and discharge in Gurugram, with live WhatsApp updates for the family.',
    url: SITE_URL + '/',
    logo: `${SITE_URL}/logo-mark.svg`,
    image: OG_IMAGE,
    telephone: c.contact.support_phone,
    email: c.contact.support_email,
    address,
    areaServed: { '@type': 'City', name: c.brand.city || 'Gurugram' },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: HOURS.opens,
      closes: HOURS.closes,
    }],
    priceRange: general ? `₹${Number(general.base_fee).toLocaleString('en-IN')}+` : undefined,
    sameAs: [`https://wa.me/${String(c.contact.whatsapp_number || '').replace(/\D/g, '')}`],
  };
  if (LEGAL.gstin) business.taxID = LEGAL.gstin;
  const offers = c.pricing.map((p: any) => ({
    '@type': 'Offer',
    name: p.name,
    price: withGst(p.base_fee, p.tax_percent),
    priceCurrency: 'INR',
    description: `${p.name}: ₹${Number(p.base_fee).toLocaleString('en-IN')} + ${p.tax_percent}% GST for the first ${p.included_minutes / 60} hours, then ₹${Number(p.extension_rate_per_hour).toLocaleString('en-IN')}/hour + GST.`,
    priceSpecification: { '@type': 'UnitPriceSpecification', price: withGst(p.base_fee, p.tax_percent), priceCurrency: 'INR', valueAddedTaxIncluded: true },
    availability: 'https://schema.org/InStock',
    areaServed: { '@type': 'City', name: c.brand.city || 'Gurugram' },
  }));
  const service = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Hospital companion for elderly parents',
    serviceType: 'Hospital accompaniment and patient companion service',
    description: 'A verified companion picks up your parent, accompanies them through registration, OPD consultations, diagnostic tests, pharmacy, admission or discharge, and brings them home — with WhatsApp updates at every step. Not a medical or emergency service.',
    provider: { '@id': bizId },
    areaServed: { '@type': 'City', name: c.brand.city || 'Gurugram' },
    url: SITE_URL + '/',
    offers,
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return [business, service, faq];
}

export { PUBLIC_PAGES, SITE_URL, OG_IMAGE, NOT_FOUND_META } from '../shared/site';
