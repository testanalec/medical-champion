// Full relational schema for the Medical Champion platform (FRD §31-§33).
// Idempotent: safe to run on every cold start.
export const SCHEMA_VERSION = 3;

export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS schema_meta (
  id int PRIMARY KEY DEFAULT 1,
  version int NOT NULL,
  seeded_at timestamptz
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  password_hash text NOT NULL,
  role_id text NOT NULL REFERENCES roles(id),
  active boolean NOT NULL DEFAULT true,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('user','companion')),
  subject_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_subject_idx ON sessions(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_phone_idx ON otp_codes(phone, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  scope text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  radius_km double precision NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text NOT NULL,               -- '*' = all services
  base_fee numeric(12,2) NOT NULL,
  included_minutes int NOT NULL,
  extension_rate_per_hour numeric(12,2) NOT NULL,
  extension_block_minutes int NOT NULL DEFAULT 60,
  tax_percent numeric(5,2) NOT NULL DEFAULT 0,
  urgent_surcharge numeric(12,2) NOT NULL DEFAULT 0,
  service_area_id uuid REFERENCES service_areas(id),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL UNIQUE,
  email text,
  city text,
  source text,
  utm jsonb NOT NULL DEFAULT '{}',
  notes text,
  consent_privacy_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  name text,
  age int,
  gender text,
  relationship text,
  phone text,
  address text,
  mobility text,
  language text,
  special_instructions text,
  consent_given boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patients_customer_idx ON patients(customer_id);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text,
  place_name text,
  lat double precision,
  lng double precision,
  source text NOT NULL DEFAULT 'typed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  photo_url text,
  gender text,
  service_area_id uuid REFERENCES service_areas(id),
  languages text[] NOT NULL DEFAULT '{}',
  skills text[] NOT NULL DEFAULT '{}',
  availability text NOT NULL DEFAULT 'OFFLINE' CHECK (availability IN ('AVAILABLE','OFFLINE','BUSY')),
  current_lat double precision,
  current_lng double precision,
  home_area text,
  last_seen_at timestamptz,
  government_id_verified boolean NOT NULL DEFAULT false,
  background_check_completed boolean NOT NULL DEFAULT false,
  interview_completed boolean NOT NULL DEFAULT false,
  hospital_navigation_training boolean NOT NULL DEFAULT false,
  escalation_training boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  suspended boolean NOT NULL DEFAULT false,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,
  notes text,
  joined_at date DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS request_number_seq START 10452;
CREATE SEQUENCE IF NOT EXISTS incident_number_seq START 1001;

CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  patient_id uuid REFERENCES patients(id),
  channel text NOT NULL DEFAULT 'whatsapp',
  source text,
  utm jsonb NOT NULL DEFAULT '{}',
  service_type text NOT NULL,
  urgency text NOT NULL,
  requested_datetime timestamptz,
  pickup_location_id uuid REFERENCES locations(id),
  destination_location_id uuid REFERENCES locations(id),
  destination_undecided boolean NOT NULL DEFAULT false,
  mobility_status text,
  special_instructions text,
  current_status text NOT NULL,
  human_review_required boolean NOT NULL DEFAULT false,
  human_review_reason text,
  emergency_review boolean NOT NULL DEFAULT false,
  out_of_area boolean NOT NULL DEFAULT false,
  sla_risk boolean NOT NULL DEFAULT false,
  sla_risk_reason text,
  incident_flag boolean NOT NULL DEFAULT false,
  service_area_id uuid REFERENCES service_areas(id),
  assigned_companion_id uuid REFERENCES companions(id),
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  verified_at timestamptz,
  verification_method text,
  verification_result text,
  service_start_time timestamptz,
  service_end_time timestamptz,
  service_duration_minutes int,
  completion_type text,
  completion_notes text,
  cancellation_reason text,
  cancelled_by text,
  payment_status text NOT NULL DEFAULT 'NOT_DUE',
  pricing_rule_id uuid REFERENCES pricing_rules(id),
  quoted_amount numeric(12,2),
  final_amount numeric(12,2),
  charge_breakdown jsonb,
  booking_code text NOT NULL,
  tracking_token text NOT NULL,
  confirmed_at timestamptz,
  assigned_at timestamptz,
  accepted_at timestamptz,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sr_status_idx ON service_requests(current_status);
CREATE INDEX IF NOT EXISTS sr_created_idx ON service_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS sr_customer_idx ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS sr_companion_idx ON service_requests(assigned_companion_id);

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id),
  companion_id uuid NOT NULL REFERENCES companions(id),
  status text NOT NULL CHECK (status IN ('OFFERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED','COMPLETED')),
  offered_by uuid,
  offered_by_name text,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  decline_reason text,
  eta_minutes int,
  distance_km double precision,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expiry_alerted boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS asg_request_idx ON assignments(request_id);
CREATE INDEX IF NOT EXISTS asg_companion_idx ON assignments(companion_id, status);

CREATE TABLE IF NOT EXISTS status_events (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES service_requests(id),
  event_type text NOT NULL,
  label text NOT NULL,
  from_status text,
  to_status text,
  actor_type text NOT NULL,
  actor_id text,
  actor_name text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}',
  customer_visible boolean NOT NULL DEFAULT true,
  notification_status text NOT NULL DEFAULT 'NONE',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS se_request_idx ON status_events(request_id, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_type text NOT NULL,
  actor_id text,
  actor_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text,
  before jsonb,
  after jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  mime text NOT NULL,
  size int NOT NULL,
  filename text,
  data bytea NOT NULL,
  uploaded_by_type text,
  uploaded_by_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id),
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL CHECK (status IN ('CREATED','PENDING','AUTHORIZED','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED','CANCELLED')),
  provider text NOT NULL,
  provider_order_id text,
  provider_payment_id text,
  payment_link_url text,
  method text,
  refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  failure_reason text,
  paid_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_request_idx ON payments(request_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id bigserial PRIMARY KEY,
  payment_id uuid REFERENCES payments(id),
  provider_event_id text UNIQUE,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PROCESSED',
  provider_refund_id text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id),
  category text NOT NULL,
  amount numeric(12,2) NOT NULL,
  description text,
  receipt_file_id uuid REFERENCES files(id),
  bill_to_customer boolean NOT NULL DEFAULT true,
  submitted_by_type text NOT NULL,
  submitted_by_id text,
  submitted_by_name text,
  approval_status text NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exp_request_idx ON expenses(request_id);

CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  companion_id uuid REFERENCES companions(id),
  overall int NOT NULL CHECK (overall BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trust response stored separately from the star rating (FRD §23)
CREATE TABLE IF NOT EXISTS trust_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  trust_again boolean NOT NULL,
  reason text,
  referral_intent boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number text NOT NULL UNIQUE,
  request_id uuid REFERENCES service_requests(id),
  companion_id uuid REFERENCES companions(id),
  severity text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  category text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED')),
  reporter_type text NOT NULL,
  reporter_id text,
  reporter_name text,
  actions text,
  escalation text,
  resolution text,
  closed_by text,
  closed_at timestamptz,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id),
  escalation_type text NOT NULL DEFAULT 'MEDICAL_EMERGENCY',
  reason text NOT NULL,
  action_taken text,
  notes text,
  resolution text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  agent_id text,
  agent_name text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES service_requests(id),
  status_event_id bigint,
  event text NOT NULL,
  recipient_type text NOT NULL,
  recipient text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('WHATSAPP','SMS','INTERNAL','EMAIL','PUSH')),
  template text,
  variables jsonb NOT NULL DEFAULT '{}',
  title text,
  body text,
  severity text NOT NULL DEFAULT 'INFO',
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','DELIVERED','READ','FAILED')),
  provider_message_id text,
  error text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  acknowledged_by text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_channel_idx ON notifications(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_request_idx ON notifications(request_id);

CREATE TABLE IF NOT EXISTS message_templates (
  key text PRIMARY KEY,
  name text NOT NULL,
  body text NOT NULL,
  buttons jsonb NOT NULL DEFAULT '[]',
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  wa_phone_number text NOT NULL UNIQUE,
  profile_name text,
  active_request_id uuid REFERENCES service_requests(id),
  current_step text NOT NULL DEFAULT 'START',
  draft jsonb NOT NULL DEFAULT '{}',
  session_status text NOT NULL DEFAULT 'ACTIVE',
  source text,
  sim_owner text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES wa_conversations(id),
  direction text NOT NULL CHECK (direction IN ('IN','OUT')),
  provider_message_id text UNIQUE,
  msg_type text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'SENT',
  notification_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wam_conv_idx ON wa_messages(conversation_id, created_at);

-- Immutability guards (FRD §5, §30): history must never be silently overwritten
CREATE OR REPLACE FUNCTION mc_guard_status_events() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'status_events are immutable';
  END IF;
  IF (NEW.request_id, NEW.event_type, NEW.label, NEW.from_status, NEW.to_status, NEW.actor_type, NEW.actor_id, NEW.notes, NEW.created_at)
     IS DISTINCT FROM
     (OLD.request_id, OLD.event_type, OLD.label, OLD.from_status, OLD.to_status, OLD.actor_type, OLD.actor_id, OLD.notes, OLD.created_at) THEN
    RAISE EXCEPTION 'status_events are immutable (only notification_status may change)';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS status_events_guard ON status_events;
CREATE TRIGGER status_events_guard BEFORE UPDATE OR DELETE ON status_events
  FOR EACH ROW EXECUTE FUNCTION mc_guard_status_events();

CREATE OR REPLACE FUNCTION mc_guard_audit() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_guard ON audit_logs;
CREATE TRIGGER audit_logs_guard BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION mc_guard_audit();
`;
