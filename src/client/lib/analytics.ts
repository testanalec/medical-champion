// Google Analytics 4 for the public website (customer pages only — never the Ops portal or the Companion app).
// The Measurement ID comes from Ops → Settings → Contact → Google Analytics, or the GA_MEASUREMENT_ID env var.
declare global {
  interface Window { dataLayer?: any[]; gtag?: (...args: any[]) => void }
}

let started = false;
const isInternal = () => location.pathname.startsWith('/ops') || location.pathname.startsWith('/companion');

let clarityStarted = false;
// Pages that show a booking's private details are never recorded (Clarity runs with Strict masking elsewhere)
const isPrivatePage = () => /^\/(track|pay)\//.test(location.pathname);
let clarityPaused = false;
function syncClarity() {
  const w = window as any;
  if (!clarityStarted || !w.clarity) return;
  const shouldPause = isPrivatePage() || isInternal();
  if (shouldPause && !clarityPaused) { w.clarity('stop'); clarityPaused = true; }
  else if (!shouldPause && clarityPaused) { w.clarity('start'); clarityPaused = false; }
}
/** Microsoft Clarity (heatmaps & session recordings) — public marketing pages only, never Ops, the Champ app, tracking or payment pages. */
function initClarity(id: string | null | undefined) {
  if (clarityStarted || !id || !/^[a-z0-9]{6,20}$/i.test(id) || isInternal() || isPrivatePage()) return;
  clarityStarted = true;
  window.addEventListener('mc:navigate', syncClarity);
  window.addEventListener('popstate', syncClarity);
  const w = window as any;
  w.clarity = w.clarity || function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

export function initAnalytics(id: string | null | undefined, clarityId?: string | null) {
  initClarity(clarityId);
  if (!isInternal()) watchPhoneLinks();
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

let linksWatched = false;
/** One listener for every phone link on the public site: support numbers → call_click, 112/108 → emergency_call_click. */
function watchPhoneLinks() {
  if (linksWatched) return;
  linksWatched = true;
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="tel:"]') as HTMLAnchorElement | null;
    if (!a) return;
    const num = a.getAttribute('href')!.slice(4).replace(/[^\d+]/g, '');
    const emergency = num.length <= 4;
    const place = a.closest('footer') ? 'footer' : a.closest('header') ? 'header' : a.closest('.fixed') ? 'mobile_bar' : 'page';
    track(emergency ? 'emergency_call_click' : 'call_click', { page: location.pathname, place, ...(emergency ? { number: num } : {}) });
  }, { capture: true });
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
