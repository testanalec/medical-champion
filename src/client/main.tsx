import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from './lib/router';
import { ConfigProvider } from './lib/config';
import { ToastProvider } from './components/ui';
import App from './App';

// Public pages arrive as prerendered HTML (for search engines and link previews); the app then takes over the page.
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
