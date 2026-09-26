// SLA management (FRD §42): risk flags, offer expiry, notification retries.
import { sql } from './db';
import { getSetting } from './settings';
import { expireOffers } from './dispatch';
import { alertOps, retryFailedNotifications } from './notifications';
import { insertEvent, SYSTEM } from './lifecycle';
import { isUrgent } from '../shared/constants';

declare global {
  // eslint-disable-next-line no-var
  var __mcLastTick: number | undefined;
}

export async function maybeTick() {
  const now = Date.now();
  if (globalThis.__mcLastTick && now - globalThis.__mcLastTick < 15000) return;
  globalThis.__mcLastTick = now;
  try {
    await tick();
  } catch (e) {
    console.error('SLA tick failed', e);
  }
}

export function slaRisk(r: any, sla: any): string | null {
  const now = Date.now();
  const created = new Date(r.created_at).getTime();
  const reqAt = r.requested_datetime ? new Date(r.requested_datetime).getTime() : created;
  const urgent = isUrgent(r.urgency);
  const s = r.current_status;
  if (['NEW', 'AWAITING_CONFIRMATION', 'SEARCHING_COMPANION'].includes(s)) {
    if (urgent && now - created > sla.urgent_dispatch_minutes * 60000) return `Not dispatched within ${sla.urgent_dispatch_minutes} min`;
    if (!urgent && reqAt - now < sla.scheduled_dispatch_lead_minutes * 60000) return `Scheduled service in < ${sla.scheduled_dispatch_lead_minutes} min with no companion`;
  }
  if (s === 'COMPANION_ASSIGNED' && r.assigned_at && now - new Date(r.assigned_at).getTime() > sla.acceptance_minutes * 60000) {
    return `Companion has not accepted within ${sla.acceptance_minutes} min`;
  }
  if (['COMPANION_ACCEPTED', 'EN_ROUTE'].includes(s)) {
    const target = urgent ? created + sla.arrival_minutes * 60000 : reqAt;
    if (now > target) return urgent ? `Arrival exceeds ${sla.arrival_minutes} min target` : 'Past scheduled time without arrival';
    if (r.estimated_arrival && new Date(r.estimated_arrival).getTime() > target) return 'ETA later than target';
  }
  return null;
}

export async function tick() {
  // Pool-safe lease (works with pgbouncer/Neon transaction pooling)
  const lease = await sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES ('lease:sla', now(), 1)
    ON CONFLICT (key) DO UPDATE SET window_start = now(), count = rate_limits.count + 1
      WHERE rate_limits.window_start < now() - interval '15 seconds'
    RETURNING key`;
  if (!lease[0]) return;
  {
    await expireOffers();
    const sla = await getSetting('sla');
    const open = await sql`SELECT * FROM service_requests WHERE current_status NOT IN ('COMPLETED','CANCELLED','UNFULFILLED','DRAFT')`;
    for (const r of open) {
      const reason = slaRisk(r, sla);
      if (reason && !r.sla_risk) {
        await sql`UPDATE service_requests SET sla_risk = true, sla_risk_reason = ${reason} WHERE id = ${r.id}`;
        await sql.begin((tx: any) => insertEvent(tx, r.id, { type: 'flag_set', label: 'SLA risk', actor: SYSTEM, notes: reason, customerVisible: false, metadata: { flag: 'SLA_RISK' } }));
        await alertOps(r.id, 'sla_risk', `⏱ SLA RISK ${r.request_number}`, reason, 'URGENT');
      } else if (!reason && r.sla_risk) {
        await sql`UPDATE service_requests SET sla_risk = false, sla_risk_reason = NULL WHERE id = ${r.id}`;
      }
    }
    await retryFailedNotifications();
    // housekeeping
    await sql`DELETE FROM sessions WHERE expires_at < now()`;
    await sql`DELETE FROM otp_codes WHERE created_at < now() - interval '1 day'`;
    await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day' AND key <> 'lease:sla'`;
  }
}
