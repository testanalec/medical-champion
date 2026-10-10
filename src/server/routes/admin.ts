import { sql, resetDatabase } from '../db';
import { Router, bad, notFound, str, num, normalizePhone, conflict } from '../http';
import { requireUser, can, audit, hashPassword, PERMISSIONS } from '../auth';
import { getAllSettings, setSetting, DEFAULT_SETTINGS, getSetting, integrationStatus } from '../settings';
import { ensureEmailColumns, validEmail, sendEmail, emailConfigured } from '../email';
import { companionStats, verificationComplete } from '../dispatch';
import { GAZETTEER } from '../geo';
import { VERIFICATION_CONTROLS, isUrgent, SERVICE_TYPE_LABEL } from '../../shared/constants';
import { listMetaTemplates, syncMetaTemplates } from '../wa';
import { DEMO_USERS } from '../seed';
import { ensureCompanionPasswordColumns } from './companion';
import crypto from 'node:crypto';

// Operational tables emptied by the go-live reset. Configuration (settings, roles, users, pricing, service areas,
// message templates) is kept. status_events / audit_logs are immutable per row; TRUNCATE is the sanctioned wipe.
const GO_LIVE_TABLES = [
  'wa_messages', 'wa_conversations', 'notifications', 'escalations', 'incidents', 'trust_responses', 'ratings', 'expenses',
  'refunds', 'payment_events', 'payments', 'files', 'status_events', 'assignments', 'service_requests', 'locations',
  'patients', 'customers', 'companions', 'otp_codes', 'idempotency_keys', 'audit_logs',
];

