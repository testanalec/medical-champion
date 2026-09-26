# Medical Champion — On-Demand Medical Companion Platform

*When you can't be there, we can.*

An operations-led service-orchestration platform (per the FRD) for Gurugram. There are four connected systems on one backend and one auditable service-request lifecycle:

| System | Path | Highlights |
|---|---|---|
| Customer website | `/` | Landing page, emergency gate, WhatsApp and call CTAs, services, medical boundary, config-driven pricing, service area, FAQ, online booking (`/book`), tracking (`/track/:id`), payment (`/pay/:id`), rating and trust |
| WhatsApp booking | `/whatsapp` + `/api/v1/whatsapp/webhook` | Full conversational flow (FR-WA-001…017) on Meta Cloud API webhooks: idempotent message IDs, location messages, list and button replies, status webhooks. An in-browser channel uses the same engine until the business number is connected |
| Operations portal | `/ops` | Live queue (board and list, filters, SLA risk), request detail, manual dispatch with decision support, escalations, incidents, payments and refunds, expenses, customers and patients, companion management and verification, reports and north-star metrics, notification log, WhatsApp conversations, settings, users and RBAC, audit log |
| Companion PWA | `/companion` | Mobile OTP login, availability, job offers with countdown, accept/decline, step-by-step service flow, booking-code verification, service timer, expenses with receipt photos, notes, incident/SOS, completion, and an offline action queue |

## Architecture
- **API**: TypeScript modular monolith (`src/server`) bundled to a single Vercel Node function (`api/index.js`), with modules for auth/RBAC, lifecycle state machine, dispatch, WhatsApp, notifications, payments, pricing, SLA, geo, reports and admin.
- **DB**: PostgreSQL (Neon on Vercel). The schema auto-migrates and seeds demo data on the first request. `status_events` and `audit_logs` are immutable at the database level through triggers.
- **Frontend**: React 19 SPA + Tailwind v4 (`src/client`), prebuilt to `public/`.
- **Integrations**: Razorpay (payment links, signed webhooks, refunds), WhatsApp Cloud API, SMS adapter, and OpenStreetMap plus a built-in Gurugram gazetteer. Each integration has a safe sandbox mode.

## Environment variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (added automatically by Vercel ↔ Neon) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Live WhatsApp (number +91 92056 40777) |
| `WHATSAPP_WABA_ID` | WhatsApp Business Account ID, used to submit and track message templates from Ops |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Live payments |
| `CRON_SECRET` | Protects `/api/v1/cron/tick` |
| `PUBLIC_BASE_URL` | Optional canonical URL used in WhatsApp links |

## Going live
1. Ops → Settings → Security & integrations → **WhatsApp templates in Meta** → *Submit to Meta for approval*. This covers `mc_service_update` (updates after 24 h of silence) and `mc_login_code` (companion login codes).
2. Same page → **Go live**. It clears all demo/test data, creates your own Super Admin, disables the demo logins and turns demo mode off.
3. Add real companions in Ops → Companions. They sign in at `/companion` with a code that arrives on WhatsApp.

## Demo logins
Operations: `admin@ / manager@ / agent@ / finance@ / support@medicalchampion.in` with passwords `Admin@123`, `Manager@123`, `Agent@123`, `Finance@123` and `Support@123`.
Companion: mobile `7000000101`. In demo mode the OTP is shown on screen. Turn demo mode off in Settings → Security before going live.

## Development
```bash
npm run build       # bundles api/ and public/ (esbuild + tailwind)
npm start           # local server on :3000 (needs Postgres at DATABASE_URL or localhost/mc)
node scripts/api-flow.mjs   # API acceptance test (FRD §54)
node scripts/e2e.mjs        # browser acceptance test across all apps
```
