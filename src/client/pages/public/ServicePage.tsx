import React from 'react';
import { FiCheck, FiShield, FiCreditCard, FiAlertTriangle } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { PublicShell, WhatsAppCTA, CallCTA } from '../../components/public';
import { useConfig } from '../../lib/config';
import { Link } from '../../lib/router';
import { fmtINR } from '../../../shared/constants';
import { withGst } from '../../../shared/site';
import { FaqItem } from './Landing';
import { ServicePageContent, SERVICE_PAGES } from './serviceContent';

/** SEO landing page for one service (OPD visits, discharge, NRI families). Layout reuses the home page styles. */
export default function ServicePage({ page }: { page: ServicePageContent }) {
  const c = useConfig();
  const general = c?.pricing.find((p) => p.service_type === '*') || c?.pricing[0];
  const others = SERVICE_PAGES.filter((p) => p.path !== page.path);
  return (
    <PublicShell>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-brand-100),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 md:pt-16">
          <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link to="/" className="underline">Home</Link> / {page.serviceName}</nav>
          <p className="kicker mt-6">{page.kicker}</p>
          <h1 className="mt-2 max-w-3xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-brand-950 sm:text-6xl">{page.h1}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">{page.lead}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <WhatsAppCTA label="BOOK ON WHATSAPP" />
            <CallCTA />
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
            <li className="flex items-center gap-1.5"><FiShield className="text-brand-600" /> Background-verified companions</li>
            <li className="flex items-center gap-1.5"><FaWhatsapp className="text-wa" /> Live WhatsApp updates</li>
            <li className="flex items-center gap-1.5"><FiCreditCard className="text-brand-600" /> Pay after the visit</li>
          </ul>
        </div>
      </section>

      {/* EMERGENCY STRIP */}
      <div className="border-y border-red-100 bg-red-50/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3 text-center text-sm text-red-900">
          <FiAlertTriangle className="shrink-0" />
          <span><strong>Medical emergency?</strong> We are not an ambulance or emergency service. Call <a className="font-bold underline" href={`tel:${c?.emergency.primary_number || '112'}`}>{c?.emergency.primary_number || '112'}</a> or <a className="font-bold underline" href={`tel:${c?.emergency.ambulance_number || '108'}`}>{c?.emergency.ambulance_number || '108'}</a> immediately.</span>
        </div>
      </div>

      {/* INCLUDED */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">{page.includedTitle}</h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.included.map(([t, d]) => (
              <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-warm-200">
                <h3 className="flex items-center gap-2 font-bold"><FiCheck className="shrink-0 text-brand-600" />{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">{page.stepsTitle}</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {page.steps.map(([t, d], i) => (
              <li key={t}>
                <div className="flex items-center gap-3 md:block">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 font-display text-lg font-semibold text-white shadow-soft">{i + 1}</span>
                  <h3 className="font-bold text-ink md:mt-4">{t}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* WHO + PRICE */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-warm-50 p-7 ring-1 ring-warm-200">
            <h2 className="font-display text-2xl font-semibold text-brand-950">{page.whoTitle}</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
              {page.who.map((t) => <li key={t} className="flex gap-2"><FiCheck className="mt-0.5 shrink-0 text-emerald-600" />{t}</li>)}
            </ul>
          </div>
          <div className="rounded-3xl bg-white p-7 shadow-lift ring-2 ring-brand-600">
            <h2 className="font-display text-2xl font-semibold text-brand-950">Simple pricing</h2>
            {general && (
              <>
                <p className="mt-4 flex items-baseline gap-1"><span className="font-display text-5xl font-semibold text-brand-950">{fmtINR(general.base_fee)}</span>{Number(general.tax_percent) > 0 && <span className="text-sm text-slate-500">+ GST</span>}</p>
                {Number(general.tax_percent) > 0 && <p className="mt-1 text-sm font-semibold text-brand-800">{fmtINR(withGst(general.base_fee, general.tax_percent))} incl. {Number(general.tax_percent)}% GST</p>}
                <p className="mt-1 text-sm text-slate-600">first {general.included_minutes / 60} hours · then {fmtINR(general.extension_rate_per_hour)}/hour</p>
              </>
            )}
            <p className="mt-4 text-sm text-slate-600">{page.priceNote}</p>
            <WhatsAppCTA size="md" className="mt-6 w-full" label="Book on WhatsApp" />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-center font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">Questions families ask</h2>
          <div className="mt-10 divide-y divide-warm-200 rounded-3xl bg-white ring-1 ring-warm-200">
            {page.faq.map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}
          </div>
        </div>
      </section>

      {/* CTA + related */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-14 text-center text-white shadow-lift sm:px-12">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">{page.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">Tell us who needs help. A real person on our team will take it from there.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <WhatsAppCTA />
            <CallCTA className="!bg-white/10 !text-white !ring-white/30 hover:!bg-white/20" />
          </div>
          <p className="mt-6 text-sm text-brand-200">
            Also see: {others.map((o, i) => <React.Fragment key={o.path}>{i > 0 && ' · '}<Link to={o.path} className="font-semibold text-white underline">{o.serviceName}</Link></React.Fragment>)} · <Link to="/" className="font-semibold text-white underline">All services</Link>
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