const median = (arr: number[]) => {
  const a = arr.filter((x) => x != null && !isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mins = (a: any, b: any) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 60000 : null);

export async function buildReport(from: string, to: string) {
  const reqs = await sql`
    SELECT r.*, pl.address AS pickup_address, sa.name AS zone
    FROM service_requests r LEFT JOIN locations pl ON pl.id = r.pickup_location_id LEFT JOIN service_areas sa ON sa.id = r.service_area_id
    WHERE r.created_at >= ${from}::date AND r.created_at < ${to}::date + 1`;
  const ids = reqs.map((r: any) => r.id);
  const [assignments, payments, expenses, ratings, trust, incidents, customers] = await Promise.all([
    sql`SELECT * FROM assignments WHERE request_id = ANY(${ids})`,
    sql`SELECT * FROM payments WHERE request_id = ANY(${ids}) AND status <> 'CANCELLED'`,
    sql`SELECT * FROM expenses WHERE request_id = ANY(${ids}) AND approval_status = 'APPROVED'`,
    sql`SELECT * FROM ratings WHERE request_id = ANY(${ids})`,
    sql`SELECT * FROM trust_responses WHERE request_id = ANY(${ids})`,
    sql`SELECT * FROM incidents WHERE created_at >= ${from}::date AND created_at < ${to}::date + 1`,
    sql`SELECT c.id, c.source, (SELECT count(*)::int FROM service_requests r WHERE r.customer_id = c.id) AS n FROM customers c
        WHERE EXISTS (SELECT 1 FROM service_requests r WHERE r.customer_id = c.id AND r.created_at >= ${from}::date AND r.created_at < ${to}::date + 1)`,
  ]);
  const sla = await getSetting('sla');
  const payout = await getSetting('payout');
  const ist = (d: any) => new Date(new Date(d).getTime() + 330 * 60000);

  // ---- Demand
  const byDay: Record<string, number> = {};
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d = new Date(d.getTime() + 86400000)) byDay[d.toISOString().slice(0, 10)] = 0;
  const byHour = Array(24).fill(0);
  const byType: Record<string, number> = {};
  const byLocality: Record<string, number> = {};
  let urgent = 0;
  for (const r of reqs) {
    const k = ist(r.created_at).toISOString().slice(0, 10);
    if (k in byDay) byDay[k]++;
    byHour[ist(r.created_at).getUTCHours()]++;
    byType[SERVICE_TYPE_LABEL[r.service_type] || r.service_type] = (byType[SERVICE_TYPE_LABEL[r.service_type] || r.service_type] || 0) + 1;
    const loc = r.out_of_area ? 'Outside service area' : GAZETTEER.find((g) => (r.pickup_address || '').toLowerCase().includes(g.name.toLowerCase()))?.name || r.zone || 'Other / unknown';
    byLocality[loc] = (byLocality[loc] || 0) + 1;
    if (isUrgent(r.urgency)) urgent++;
  }
  const days = Object.keys(byDay).length || 1;

  // ---- Operations
  const completed = reqs.filter((r: any) => r.current_status === 'COMPLETED');
  const closed = reqs.filter((r: any) => ['COMPLETED', 'CANCELLED', 'UNFULFILLED'].includes(r.current_status));
  const dispatch = reqs.map((r: any) => mins(r.created_at, r.assigned_at)).filter((x: any) => x != null) as number[];
  const arrival = reqs.filter((r: any) => isUrgent(r.urgency)).map((r: any) => mins(r.created_at, r.actual_arrival)).filter((x: any) => x != null) as number[];
  const offers = assignments.length;
  const accepted = assignments.filter((a: any) => ['ACCEPTED', 'COMPLETED'].includes(a.status)).length;
  const durations = completed.map((r: any) => r.service_duration_minutes).filter(Boolean);
  const incidentsBySev: Record<string, number> = {};
  for (const i of incidents) incidentsBySev[i.severity] = (incidentsBySev[i.severity] || 0) + 1;

  // ---- Economics
  const paid = payments.filter((p: any) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status));
  const gross = paid.reduce((s: number, p: any) => s + Number(p.amount) - Number(p.refunded_amount), 0);
  const orderValues = completed.map((r: any) => Number(r.final_amount)).filter((x: number) => x > 0);
  let serviceNet = 0, payouts = 0, billableExp = 0, absorbedExp = 0, tax = 0;
  for (const r of completed) {
    const b = r.charge_breakdown || {};
    serviceNet += Number(b.subtotal || 0);
    tax += Number(b.tax || 0);
    const extraHours = Math.max(0, Math.ceil(((r.service_duration_minutes || 0) - (b.included_minutes || 240)) / 60));
    payouts += Number(payout.companion_base) + extraHours * Number(payout.companion_per_extra_hour);
  }
  for (const e of expenses) { if (e.bill_to_customer) billableExp += Number(e.amount); else absorbedExp += Number(e.amount); }
  const gatewayFees = gross * 0.02;
  const contribution = serviceNet - payouts - absorbedExp - gatewayFees;

  // ---- Customer
  const repeat = customers.filter((c: any) => c.n >= 2).length;
  const referral = customers.filter((c: any) => c.source === 'referral').length;
  const avgRating = ratings.length ? ratings.reduce((s: number, r: any) => s + r.overall, 0) / ratings.length : null;
  const trustYes = trust.filter((t: any) => t.trust_again).length;
  const ratingDist = [1, 2, 3, 4, 5].map((s) => ratings.filter((r: any) => r.overall === s).length);

  // ---- North-star metrics (FRD §44)
  const acceptedUrgent = reqs.filter((r: any) => isUrgent(r.urgency) && r.accepted_at && (r.actual_arrival || ['COMPLETED', 'CANCELLED', 'UNFULFILLED'].includes(r.current_status)));
  const withinSla = acceptedUrgent.filter((r: any) => r.actual_arrival && (mins(r.created_at, r.actual_arrival) as number) <= sla.arrival_minutes).length;

  return {
    range: { from, to, days },
    north_star: {
      sla_hit_rate: acceptedUrgent.length ? withinSla / acceptedUrgent.length : null, sla_hits: withinSla, sla_base: acceptedUrgent.length, arrival_target_minutes: sla.arrival_minutes,
      trust_again_rate: trust.length ? trustYes / trust.length : null, trust_yes: trustYes, trust_base: trust.length,
    },
    demand: {
      total: reqs.length, per_day_avg: reqs.length / days, by_day: Object.entries(byDay).map(([date, n]) => ({ date, n })), by_hour: byHour,
      by_type: Object.entries(byType).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n),
      by_location: Object.entries(byLocality).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 10),
      urgent, scheduled: reqs.length - urgent,
    },
    operations: {
      median_dispatch_minutes: median(dispatch), median_arrival_minutes: median(arrival), fulfilment_rate: closed.length ? completed.length / closed.length : null,
      completed: completed.length, cancelled: reqs.filter((r: any) => r.current_status === 'CANCELLED').length, unfulfilled: reqs.filter((r: any) => r.current_status === 'UNFULFILLED').length,
      acceptance_rate: offers ? accepted / offers : null, offers, median_duration_minutes: median(durations), incidents: incidents.length, incidents_by_severity: incidentsBySev,
      open: reqs.filter((r: any) => !['COMPLETED', 'CANCELLED', 'UNFULFILLED'].includes(r.current_status)).length,
    },
    economics: {
      collected: gross, avg_order_value: orderValues.length ? orderValues.reduce((a: number, b: number) => a + b, 0) / orderValues.length : null,
      service_revenue_ex_tax: serviceNet, tax_collected: tax, companion_payout: payouts, billable_expenses: billableExp, absorbed_expenses: absorbedExp,
      gateway_fees: gatewayFees, contribution_margin: contribution, contribution_per_job: completed.length ? contribution / completed.length : null,
      outstanding: payments.filter((p: any) => ['PENDING', 'CREATED', 'FAILED'].includes(p.status)).reduce((s: number, p: any) => s + Number(p.amount), 0),
    },
    customer: {
      customers: customers.length, repeat_rate: customers.length ? repeat / customers.length : null, referral_rate: customers.length ? referral / customers.length : null,
      avg_rating: avgRating, ratings: ratings.length, rating_distribution: ratingDist,
    },
  };
}

