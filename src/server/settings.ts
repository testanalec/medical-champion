import { sql } from './db';

export const SERVICE_TYPES = [
  { id: 'hospital_opd', label: 'Hospital / OPD' },
  { id: 'diagnostic', label: 'Diagnostic Test' },
  { id: 'admission', label: 'Hospital Admission Support' },
  { id: 'discharge', label: 'Hospital Discharge' },
  { id: 'doctor_appointment', label: 'Doctor Appointment' },
  { id: 'pharmacy', label: 'Pharmacy / Reports Pickup' },
  { id: 'not_sure', label: 'Not Sure / Speak to Us' },
];

export const DEFAULT_SETTINGS: Record<string, any> = {
  brand: {
    name: 'Medical Champion',
    tagline: "When you can't be there, we can.",
    city: 'Gurugram',
  },
  contact: {
    support_phone: '+911244000000',
    support_phone_display: '+91 124 400 0000',
    whatsapp_number: '',
    whatsapp_prefill: "Hi, I need a companion for my parent's hospital visit.",
    support_email: 'care@medicalchampion.in',
    support_hours: '7 AM – 11 PM, all days',
  },
  emergency: {
    primary_number: '112',
    primary_label: 'National Emergency Number',
    ambulance_number: '108',
    ambulance_label: 'Ambulance',
    validated_for_production: false,
  },
  sla: {
    urgent_dispatch_minutes: 15,
    acceptance_minutes: 5,
    arrival_minutes: 60,
    offer_expiry_minutes: 5,
    scheduled_dispatch_lead_minutes: 120,
  },
  lists: {
    cancellation_reasons: [
      'Customer cancelled – plans changed',
      'Customer cancelled – arranged family member',
      'Duplicate request',
      'Outside service area',
      'No companion available',
      'Medical emergency – redirected to emergency services',
      'Unable to reach customer',
      'Other',
    ],
    incident_categories: [
      'Patient health deterioration',
      'Fall/injury',
      'Transport issue',
      'Hospital issue',
      'Customer complaint',
      'Companion safety',
      'Payment dispute',
      'Privacy/security',
      'Other',
    ],
    expense_categories: ['Transport', 'Parking', 'Pharmacy', 'Registration/Hospital fee', 'Food & water', 'Miscellaneous approved expense'],
    completion_types: ['Parent returned home', 'Parent admitted', 'Handed over to family/authorized person', 'Other'],
    languages: ['Hindi', 'English', 'Punjabi', 'Haryanvi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Urdu'],
  },
  verification: {
    required: [
      'government_id_verified',
      'background_check_completed',
      'interview_completed',
      'hospital_navigation_training',
      'escalation_training',
      'onboarding_completed',
    ],
    public_claims: ['Government ID verified', 'Background checked', 'Trained in hospital navigation & escalation'],
  },
  retention: {
    customer_contact_days: 1095,
    service_history_days: 2555,
    whatsapp_messages_days: 180,
    location_days: 90,
    identity_documents_days: 365,
    expense_receipts_days: 2555,
    payment_references_days: 2920,
    incident_records_days: 2555,
    audit_logs_days: 2555,
  },
  payout: {
    companion_base: 650,
    companion_per_extra_hour: 150,
  },
  security: {
    otp_ttl_seconds: 300,
    demo_mode: true,
  },
};

export async function getSetting(key: string): Promise<any> {
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  const def = DEFAULT_SETTINGS[key] ?? {};
  return rows[0] ? { ...def, ...rows[0].value } : def;
}

export async function getAllSettings() {
  const rows = await sql`SELECT key, value FROM settings`;
  const out: Record<string, any> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = { ...DEFAULT_SETTINGS[k] };
  for (const r of rows) out[r.key] = { ...(DEFAULT_SETTINGS[r.key] ?? {}), ...r.value };
  return out;
}

export async function setSetting(key: string, value: any, by: string) {
  await sql`INSERT INTO settings (key, value, updated_by) VALUES (${key}, ${sql.json(value)}, ${by})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
}

export const serviceTypeLabel = (id: string) => SERVICE_TYPES.find((s) => s.id === id)?.label ?? id;

export function integrationStatus() {
  return {
    whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    razorpay: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    sms: !!process.env.SMS_PROVIDER_KEY,
    maps: true, // OpenStreetMap / built-in gazetteer
  };
}
