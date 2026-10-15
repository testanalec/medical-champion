// Public website facts used by the pages, the prerendered HTML, schema markup, robots.txt and sitemap.xml.
export const SITE_URL = 'https://www.champoncall.com';
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

/** Legal entity shown in the footer and in schema markup. Fill gstin/address to publish them. */
export const LEGAL = {
  name: 'FBN Services India',
  gstin: '',
  address: '',
  locality: 'Gurugram',
  region: 'Haryana',
  postal_code: '',
  country: 'IN',
};

export const HOURS = { opens: '07:00', closes: '23:00', label: '7 AM – 11 PM, all days' };

/** Price including GST, rounded to the rupee (₹1,499 + 18% = ₹1,769). */
export const withGst = (fee: number | string, taxPercent: number | string) => Math.round(Number(fee) * (1 + Number(taxPercent || 0) / 100));

export interface PageMeta { path: string; title: string; description: string; priority: number }

/** Indexable public pages. Everything else (ops, companion, tracking, payment, demo) is noindex. */
export const PUBLIC_PAGES: PageMeta[] = [
  {
    path: '/',
    title: 'ChampOnCall — Hospital companion for your parents in Gurugram',
    description: 'Verified companions who take your parents to hospital, OPD, diagnostics, admission or discharge in Gurugram — with live WhatsApp updates. From ₹1,499 (₹1,769 incl. GST). 7 AM – 11 PM.',
    priority: 1.0,
  },
  {
    path: '/book',
    title: 'Book a hospital companion in Gurugram | ChampOnCall',
    description: 'Request a verified companion for an OPD visit, test, admission or discharge in Gurugram. Pay after the visit. Not an emergency service.',
    priority: 0.8,
  },
  {
    path: '/safety',
    title: 'Safety & medical boundary | ChampOnCall',
    description: 'How ChampOnCall verifies and trains companions, what they do and do not do, and how our operations team handles emergencies.',
    priority: 0.6,
  },
  {
    path: '/track-lookup',
    title: 'Track your companion request | ChampOnCall',
    description: 'Follow your ChampOnCall request live — companion assigned, arrived, at the hospital and home safely.',
    priority: 0.4,
  },
  {
    path: '/privacy',
    title: 'Privacy notice | ChampOnCall',
    description: 'What information ChampOnCall collects, why, who can see it and how long it is kept.',
    priority: 0.3,
  },
  {
    path: '/terms',
    title: 'Terms of service | ChampOnCall',
    description: 'The terms for using ChampOnCall hospital companion services in Gurugram.',
    priority: 0.3,
  },
];

export const NOT_FOUND_META = { title: 'Page not found | ChampOnCall', description: 'We couldn’t find that page.' };
export const APP_META = { title: 'ChampOnCall', description: 'ChampOnCall' };

export const metaFor = (path: string) => PUBLIC_PAGES.find((p) => p.path === path);
