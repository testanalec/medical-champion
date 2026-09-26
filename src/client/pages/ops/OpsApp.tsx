import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  FiGrid, FiList, FiUsers, FiUserCheck, FiAlertOctagon, FiCreditCard, FiBarChart2, FiSettings, FiShield, FiBell, FiLogOut,
  FiMenu, FiX, FiMessageSquare, FiFileText, FiPlus, FiSearch, FiSend,
} from 'react-icons/fi';
import { get, post, useApi } from '../../lib/api';
import { useRoute, match, navigate, Link } from '../../lib/router';
import { Button, Field, Input, Logo, PageLoader, cx, useToast, Badge, ago } from '../../components/ui';
import Board from './Board';
import Requests, { NewRequest } from './Requests';
import RequestDetail from './RequestDetail';
import { Companions, CompanionDetail } from './Companions';
import { Customers, CustomerDetail } from './Customers';
import Incidents from './Incidents';
import { Payments, Expenses } from './Finance';
import Reports from './Reports';
import { Alerts, NotificationLog, Conversations } from './Comms';
import { Settings, Users, Audit } from './Admin';

interface OpsUser { id: string; name: string; email: string; role_id: string; role_name: string; permissions: string[] }
const OpsCtx = createContext<{ user: OpsUser; can: (p: string) => boolean }>({ user: null as any, can: () => false });
export const useOps = () => useContext(OpsCtx);