const csv = (rows: any[], cols: string[]) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => {
    const v = r[c] instanceof Date ? r[c].toISOString() : r[c] == null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c]);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(','))].join('\n');

export function registerAdmin(r: Router) {
  // ---------------- reports (FRD §43, §44)
  r.get('/api/v1/reports/summary', async (ctx) => {
    requireUser(ctx, 'report.view');
    const to = ctx.query.get('to') || new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const from = ctx.query.get('from') || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    return buildReport(from, to);
  });
  r.get('/api/v1/reports/export', async (ctx) => {
    requireUser(ctx, 'report.export');
    const type = ctx.query.get('type') || 'requests';
    const from = ctx.query.get('from') || '2000-01-01';
    const to = ctx.query.get('to') || '2100-01-01';
    let body = '';
    if (type === 'payments') {
      const rows = await sql`SELECT r.request_number, p.amount, p.status, p.provider, p.method, p.provider_payment_id, p.refunded_amount, p.paid_at, p.created_at
                             FROM payments p JOIN service_requests r ON r.id = p.request_id WHERE p.created_at >= ${from}::date AND p.created_at < ${to}::date + 1 ORDER BY p.created_at`;
      body = csv(rows, ['request_number', 'amount', 'status', 'provider', 'method', 'provider_payment_id', 'refunded_amount', 'paid_at', 'created_at']);
    } else {
      // Controlled export: no customer phone numbers or patient names (data minimisation, FRD §38)
      const rows = await sql`SELECT r.request_number, r.channel, r.service_type, r.urgency, r.current_status, r.created_at, r.requested_datetime, r.assigned_at, r.accepted_at,
                                    r.actual_arrival, r.service_start_time, r.service_end_time, r.service_duration_minutes, r.completion_type, r.final_amount, r.payment_status,
                                    r.human_review_required, r.emergency_review, r.out_of_area, r.incident_flag, cmp.code AS companion_code, sa.name AS zone,
                                    rt.overall AS rating, tr.trust_again
                             FROM service_requests r LEFT JOIN companions cmp ON cmp.id = r.assigned_companion_id LEFT JOIN service_areas sa ON sa.id = r.service_area_id
                             LEFT JOIN ratings rt ON rt.request_id = r.id LEFT JOIN trust_responses tr ON tr.request_id = r.id
                             WHERE r.created_at >= ${from}::date AND r.created_at < ${to}::date + 1 ORDER BY r.created_at`;
      body = csv(rows, Object.keys(rows[0] || { request_number: 1 }));
    }
    await audit(ctx, 'report.export', 'report', type, `Exported ${type} CSV ${from}..${to}`);
    return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${type}-${from}-${to}.csv"` } });
  });

  // ---------------- companions (FRD §27, §28)
  r.get('/api/v1/companions', async (ctx) => {
    requireUser(ctx, 'companion.view');
    const rows = await sql`SELECT c.*, sa.name AS zone FROM companions c LEFT JOIN service_areas sa ON sa.id = c.service_area_id ORDER BY c.code`;
    const stats = new Map((await companionStats()).map((s: any) => [s.id, s]));
    const active = await sql`SELECT assigned_companion_id, request_number, current_status FROM service_requests
                             WHERE current_status IN ('COMPANION_ASSIGNED','COMPANION_ACCEPTED','EN_ROUTE','WITH_PATIENT','AT_HOSPITAL','RETURNING')`;
    return rows.map((c: any) => {
      const s: any = stats.get(c.id) || {};
      const job = active.find((a: any) => a.assigned_companion_id === c.id);
      const { bank_account_number, bank_ifsc, upi_id, bank_account_name, password_hash, failed_logins, locked_until, ...safe } = c;
      return {
        ...safe, has_password: !!password_hash, jobs_completed: s.jobs_completed ?? 0, rating: s.rating, rating_count: s.rating_count ?? 0,
        acceptance_rate: s.offers ? s.accepted / s.offers : null, cancellation_rate: s.offers ? s.cancelled / s.offers : null,
        avg_response_sec: s.avg_response_sec, incidents: s.incidents ?? 0, current_job: job ? { request_number: job.request_number, status: job.current_status } : null,
      };
    });
  });
  r.get('/api/v1/companions/:id', async (ctx) => {
    requireUser(ctx, 'companion.view');
    const c = (await sql`SELECT c.*, sa.name AS zone FROM companions c LEFT JOIN service_areas sa ON sa.id = c.service_area_id WHERE c.id = ${ctx.params.id}`)[0];
    if (!c) throw notFound();
    const s: any = (await companionStats()).find((x: any) => x.id === c.id) || {};
    const jobs = await sql`SELECT r.request_number, r.id, r.current_status, r.service_type, a.status AS assignment_status, a.offered_at, a.responded_at, rt.overall AS rating
                           FROM assignments a JOIN service_requests r ON r.id = a.request_id LEFT JOIN ratings rt ON rt.request_id = r.id
                           WHERE a.companion_id = ${c.id} ORDER BY a.offered_at DESC LIMIT 50`;
    const incidents = await sql`SELECT i.*, r.request_number FROM incidents i LEFT JOIN service_requests r ON r.id = i.request_id WHERE i.companion_id = ${c.id} ORDER BY i.created_at DESC`;
    const financial = can(ctx, 'companion.financial.view');
    if (financial) await audit(ctx, 'companion.financial.view', 'companion', c.id, `Viewed bank details of ${c.code}`);
    const mask = (v: string | null) => (v ? '•••• ' + v.slice(-4) : null);
    const { password_hash, ...cSafe } = c;
    return {
      ...cSafe, has_password: !!password_hash, password_locked: !!(c.locked_until && new Date(c.locked_until) > new Date()),
      bank_account_number: financial ? c.bank_account_number : mask(c.bank_account_number), bank_ifsc: financial ? c.bank_ifsc : null,
      upi_id: financial ? c.upi_id : c.upi_id ? '•••@' + c.upi_id.split('@')[1] : null, financial_visible: financial,
      verification_complete: await verificationComplete(c), required_controls: (await getSetting('verification')).required,
      stats: { ...s, acceptance_rate: s.offers ? s.accepted / s.offers : null, cancellation_rate: s.offers ? s.cancelled / s.offers : null }, jobs, incidents,
    };
  });
  r.post('/api/v1/companions', async (ctx) => {
    requireUser(ctx, 'companion.manage');
    const b = ctx.body;
    const phone = normalizePhone(b.phone);
    if (!str(b.name) || !phone) throw bad('Name and valid mobile are required');
    const n = (await sql`SELECT count(*)::int AS n FROM companions`)[0].n;
    const area = (await sql`SELECT id FROM service_areas WHERE active ORDER BY created_at LIMIT 1`)[0];
    const home = GAZETTEER.find((g) => g.name === b.home_area);
    try {
      const c = (await sql`INSERT INTO companions (code, name, phone, gender, service_area_id, languages, skills, home_area, current_lat, current_lng, photo_url)
        VALUES (${'CMP-' + (101 + n)}, ${str(b.name, 80)}, ${phone}, ${str(b.gender, 20)}, ${b.service_area_id || area?.id || null}, ${Array.isArray(b.languages) ? b.languages : []},
                ${Array.isArray(b.skills) ? b.skills : []}, ${str(b.home_area, 60)}, ${home?.lat ?? null}, ${home?.lng ?? null}, ${str(b.photo_url, 500000)})
        RETURNING *`)[0];
      if (validEmail(b.email)) {
        await ensureEmailColumns();
        await sql`UPDATE companions SET email = ${String(b.email).trim()} WHERE id = ${c.id}`;
        c.email = String(b.email).trim();
      }
      await audit(ctx, 'companion.create', 'companion', c.id, `Created ${c.code} ${c.name}`);
      delete c.password_hash;
      return c;
    } catch (e: any) {
      if (String(e.message).includes('unique')) throw conflict('A companion with this mobile already exists');
      throw e;
    }
  });
  r.patch('/api/v1/companions/:id', async (ctx) => {
    requireUser(ctx, 'companion.manage');
    const b = ctx.body;
    const before = (await sql`SELECT * FROM companions WHERE id = ${ctx.params.id}`)[0];
    if (!before) throw notFound();
    const patch: any = { updated_at: new Date() };
    for (const k of ['name', 'gender', 'home_area', 'notes', 'photo_url']) if (b[k] !== undefined) patch[k] = str(b[k], k === 'photo_url' ? 500000 : 500);
    if (b.email !== undefined) {
      await ensureEmailColumns();
      const e = String(b.email || '').trim();
      if (e && !validEmail(e)) throw bad('Please enter a valid email address');
      patch.email = e || null;
    }
    if (b.phone !== undefined) patch.phone = normalizePhone(b.phone);
    if (Array.isArray(b.languages)) patch.languages = b.languages;
    if (Array.isArray(b.skills)) patch.skills = b.skills;
    if (b.service_area_id !== undefined) patch.service_area_id = b.service_area_id;
    if (b.home_area) { const h = GAZETTEER.find((g) => g.name === b.home_area); if (h) { patch.current_lat = h.lat; patch.current_lng = h.lng; } }
    if (b.suspended !== undefined) { patch.suspended = !!b.suspended; if (b.suspended) patch.availability = 'OFFLINE'; }
    if (['bank_account_name', 'bank_account_number', 'bank_ifsc', 'upi_id'].some((k) => b[k] !== undefined)) {
      requireUser(ctx, 'companion.financial.view');
      for (const k of ['bank_account_name', 'bank_account_number', 'bank_ifsc', 'upi_id']) if (b[k] !== undefined) patch[k] = str(b[k], 60);
    }
    if (b.active !== undefined) {
      if (b.active && !(await verificationComplete({ ...before, ...patch }))) throw bad('All required verification controls must be complete before activation');
      patch.active = !!b.active;
      if (!b.active) patch.availability = 'OFFLINE';
    }
    const c = (await sql`UPDATE companions SET ${sql(patch)} WHERE id = ${before.id} RETURNING *`)[0];
    const redact = (x: any) => ({ ...x, bank_account_number: undefined, upi_id: undefined, bank_ifsc: undefined, photo_url: undefined, password_hash: undefined });
    await audit(ctx, 'companion.edit', 'companion', c.id, `Updated ${c.code}: ${Object.keys(patch).filter((k) => k !== 'updated_at').join(', ')}`, redact(before), redact(c));
    delete c.password_hash;
    return c;
  });
  // Operations sets (or generates) a Champ's app password. A generated password is shown once, never stored in clear.
  r.post('/api/v1/companions/:id/password', async (ctx) => {
    requireUser(ctx, 'companion.manage');
    await ensureCompanionPasswordColumns();
    const c = (await sql`SELECT id, code, name FROM companions WHERE id = ${ctx.params.id}`)[0];
    if (!c) throw notFound();
    let pw = String(ctx.body.password || '');
    const generated = !!ctx.body.generate;
    if (generated) {
      const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
      pw = Array.from(crypto.randomBytes(9), (x) => alphabet[x % alphabet.length]).join('').replace(/(.{3})(?=.)/g, '$1-');
    } else if (pw.length < 8 || !/[a-z]/i.test(pw) || !/\d/.test(pw)) {
      throw bad('Password must be at least 8 characters and include letters and a number');
    }
    await sql`UPDATE companions SET password_hash = ${hashPassword(pw)}, password_set_at = now(), failed_logins = 0, locked_until = NULL WHERE id = ${c.id}`;
    await sql`DELETE FROM sessions WHERE subject_type = 'companion' AND subject_id = ${c.id}`.catch(() => {});
    await audit(ctx, 'companion.password_set', 'companion', c.id, `${generated ? 'Generated' : 'Set'} app password for ${c.code} ${c.name}`);
    return { ok: true, ...(generated ? { password: pw } : {}) };
  });
  r.patch('/api/v1/companions/:id/verification', async (ctx) => {
    requireUser(ctx, 'companion.verify');
    const before = (await sql`SELECT * FROM companions WHERE id = ${ctx.params.id}`)[0];
    if (!before) throw notFound();
    const patch: any = { updated_at: new Date() };
    for (const v of VERIFICATION_CONTROLS) if (typeof ctx.body[v.key] === 'boolean') patch[v.key] = ctx.body[v.key];
    const merged = { ...before, ...patch };
    if (!(await verificationComplete(merged)) && before.active) { patch.active = false; patch.availability = 'OFFLINE'; }
    const c = (await sql`UPDATE companions SET ${sql(patch)} WHERE id = ${before.id} RETURNING *`)[0];
    const changes = VERIFICATION_CONTROLS.filter((v) => before[v.key] !== c[v.key]).map((v) => `${v.label}: ${c[v.key] ? '✓' : '✗'}`);
    await audit(ctx, 'companion.verify', 'companion', c.id, `${c.code} verification – ${changes.join(', ') || 'no change'}`);
    return c;
  });

  // ---------------- settings (FRD §47)
  r.get('/api/v1/admin/settings', async (ctx) => {
    requireUser(ctx, 'request.view');
    return { settings: await getAllSettings(), integrations: integrationStatus(), permissions: PERMISSIONS };
  });
  // Sends a test email to the operations inbox(es) so the setup can be checked from Settings
  r.post('/api/v1/admin/email/test', async (ctx) => {
    requireUser(ctx, 'settings.edit');
    if (!emailConfigured()) throw bad('Email is not connected yet: add RESEND_API_KEY and EMAIL_FROM in Vercel, then redeploy.');
    const to = String(ctx.body.to || '').split(/[,;\s]+/).filter(validEmail);
    if (!to.length) throw bad('Enter at least one email address');
    const status = await sendEmail({ to, subject: 'ChampOnCall test email', heading: 'Email is working', text: 'This is a test email from ChampOnCall Operations. Customer, companion and operations updates will arrive like this.', recipientType: 'ops', event: 'email_test' });
    if (status !== 'SENT') throw bad('The email could not be sent. Check the domain is verified in Resend and EMAIL_FROM uses that domain.');
    return { ok: true };
  });
  r.put('/api/v1/admin/settings/:key', async (ctx) => {
    requireUser(ctx, 'settings.edit');
    const key = ctx.params.key;
    if (!(key in DEFAULT_SETTINGS)) throw notFound('Unknown setting');
    const before = await getSetting(key);
    const value = { ...before, ...ctx.body };
    if (key === 'sla') for (const k of Object.keys(value)) { const n = Number(value[k]); if (!(n > 0 && n < 10000)) throw bad(`${k} must be a positive number`); value[k] = n; }
    await setSetting(key, value, ctx.user!.name);
    await audit(ctx, 'settings.update', 'settings', key, `Updated ${key} settings`, before, value);
    return value;
  });

  r.get('/api/v1/admin/pricing-rules', async (ctx) => {
    requireUser(ctx, 'request.view');
    return sql`SELECT pr.*, sa.name AS area_name FROM pricing_rules pr LEFT JOIN service_areas sa ON sa.id = pr.service_area_id ORDER BY pr.active DESC, pr.service_type, pr.effective_from DESC`;
  });
  const rulePatch = (b: any) => {
    const p: any = {};
    if (b.name !== undefined) p.name = str(b.name, 80);
    if (b.service_type !== undefined) p.service_type = str(b.service_type, 40) || '*';
    for (const k of ['base_fee', 'extension_rate_per_hour', 'tax_percent', 'urgent_surcharge']) if (b[k] !== undefined) { const n = num(b[k]); if (n == null || n < 0) throw bad(`${k} must be ≥ 0`); p[k] = n; }
    for (const k of ['included_minutes', 'extension_block_minutes']) if (b[k] !== undefined) { const n = num(b[k]); if (!n || n <= 0) throw bad(`${k} must be > 0`); p[k] = Math.round(n); }
    if (b.service_area_id !== undefined) p.service_area_id = b.service_area_id || null;
    if (b.effective_from !== undefined) p.effective_from = b.effective_from;
    if (b.active !== undefined) p.active = !!b.active;
    return p;
  };
  r.post('/api/v1/admin/pricing-rules', async (ctx) => {
    requireUser(ctx, 'pricing.edit');
    const p = rulePatch(ctx.body);
    for (const k of ['name', 'base_fee', 'included_minutes', 'extension_rate_per_hour']) if (p[k] == null) throw bad(`${k} is required`);
    const row = (await sql`INSERT INTO pricing_rules ${sql(p)} RETURNING *`)[0];
    await audit(ctx, 'pricing.create', 'pricing_rule', row.id, `Created pricing rule ${row.name}`, null, row);
    return row;
  });
  r.patch('/api/v1/admin/pricing-rules/:id', async (ctx) => {
    requireUser(ctx, 'pricing.edit');
    const before = (await sql`SELECT * FROM pricing_rules WHERE id = ${ctx.params.id}`)[0];
    if (!before) throw notFound();
    const row = (await sql`UPDATE pricing_rules SET ${sql({ ...rulePatch(ctx.body), updated_at: new Date() })} WHERE id = ${before.id} RETURNING *`)[0];
    await audit(ctx, 'pricing.edit', 'pricing_rule', row.id, `Updated pricing rule ${row.name}`, before, row);
    return row;
  });

  r.get('/api/v1/admin/service-areas', async (ctx) => {
    requireUser(ctx, 'request.view');
    return sql`SELECT * FROM service_areas ORDER BY created_at`;
  });
  r.post('/api/v1/admin/service-areas', async (ctx) => {
    requireUser(ctx, 'service_area.edit');
    const b = ctx.body;
    if (!str(b.name) || num(b.center_lat) == null || num(b.center_lng) == null || !num(b.radius_km)) throw bad('Name, centre and radius are required');
    const row = (await sql`INSERT INTO service_areas (name, city, center_lat, center_lng, radius_km, keywords, active)
      VALUES (${str(b.name, 80)}, ${str(b.city, 80) || str(b.name, 80)}, ${num(b.center_lat)}, ${num(b.center_lng)}, ${num(b.radius_km)},
              ${Array.isArray(b.keywords) ? b.keywords : String(b.keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean)}, ${b.active !== false}) RETURNING *`)[0];
    await audit(ctx, 'service_area.create', 'service_area', row.id, `Created service area ${row.name}`, null, row);
    return row;
  });
  r.patch('/api/v1/admin/service-areas/:id', async (ctx) => {
    requireUser(ctx, 'service_area.edit');
    const b = ctx.body;
    const before = (await sql`SELECT * FROM service_areas WHERE id = ${ctx.params.id}`)[0];
    if (!before) throw notFound();
    const p: any = {};
    for (const k of ['name', 'city']) if (b[k] !== undefined) p[k] = str(b[k], 80);
    for (const k of ['center_lat', 'center_lng', 'radius_km']) if (b[k] !== undefined) p[k] = num(b[k]);
    if (b.keywords !== undefined) p.keywords = Array.isArray(b.keywords) ? b.keywords : String(b.keywords).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (b.active !== undefined) p.active = !!b.active;
    const row = (await sql`UPDATE service_areas SET ${sql(p)} WHERE id = ${before.id} RETURNING *`)[0];
    await audit(ctx, 'service_area.edit', 'service_area', row.id, `Updated service area ${row.name}`, before, row);
    return row;
  });

  r.get('/api/v1/admin/templates', async (ctx) => {
    requireUser(ctx, 'request.view');
    return sql`SELECT * FROM message_templates ORDER BY key`;
  });
  r.put('/api/v1/admin/templates/:key', async (ctx) => {
    requireUser(ctx, 'settings.edit');
    const before = (await sql`SELECT * FROM message_templates WHERE key = ${ctx.params.key}`)[0];
    if (!before) throw notFound();
    const body = str(ctx.body.body, 1024);
    if (!body) throw bad('Template body is required');
    const row = (await sql`UPDATE message_templates SET body = ${body}, active = ${ctx.body.active !== false}, updated_at = now() WHERE key = ${before.key} RETURNING *`)[0];
    await audit(ctx, 'template.edit', 'message_template', row.key, `Updated WhatsApp template ${row.key}`, before, row);
    return row;
  });

  // ---------------- users & roles (FRD §36)
  r.get('/api/v1/admin/users', async (ctx) => {
    requireUser(ctx, 'user.manage');
    return sql`SELECT u.id, u.name, u.email, u.phone, u.role_id, r.name AS role_name, u.active, u.last_login_at, u.created_at, u.locked_until FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.created_at`;
  });
  r.post('/api/v1/admin/users', async (ctx) => {
    requireUser(ctx, 'user.manage');
    const b = ctx.body;
    const email = String(b.email || '').trim().toLowerCase();
    if (!str(b.name) || !/^\S+@\S+\.\S+$/.test(email)) throw bad('Name and valid email are required');
    const pw = String(b.password || '');
    if (pw.length < 8 || !/[A-Z]/.test(pw) || !/\d/.test(pw)) throw bad('Password must be 8+ characters with an uppercase letter and a number');
    const role = (await sql`SELECT id FROM roles WHERE id = ${b.role_id}`)[0];
    if (!role) throw bad('Choose a role');
    if (b.role_id === 'super_admin' && ctx.user!.role_id !== 'super_admin') throw bad('Only a Super Admin can create Super Admins');
    try {
      const u = (await sql`INSERT INTO users (name, email, phone, password_hash, role_id) VALUES (${str(b.name, 80)}, ${email}, ${normalizePhone(b.phone)}, ${hashPassword(pw)}, ${role.id})
                           RETURNING id, name, email, role_id, active`)[0];
      await audit(ctx, 'user.create', 'user', u.id, `Created user ${email} (${role.id})`);
      return u;
    } catch (e: any) {
      if (String(e.message).includes('unique')) throw conflict('A user with this email already exists');
      throw e;
    }
  });
  r.patch('/api/v1/admin/users/:id', async (ctx) => {
    requireUser(ctx, 'user.manage');
    const b = ctx.body;
    const before = (await sql`SELECT id, name, email, role_id, active FROM users WHERE id = ${ctx.params.id}`)[0];
    if (!before) throw notFound();
    if (before.id === ctx.user!.id && (b.active === false || (b.role_id && b.role_id !== before.role_id))) throw bad('You cannot deactivate or change the role of your own account');
    if ((b.role_id === 'super_admin' || before.role_id === 'super_admin') && ctx.user!.role_id !== 'super_admin') throw bad('Only a Super Admin can change Super Admin accounts');
    const p: any = { updated_at: new Date() };
    if (b.name !== undefined) p.name = str(b.name, 80);
    if (b.role_id !== undefined) p.role_id = b.role_id;
    if (b.active !== undefined) p.active = !!b.active;
    if (b.password) {
      const pw = String(b.password);
      if (pw.length < 8 || !/[A-Z]/.test(pw) || !/\d/.test(pw)) throw bad('Password must be 8+ characters with an uppercase letter and a number');
      p.password_hash = hashPassword(pw);
      p.failed_logins = 0;
      p.locked_until = null;
    }
    const u = (await sql`UPDATE users SET ${sql(p)} WHERE id = ${before.id} RETURNING id, name, email, role_id, active`)[0];
    if (b.active === false || b.password) await sql`DELETE FROM sessions WHERE subject_type = 'user' AND subject_id = ${u.id}`;
    await audit(ctx, 'user.edit', 'user', u.id, `Updated user ${u.email}${b.password ? ' (password reset)' : ''}`, before, u);
    return u;
  });
  r.get('/api/v1/admin/roles', async (ctx) => {
    requireUser(ctx, 'request.view');
    return { roles: await sql`SELECT * FROM roles ORDER BY array_length(permissions, 1) DESC NULLS LAST`, permissions: PERMISSIONS };
  });
  r.patch('/api/v1/admin/roles/:id', async (ctx) => {
    requireUser(ctx, 'user.manage');
    if (ctx.params.id === 'super_admin') throw bad('Super Admin always has full access');
    const perms = (ctx.body.permissions || []).filter((p: string) => (PERMISSIONS as readonly string[]).includes(p));
    const before = (await sql`SELECT * FROM roles WHERE id = ${ctx.params.id}`)[0];
    if (!before) throw notFound();
    const row = (await sql`UPDATE roles SET permissions = ${perms} WHERE id = ${before.id} RETURNING *`)[0];
    await audit(ctx, 'role.edit', 'role', row.id, `Updated permissions of ${row.name}`, before.permissions, row.permissions);
    return row;
  });

  // ---------------- audit (FRD §30, §37)
  r.get('/api/v1/audit', async (ctx) => {
    requireUser(ctx, 'audit.view');
    const q = ctx.query.get('q');
    const et = ctx.query.get('entity_type');
    const eid = ctx.query.get('entity_id');
    return sql`SELECT * FROM audit_logs WHERE true
               ${et ? sql`AND entity_type = ${et}` : sql``} ${eid ? sql`AND entity_id = ${eid}` : sql``}
               ${q ? sql`AND (summary ILIKE ${'%' + q + '%'} OR actor_name ILIKE ${'%' + q + '%'} OR action ILIKE ${'%' + q + '%'})` : sql``}
               ORDER BY created_at DESC LIMIT 300`;
  });

  // ---------------- WhatsApp templates in Meta (required outside the 24h window and for companion login codes)
  r.get('/api/v1/admin/whatsapp/meta-templates', async (ctx) => {
    requireUser(ctx, 'settings.edit');
    try {
      return await listMetaTemplates();
    } catch (e: any) {
      return { configured: true, templates: [], error: e.message };
    }
  });
  r.post('/api/v1/admin/whatsapp/meta-templates/sync', async (ctx) => {
    requireUser(ctx, 'settings.edit');
    let results;
    try { results = await syncMetaTemplates(); } catch (e: any) { throw bad(e.message); }
    await audit(ctx, 'whatsapp.templates_submitted', 'settings', null, `Submitted WhatsApp templates to Meta: ${results.map((x: any) => `${x.name}=${x.action}`).join(', ')}`);
    return { results, ...(await listMetaTemplates()) };
  });

  // ---------------- Go-live: remove all demo / test operational data, keep configuration and staff users
  // One-step launch: wipe demo/test operations data, create the owner's real Super Admin login, disable every
  // published demo login (their passwords are public) and switch demo mode off (no on-screen OTPs, no demo shortcuts).
  r.post('/api/v1/admin/go-live-reset', async (ctx) => {
    const u = requireUser(ctx, 'data.reset', 'user.manage', 'settings.edit');
    const b = ctx.body;
    if (String(b.confirm || '').trim().toUpperCase() !== 'GO LIVE') throw bad('Type GO LIVE to confirm');
    const demoEmails = DEMO_USERS.map((d) => d.email.toLowerCase());
    const owner = b.owner || {};
    const email = String(owner.email || '').trim().toLowerCase();
    const name = str(owner.name, 80);
    const pw = String(owner.password || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw bad('Enter your name and a valid email for your new admin login');
    if (demoEmails.includes(email)) throw bad('Use your own email address, not one of the demo logins');
    if (pw.length < 10 || !/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw)) throw bad('Password must be at least 10 characters with upper-case, lower-case and a number');
    if (demoEmails.some((d) => d.split('@')[0].toLowerCase() + '@123' === pw.toLowerCase())) throw bad('Choose a new password, not a demo one');

    const counts = (await sql`SELECT (SELECT count(*)::int FROM service_requests) AS requests, (SELECT count(*)::int FROM customers) AS customers,
                                     (SELECT count(*)::int FROM companions) AS companions`)[0];
    let ownerId = '';
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`TRUNCATE ${GO_LIVE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
      const existing = (await tx`SELECT id FROM users WHERE email = ${email}`)[0];
      ownerId = existing
        ? (await tx`UPDATE users SET name = ${name}, password_hash = ${hashPassword(pw)}, role_id = 'super_admin', active = true WHERE id = ${existing.id} RETURNING id`)[0].id
        : (await tx`INSERT INTO users (name, email, password_hash, role_id) VALUES (${name}, ${email}, ${hashPassword(pw)}, 'super_admin') RETURNING id`)[0].id;
      await tx`UPDATE users SET active = false WHERE lower(email) IN ${tx(demoEmails)}`;
      // Everyone signs in again: all staff and companion sessions end (the demo ones included)
      await tx`DELETE FROM sessions`;
    });
    const security = await getSetting('security');
    await setSetting('security', { ...security, demo_mode: false }, ownerId);
    await audit(ctx, 'data.go_live_reset', 'settings', null,
      `${u.name} launched live mode: removed ${counts.requests} requests, ${counts.customers} customers and ${counts.companions} companions of demo/test data; created Super Admin ${email}; disabled ${demoEmails.length} demo logins; demo mode off.`);
    return { ok: true, removed: counts, admin_email: email };
  });

  r.post('/api/v1/admin/reset-demo', async (ctx) => {
    requireUser(ctx, 'data.reset');
    if (!(await getSetting('security')).demo_mode) throw bad('Demo reset is disabled in production mode');
    await resetDatabase();
    return { ok: true };
  });
}
