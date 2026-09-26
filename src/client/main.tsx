import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, useRoute, match } from './lib/router';
import { ConfigProvider, captureUtm } from './lib/config';
import { ToastProvider } from './components/ui';
import Landing from './pages/public/Landing';
import WhatsAppDemo from './pages/public/WhatsAppDemo';
import Track, { TrackLookup } from './pages/public/Track';
import Pay from './pages/public/Pay';
import Book from './pages/public/Book';
import { Privacy, Terms, Safety, DemoGuide, NotFound } from './pages/public/Info';
import OpsApp from './pages/ops/OpsApp';
import CompanionApp from './pages/companion/CompanionApp';

function App() {
  const { path } = useRoute();
  useEffect(() => { captureUtm(); }, []);
  if (path.startsWith('/ops')) return <OpsApp />;
  if (path.startsWith('/companion')) return <CompanionApp />;
  let m: any;
  if (path === '/') return <Landing />;
  if (path === '/whatsapp') return <WhatsAppDemo />;
  if (path === '/book') return <Book />;
  if (path === '/track-lookup') return <TrackLookup />;
  if ((m = match('/track/:number', path))) return <Track key={m.number} number={m.number} />;
  if ((m = match('/pay/:id', path))) return <Pay id={m.id} />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/terms') return <Terms />;
  if (path === '/safety') return <Safety />;
  if (path === '/demo') return <DemoGuide />;
  return <NotFound />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider>
      <ConfigProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ConfigProvider>
    </RouterProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
