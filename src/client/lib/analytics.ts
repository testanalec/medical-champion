// Google Analytics 4 for the public website (customer pages only — never the Ops portal or the Companion app).
// The Measurement ID comes from Ops → Settings → Contact → Google Analytics, or the GA_MEASUREMENT_ID env var.
declare global {
  interface Window { dataLayer?: any[]; gtag?: (...args: any[]) => void }
}

let started = false;
const isInternal = () => location.pathname.startsWith('/ops') || location.pathname.startsWith('/companion');

export function initAnalytics(id: string | null | undefined) {
  if (started || !id || isInternal()) return;
  started = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  // Page views are sent by us on every in-app navigation (single-page site)
  // Every hit carries the page address; strip the query string (tracking tokens) from all of them
  window.gtag('set', { page_location: location.origin + location.pathname });
  window.gtag('config', id, { send_page_view: false, anonymize_ip: true, page_location: location.origin + location.pathname });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
  pageView();
  window.addEventListener('mc:navigate', pageView);
  window.addEventListener('popstate', pageView);
}

function pageView() {
  if (!window.gtag || isInternal()) return;
  // Tracking tokens in URLs are private: send the path only, never the query string
  window.gtag('set', { page_location: location.origin + location.pathname });
  window.gtag('event', 'page_view', { page_path: location.pathname, page_location: location.origin + location.pathname, page_title: document.title });
}

/** Custom event, e.g. track('whatsapp_click', { place: 'hero' }). Safe to call when analytics is off. */
export function track(event: string, params: Record<string, any> = {}) {
  try {
    if (window.gtag && !isInternal()) window.gtag('event', event, params);
  } catch { /* analytics must never break the site */ }
}
