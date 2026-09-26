import React from 'react';
import { FiAlertTriangle, FiClock, FiUserX, FiMapPin, FiAlertOctagon, FiCreditCard } from 'react-icons/fi';
import { Badge } from './ui';

export function RequestFlags({ r, compact }: { r: any; compact?: boolean }) {
  const flags: React.ReactNode[] = [];
  if (r.emergency_review) flags.push(<Badge key="e" tone="red" title="Medical/emergency escalation"><FiAlertTriangle />{!compact && 'EMERGENCY'}</Badge>);
  if (r.human_review_required) flags.push(<Badge key="h" tone="amber" title={r.human_review_reason || 'Human review required'}><FiUserX />{!compact && 'REVIEW'}</Badge>);
  if (r.out_of_area) flags.push(<Badge key="o" tone="violet" title="Outside service area"><FiMapPin />{!compact && 'OUT OF AREA'}</Badge>);
  if (r.sla_risk) flags.push(<Badge key="s" tone="red" title={r.sla_risk_reason || 'SLA risk'}><FiClock />{!compact && 'SLA RISK'}</Badge>);
  if (r.incident_flag) flags.push(<Badge key="i" tone="red" title="Open incident"><FiAlertOctagon />{!compact && 'INCIDENT'}</Badge>);
  if (r.payment_status === 'PENDING' || r.payment_status === 'FAILED') flags.push(<Badge key="p" tone={r.payment_status === 'FAILED' ? 'red' : 'amber'} title={`Payment ${r.payment_status.toLowerCase()}`}><FiCreditCard />{!compact && `PAYMENT ${r.payment_status}`}</Badge>);
  if (!flags.length) return null;
  return <div className="flex flex-wrap gap-1">{flags}</div>;
}

export function UrgencyBadge({ urgency, at }: { urgency: string; at?: string }) {
  if (urgency === 'ASAP') return <Badge tone="coral">⚡ ASAP</Badge>;
  if (urgency === 'WITHIN_2_HOURS') return <Badge tone="coral">⚡ &lt; 2 h</Badge>;
  if (urgency === 'LATER_TODAY') return <Badge tone="blue">Later today</Badge>;
  return <Badge tone="blue">📅 {at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Scheduled'}</Badge>;
}
