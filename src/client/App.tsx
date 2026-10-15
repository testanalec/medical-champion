import React, { useEffect } from 'react';
import { useRoute, match } from './lib/router';
import { captureUtm } from './lib/config';
import Landing from './pages/public/Landing';
import WhatsAppDemo from './pages/public/WhatsAppDemo';
import Track, { TrackLookup } from './pages/public/Track';
import Pay from './pages/public/Pay';
import Book from './pages/public/Book';
import { Privacy, Terms, Safety, DemoGuide, NotFound } from './pages/public/Info';
import OpsApp from './pages/ops/OpsApp';
import CompanionApp from './pages/companion/CompanionApp';
import { metaFor, SITE_URL, NOT_FOUND_META } from '../shared/site';

/** Keeps <title>, description, canonical and robots in step with in-app navigation. */
function useSeo(path: string, known: boolean) {
  useEffect(() => {
    const m = metaFor(path);
    const setMeta = (sel: string, attr: string, val: string) => {
      let el = document.head.querySelector(sel) as HTMLElement | null;
      if (!el) {
        el = document.createElement(sel.startsWith('link') ? 'link' : 'meta');
        const [, k, v] = /\[(\w+)="([^"]+)"\]/.exec(sel)!;
        el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, val);
    };
    if (m) {
      document.title = m.title;
      setMeta('meta[name="description"]', 'content', m.description);
      setMeta('link[rel="canonical"]', 'href', SITE_URL + m.path);
      setMeta('meta[name="robots"]', 'content', 'index,follow');
    } else {
      if (!known) document.title = NOT_FOUND_META.title;
      document.head.querySelector('link[rel="canonical"]')?.remove();
      setMeta('meta[name="robots"]', 'content', 'noindex');
    }
  }, [path, known]);
}

export function routeElement(path: string): [React.ReactElement, boolean] {
  let m: any;
  if (path.startsWith('/ops')) return [<OpsApp />, true];
  if (path.startsWith('/companion')) return [<CompanionApp />, true];
  if (path === '/') return [<Landing />, true];
  if (path === '/whatsapp') return [<WhatsAppDemo />, true];
  if (path === '/book') return [<Book />, true];
  if (path === '/track-lookup') return [<TrackLookup />, true];
  if ((m = match('/track/:number', path))) return [<Track key={m.number} number={m.number} />, true];
  if ((m = match('/pay/:id', path))) return [<Pay id={m.id} />, true];
  if (path === '/privacy') return [<Privacy />, true];
  if (path === '/terms') return [<Terms />, true];
  if (path === '/safety') return [<Safety />, true];
  if (path === '/demo') return [<DemoGuide />, true];
  return [<NotFound />, false];
}

export default function App() {
  const { path } = useRoute();
  useEffect(() => { captureUtm(); }, []);
  const [el, known] = routeElement(path);
  useSeo(path, known);
  return el;
}
