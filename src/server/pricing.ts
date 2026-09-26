import { sql } from './db';

export async function findPricingRule(serviceType: string, areaId: string | null, tx: any = sql) {
  const rows = await tx`
    SELECT * FROM pricing_rules
    WHERE active AND effective_from <= CURRENT_DATE
      AND (service_type = ${serviceType} OR service_type = '*')
      AND (service_area_id IS NULL OR service_area_id = ${areaId})
    ORDER BY (service_type = ${serviceType}) DESC, (service_area_id IS NOT NULL) DESC, effective_from DESC
    LIMIT 1`;
  return rows[0] ?? null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeCharge(rule: any, durationMinutes: number, urgency: string, billableExpenses = 0) {
  const base = Number(rule.base_fee);
  const extraMinutes = Math.max(0, durationMinutes - rule.included_minutes);
  const block = rule.extension_block_minutes || 60;
  // 10-minute grace before an extension block is charged
  const blocks = extraMinutes > 10 ? Math.ceil(extraMinutes / block) : 0;
  const extension = r2(blocks * Number(rule.extension_rate_per_hour) * (block / 60));
  const urgent = urgency === 'ASAP' ? Number(rule.urgent_surcharge || 0) : 0;
  const subtotal = r2(base + extension + urgent);
  const tax = r2((subtotal * Number(rule.tax_percent)) / 100);
  const expenses = r2(billableExpenses);
  const total = r2(subtotal + tax + expenses);
  return {
    rule_id: rule.id,
    rule_name: rule.name,
    base_fee: base,
    included_minutes: rule.included_minutes,
    duration_minutes: durationMinutes,
    extra_minutes: extraMinutes,
    extension_blocks: blocks,
    extension_amount: extension,
    urgent_surcharge: urgent,
    subtotal,
    tax_percent: Number(rule.tax_percent),
    tax,
    expenses,
    total,
  };
}

export function quote(rule: any, urgency: string) {
  return computeCharge(rule, rule.included_minutes, urgency, 0);
}
