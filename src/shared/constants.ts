// Shared between server and client.
export const STATUSES = [
  'DRAFT', 'NEW', 'AWAITING_CONFIRMATION', 'SEARCHING_COMPANION', 'COMPANION_ASSIGNED', 'COMPANION_ACCEPTED',
  'EN_ROUTE', 'WITH_PATIENT', 'AT_HOSPITAL', 'RETURNING', 'COMPLETED', 'CANCELLED', 'UNFULFILLED',
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  NEW: 'New',
  AWAITING_CONFIRMATION: 'Awaiting confirmation',
  SEARCHING_COMPANION: 'Searching companion',
  COMPANION_ASSIGNED: 'Companion assigned',
  COMPANION_ACCEPTED: 'Companion accepted',
  EN_ROUTE: 'En route',
  WITH_PATIENT: 'With patient',
  AT_HOSPITAL: 'At hospital',
  RETURNING: 'Returning',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  UNFULFILLED: 'Unfulfilled',
};

// FRD §53 state machine. Two ops-safety extensions are marked (*).
export const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['NEW', 'CANCELLED'],
  NEW: ['AWAITING_CONFIRMATION', 'CANCELLED'],
  AWAITING_CONFIRMATION: ['SEARCHING_COMPANION', 'CANCELLED'],
  SEARCHING_COMPANION: ['COMPANION_ASSIGNED', 'UNFULFILLED', 'CANCELLED'],
  COMPANION_ASSIGNED: ['COMPANION_ACCEPTED', 'SEARCHING_COMPANION', 'CANCELLED'],
  COMPANION_ACCEPTED: ['EN_ROUTE', 'SEARCHING_COMPANION' /* * companion withdrew */, 'CANCELLED' /* * */],
  EN_ROUTE: ['WITH_PATIENT', 'CANCELLED' /* * */],
  WITH_PATIENT: ['AT_HOSPITAL'],
  AT_HOSPITAL: ['RETURNING', 'COMPLETED'],
  RETURNING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  UNFULFILLED: [],
};

export const TERMINAL = ['COMPLETED', 'CANCELLED', 'UNFULFILLED'];
export const ACTIVE_SERVICE = ['COMPANION_ACCEPTED', 'EN_ROUTE', 'WITH_PATIENT', 'AT_HOSPITAL', 'RETURNING'];

export const BOARD_COLUMNS = [
  'NEW', 'AWAITING_CONFIRMATION', 'SEARCHING_COMPANION', 'COMPANION_ASSIGNED', 'COMPANION_ACCEPTED',
  'EN_ROUTE', 'WITH_PATIENT', 'AT_HOSPITAL', 'RETURNING', 'COMPLETED', 'CANCELLED',
];

export const URGENCY_LABEL: Record<string, string> = {
  ASAP: 'ASAP',
  WITHIN_2_HOURS: 'Within 2 hours',
  LATER_TODAY: 'Later today',
  SCHEDULED: 'Scheduled',
};
export const isUrgent = (u: string) => u === 'ASAP' || u === 'WITHIN_2_HOURS';

export const MOBILITY_LABEL: Record<string, string> = {
  INDEPENDENT: 'Walks independently',
  NEEDS_ASSISTANCE: 'Needs some assistance',
  BEDRIDDEN: 'No / Bedridden',
};

export const RELATIONSHIPS = ['Mother', 'Father', 'Spouse', 'Someone Else'];

export const SERVICE_TYPE_LABEL: Record<string, string> = {
  hospital_opd: 'Hospital / OPD',
  diagnostic: 'Diagnostic Test',
  admission: 'Hospital Admission Support',
  discharge: 'Hospital Discharge',
  doctor_appointment: 'Doctor Appointment',
  pharmacy: 'Pharmacy / Reports Pickup',
  not_sure: 'Not Sure / Speak to Us',
};

// FRD §17 predefined service events + FRD §16 companion flow
export interface EventDef {
  type: string;
  label: string;
  toStatus?: string;
  requires?: string[]; // allowed current statuses
  template?: string; // customer WhatsApp template
  customer: boolean;
}
export const SERVICE_EVENTS: EventDef[] = [
  { type: 'companion_dispatched', label: 'Companion dispatched', toStatus: 'EN_ROUTE', requires: ['COMPANION_ACCEPTED'], template: 'status_en_route', customer: true },
  { type: 'reached_parent', label: 'Companion reached parent', toStatus: 'WITH_PATIENT', requires: ['EN_ROUTE'], template: 'status_arrived', customer: true },
  { type: 'patient_verified', label: 'Patient identity verified', requires: ['WITH_PATIENT'], customer: false },
  { type: 'service_started', label: 'Service started', requires: ['WITH_PATIENT'], template: 'status_service_started', customer: true },
  { type: 'leaving_for_hospital', label: 'Leaving for hospital', requires: ['WITH_PATIENT'], template: 'status_leaving_home', customer: true },
  { type: 'reached_hospital', label: 'Reached hospital', toStatus: 'AT_HOSPITAL', requires: ['WITH_PATIENT'], template: 'status_at_hospital', customer: true },
  { type: 'registration_completed', label: 'Registration completed', requires: ['AT_HOSPITAL'], template: 'status_update', customer: true },
  { type: 'consultation_underway', label: 'Consultation underway', requires: ['AT_HOSPITAL'], template: 'status_update', customer: true },
  { type: 'tests', label: 'Tests in progress', requires: ['AT_HOSPITAL'], template: 'status_update', customer: true },
  { type: 'pharmacy', label: 'At pharmacy', requires: ['AT_HOSPITAL'], template: 'status_update', customer: true },
  { type: 'admission_underway', label: 'Admission underway', requires: ['AT_HOSPITAL'], template: 'status_update', customer: true },
  { type: 'returning_home', label: 'Returning home', toStatus: 'RETURNING', requires: ['AT_HOSPITAL'], template: 'status_returning', customer: true },
  { type: 'parent_home', label: 'Parent home', requires: ['RETURNING'], template: 'status_parent_home', customer: true },
  { type: 'handover_completed', label: 'Handover completed', requires: ['AT_HOSPITAL', 'RETURNING'], template: 'status_update', customer: true },
];

export const PAYMENT_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'];
export const ASSIGNMENT_STATUSES = ['OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED'];
export const INCIDENT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const VERIFICATION_CONTROLS: { key: string; label: string }[] = [
  { key: 'government_id_verified', label: 'Government ID verified' },
  { key: 'background_check_completed', label: 'Background check completed' },
  { key: 'interview_completed', label: 'Interview completed' },
  { key: 'hospital_navigation_training', label: 'Hospital navigation training' },
  { key: 'escalation_training', label: 'Escalation training' },
  { key: 'onboarding_completed', label: 'Onboarding completed' },
];

export function patientRef(relationship?: string | null, name?: string | null) {
  const r = (relationship || '').toLowerCase();
  if (r === 'mother') return 'your mother';
  if (r === 'father') return 'your father';
  if (r === 'spouse') return 'your spouse';
  if (name) return name;
  return 'your loved one';
}

export const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number(n) % 1 ? 2 : 0 });

export const fmtDuration = (mins: number | null | undefined) => {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};