export default function OpsApp() {
  const { path } = useRoute();
  const [user, setUser] = useState<OpsUser | null | undefined>(undefined);
  const load = () => get('/api/v1/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null));
  useEffect(() => { load(); }, []);
  if (user === undefined) return <PageLoader />;
  if (!user || path === '/ops/login') return <Login onDone={load} signedIn={!!user} />;
  const can = (p: string) => user.permissions.includes(p);
  return (
    <OpsCtx.Provider value={{ user, can }}>
      <Shell><OpsRoutes /></Shell>
    </OpsCtx.Provider>
  );
}

function OpsRoutes() {
  const { path } = useRoute();
  let m: any;
  if (path === '/ops' || path === '/ops/') return <Board />;
  if (path === '/ops/requests') return <Requests />;
  if (path === '/ops/requests/new') return <NewRequest />;
  if ((m = match('/ops/requests/:id', path))) return <RequestDetail key={m.id} id={m.id} />;
  if (path === '/ops/companions') return <Companions />;
  if ((m = match('/ops/companions/:id', path))) return <CompanionDetail key={m.id} id={m.id} />;
  if (path === '/ops/customers') return <Customers />;
  if ((m = match('/ops/customers/:id', path))) return <CustomerDetail key={m.id} id={m.id} />;
  if (path === '/ops/incidents') return <Incidents />;
  if (path === '/ops/payments') return <Payments />;
  if (path === '/ops/expenses') return <Expenses />;
  if (path === '/ops/reports') return <Reports />;
  if (path === '/ops/alerts') return <Alerts />;
  if (path === '/ops/notifications') return <NotificationLog />;
  if (path === '/ops/whatsapp') return <Conversations />;
  if (path === '/ops/settings') return <Settings />;
  if (path === '/ops/users') return <Users />;
  if (path === '/ops/audit') return <Audit />;
  return <p className="p-10 text-center text-slate-500">Page not found</p>;
}

const NAV: { to: string; label: string; icon: React.ReactNode; perm?: string; group?: string }[] = [
  { to: '/ops', label: 'Live queue', icon: <FiGrid />, perm: 'request.view' },
  { to: '/ops/requests', label: 'Requests', icon: <FiList />, perm: 'request.view' },
  { to: '/ops/alerts', label: 'Alerts', icon: <FiBell />, perm: 'request.view' },
  { to: '/ops/companions', label: 'Companions', icon: <FiUserCheck />, perm: 'companion.view' },
  { to: '/ops/customers', label: 'Customers', icon: <FiUsers />, perm: 'customer.view' },
  { to: '/ops/incidents', label: 'Incidents', icon: <FiAlertOctagon />, perm: 'request.view' },
  { to: '/ops/payments', label: 'Payments', icon: <FiCreditCard />, perm: 'payment.view', group: 'Finance' },
  { to: '/ops/expenses', label: 'Expenses', icon: <FiFileText />, perm: 'request.view', group: 'Finance' },
  { to: '/ops/reports', label: 'Reports', icon: <FiBarChart2 />, perm: 'report.view', group: 'Insights' },
  { to: '/ops/whatsapp', label: 'WhatsApp', icon: <FiMessageSquare />, perm: 'whatsapp.view', group: 'Insights' },
  { to: '/ops/notifications', label: 'Notifications', icon: <FiSend />, perm: 'request.view', group: 'Insights' },
  { to: '/ops/settings', label: 'Settings', icon: <FiSettings />, perm: 'request.view', group: 'Admin' },
  { to: '/ops/users', label: 'Users & roles', icon: <FiUsers />, perm: 'user.manage', group: 'Admin' },
  { to: '/ops/audit', label: 'Audit log', icon: <FiShield />, perm: 'audit.view', group: 'Admin' },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { user, can } = useOps();
  const { path } = useRoute();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: alerts, reload } = useApi<any[]>('/api/v1/alerts?unacked=1', { poll: 8000 });
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!alerts) return;
    if (seen.current) {
      for (const a of alerts) {
        if (!seen.current.has(a.id) && ['URGENT', 'CRITICAL'].includes(a.severity)) {
          toast(a.severity === 'CRITICAL' ? 'error' : 'info', a.title);
          try { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.frequency.value = a.severity === 'CRITICAL' ? 880 : 660; o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15); } catch { /* audio blocked */ }
        }
      }
    }
    seen.current = new Set(alerts.map((a) => a.id));
  }, [alerts]);
  const active = (to: string) => (to === '/ops' ? path === '/ops' || path === '/ops/' : path.startsWith(to));
  const groups = ['', 'Finance', 'Insights', 'Admin'];
  const logout = async () => { await post('/api/v1/auth/logout'); location.href = '/ops/login'; };
  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Link to="/ops"><Logo /></Link></div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((g) => {
          const items = NAV.filter((n) => (n.group || '') === g && (!n.perm || can(n.perm)));
          if (!items.length) return null;
          return (
            <div key={g}>
              {g && <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{g}</p>}
              {items.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
                  className={cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', active(n.to) ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-ink')}>
                  <span className="text-base">{n.icon}</span>{n.label}
                  {n.to === '/ops/alerts' && alerts && alerts.length > 0 && <span className={cx('ml-auto rounded-full px-1.5 text-[11px] font-bold', active(n.to) ? 'bg-white/20' : 'bg-coral-500 text-white')}>{alerts.length}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{user.name.split(' ').map((x) => x[0]).join('')}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-slate-500">{user.role_name}</p></div>
          <button onClick={logout} className="btn btn-ghost p-2" title="Sign out" data-testid="logout"><FiLogOut /></button>
        </div>
      </div>
    </nav>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-lift">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="btn btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><FiMenu className="h-5 w-5" /></button>
          <form className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(/^mc-\d+$/i.test(q.trim()) ? `/ops/requests/${q.trim().toUpperCase()}` : `/ops/requests?q=${encodeURIComponent(q.trim())}`); }}>
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search MC-10452, customer, phone…" className="w-full rounded-xl bg-slate-100 py-2 pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-brand-200" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            {can('request.create') && <Link to="/ops/requests/new" className="btn btn-primary btn-sm hidden sm:inline-flex"><FiPlus /> Phone booking</Link>}
            <AlertBell alerts={alerts || []} reload={reload} />
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function AlertBell({ alerts, reload }: { alerts: any[]; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const critical = alerts.some((a) => a.severity === 'CRITICAL');
  return (
    <div className="relative">
      <button className={cx('btn btn-ghost relative p-2', critical && 'text-red-600')} onClick={() => setOpen(!open)} aria-label="Alerts" data-testid="alert-bell">
        <FiBell className="h-5 w-5" />
        {alerts.length > 0 && <span className={cx('absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white', critical ? 'bg-red-600' : 'bg-coral-500')}>{alerts.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold">Unacknowledged alerts</p>
              {alerts.length > 0 && <button className="text-xs font-semibold text-brand-700" onClick={async () => { await post('/api/v1/alerts/ack-all'); reload(); }}>Acknowledge all</button>}
            </div>
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {alerts.length === 0 && <li className="p-6 text-center text-sm text-slate-500">All caught up 🎉</li>}
              {alerts.slice(0, 20).map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.severity === 'CRITICAL' ? 'bg-red-600' : a.severity === 'URGENT' ? 'bg-coral-500' : a.severity === 'WARNING' ? 'bg-amber-500' : 'bg-sky-500')} />
                  <button className="min-w-0 flex-1 text-left" onClick={async () => { await post(`/api/v1/alerts/${a.id}/ack`); reload(); setOpen(false); if (a.request_id) navigate(`/ops/requests/${a.request_id}`); }}>
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="line-clamp-2 text-xs text-slate-500">{a.body}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{ago(a.created_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
            <Link to="/ops/alerts" onClick={() => setOpen(false)} className="block border-t border-slate-100 py-2.5 text-center text-xs font-semibold text-brand-700">View all alerts</Link>
          </div>
        </>
      )}
    </div>
  );
}

function Login({ onDone, signedIn }: { onDone: () => void; signedIn: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (signedIn) navigate('/ops', true); }, [signedIn]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await post('/api/v1/auth/login', { email, password }); navigate('/ops', true); onDone(); }
    catch (er: any) { setErr(er.message); } finally { setBusy(false); }
  };
  const demo = [['Admin', 'admin@medicalchampion.in', 'Admin@123'], ['Manager', 'manager@medicalchampion.in', 'Manager@123'], ['Agent', 'agent@medicalchampion.in', 'Agent@123'], ['Finance', 'finance@medicalchampion.in', 'Finance@123'], ['Support', 'support@medicalchampion.in', 'Support@123']];
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-800 to-brand-950 p-12 text-white lg:flex">
        <Logo light />
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight">Operations control centre</h1>
          <p className="mt-4 max-w-md text-brand-100">Every request, every companion, every update — in one place. Someone trustworthy is taking ownership; the family knows what’s happening; and you can intervene the moment something goes wrong.</p>
        </div>
        <p className="text-xs text-brand-300">Access is logged and audited.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden"><Logo /></div>
          <h2 className="mt-8 text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Operations, finance and admin staff</p>
          <Field label="Work email" className="mt-6"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required data-testid="login-email" /></Field>
          <Field label="Password" className="mt-4"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required data-testid="login-password" /></Field>
          {err && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{err}</p>}
          <Button className="btn-primary mt-6 w-full py-3" loading={busy} data-testid="login-submit">Sign in</Button>
          <div className="mt-8 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Demo accounts</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {demo.map(([r, e, p]) => <button type="button" key={r} className="btn btn-secondary btn-sm" onClick={() => { setEmail(e); setPassword(p); }}>{r}</button>)}
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500"><Link to="/" className="underline">Back to website</Link> · <Link to="/companion" className="underline">Companion app</Link></p>
        </form>
      </div>
    </div>
  );
}

export { Badge };
