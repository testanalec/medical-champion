import React, { createContext, useContext, useEffect, useState } from 'react';

const RouteCtx = createContext<{ path: string; search: URLSearchParams }>({ path: '/', search: new URLSearchParams() });

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event('mc:navigate'));
  if (!to.includes('#')) window.scrollTo({ top: 0 });
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const read = () => ({ path: location.pathname, search: new URLSearchParams(location.search) });
  const [state, setState] = useState(read);
  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener('popstate', on);
    window.addEventListener('mc:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('mc:navigate', on);
    };
  }, []);
  return <RouteCtx.Provider value={state}>{children}</RouteCtx.Provider>;
}

export const useRoute = () => useContext(RouteCtx);

export function match(pattern: string, path: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  const m = re.exec(path);
  if (!m) return null;
  const out: Record<string, string> = {};
  keys.forEach((k, i) => (out[k] = decodeURIComponent(m[i + 1])));
  return out;
}

export function Link({ to, className, children, onClick, ...rest }: { to: string; className?: string; children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'>) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || (rest as any).target === '_blank') return;
        if (to.startsWith('http') || to.startsWith('tel:') || to.startsWith('mailto:')) return;
        e.preventDefault();
        if (to.startsWith('#')) {
          document.querySelector(to)?.scrollIntoView({ behavior: 'smooth' });
          return;
        }
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
