// Copy for the service landing pages (SEO). Each page is prerendered with Service + FAQPage schema.
export interface ServicePageContent {
  path: string;
  kicker: string;
  h1: string;
  lead: string;
  serviceName: string;
  serviceType: string;
  serviceDescription: string;
  includedTitle: string;
  included: [string, string][];
  stepsTitle: string;
  steps: [string, string][];
  whoTitle: string;
  who: string[];
  priceNote: string;
  faq: [string, string][];
  ctaTitle: string;
}

export const SERVICE_PAGES: ServicePageContent[] = [
  {
    path: '/opd-visit-companion-gurugram',
    kicker: 'OPD visit companion · Gurugram',
    h1: 'A trusted companion for your parent’s OPD visit in Gurugram',
    lead: 'A verified ChampOnCall companion picks your mother or father up from home, handles registration, queues and the doctor’s consultation with them, collects reports and medicines, and brings them home safely — while you get WhatsApp updates at every step.',
    serviceName: 'OPD visit companion',
    serviceType: 'Hospital OPD accompaniment for elderly parents',
    serviceDescription: 'A verified companion accompanies an elderly parent through an outpatient (OPD) hospital or clinic visit in Gurugram: pickup, registration, queues, consultation, tests, pharmacy and safe return home, with WhatsApp updates for the family.',
    includedTitle: 'What your parent gets on the day',
    included: [
      ['Pickup from home', 'The companion arrives before the appointment, verifies with a booking code and helps your parent into the cab.'],
      ['Registration & token', 'Front desk, UHID, insurance or corporate card counter, OPD token — handled for them.'],
      ['Waiting & queues', 'The companion stands in line so your parent can sit and rest.'],
      ['In the consultation', 'Sits beside your parent, helps them explain symptoms and notes down what the doctor says, so nothing is forgotten.'],
      ['Tests, pharmacy, reports', 'Blood tests, scans and X-rays, medicines picked up exactly as prescribed, reports collected and photographed for you.'],
      ['Home safely', 'Back home, settled in, and a short visit summary sent to you on WhatsApp.'],
    ],
    stepsTitle: 'How booking an OPD companion works',
    steps: [
      ['Message us on WhatsApp', 'Tell us the hospital, doctor and appointment time, and where your parent lives.'],
      ['We confirm a companion', 'Our operations team picks a background-checked companion near your parent and shares their name and number.'],
      ['Updates through the visit', 'Companion assigned, arrived, reached hospital, consultation, returning home — each one on WhatsApp.'],
      ['Pay after the visit', 'UPI, card or payment link once your parent is home.'],
    ],
    whoTitle: 'Families usually book this when',
    who: [
      'You work long hours or live in another city and can’t take a day off for every follow-up.',
      'Your parent can walk but finds big hospitals tiring and confusing on their own.',
      'There are several counters in one visit — consultation, tests, pharmacy, reports.',
      'You want someone to listen to the doctor and tell you exactly what was said.',
    ],
    priceNote: 'OPD visits are covered by our standard companion fee: the first 4 hours, then a per-hour rate. Cabs, parking and hospital fees are paid at actuals.',
    faq: [
      ['Which hospitals in Gurugram do you go to?', 'Our companions regularly accompany patients to Medanta, Artemis, Fortis Memorial (FMRI), Max, Paras, CK Birla, W Pratiksha, Manipal and most clinics and diagnostic centres across Gurugram. We are independent and not affiliated with any hospital.'],
      ['Will the companion go into the doctor’s room?', 'Yes, if your parent wants them to. They help explain symptoms, note the doctor’s advice and ask the questions you send us in advance.'],
      ['How long does an OPD visit usually take?', 'Most OPD visits in Gurugram take 3 to 4 hours door to door, which is what the base fee covers. Longer visits are charged per extra hour.'],
      ['Can you book the doctor’s appointment too?', 'You book the appointment with the hospital as usual and share the time with us. We plan the pickup around it.'],
      ['Is the companion a nurse or doctor?', 'No. Companions are trained, verified people who accompany and coordinate. They don’t give medical advice or treatment. In an emergency call 112 or 108.'],
    ],
    ctaTitle: 'Book an OPD companion for your parent',
  },
  {
    path: '/hospital-discharge-assistance-gurugram',
    kicker: 'Hospital discharge assistance · Gurugram',
    h1: 'Hospital discharge assistance in Gurugram, handled end to end',
    lead: 'Discharge day means a summary to collect, bills to settle, insurance approvals to chase and medicines to pick up — often over several hours. A ChampOnCall companion stays with your parent through all of it and gets them home safely.',
    serviceName: 'Hospital discharge assistance',
    serviceType: 'Hospital discharge coordination for elderly patients',
    serviceDescription: 'A verified companion coordinates an elderly patient’s hospital discharge in Gurugram: discharge summary, billing and insurance desk follow-ups, medicines, wheelchair and transport, and safe handover at home, with WhatsApp updates for the family.',
    includedTitle: 'What we handle on discharge day',
    included: [
      ['Stay with your parent', 'The companion arrives at the ward and stays with your parent until they are home.'],
      ['Discharge summary', 'Follows up with the nursing station until the summary and doctor’s instructions are ready, and photographs them for you.'],
      ['Billing & insurance desk', 'Queues at the billing and TPA/insurance counters and keeps you updated on approvals. You approve and make payments yourself.'],
      ['Medicines', 'Collects discharge medicines from the hospital pharmacy, checked against the prescription.'],
      ['Wheelchair & transport', 'Arranges a wheelchair to the gate and a cab home; tells you early if medical transport is needed instead.'],
      ['Settled at home', 'Helps your parent settle in, hands over papers and medicines, and sends you a summary on WhatsApp.'],
    ],
    stepsTitle: 'How discharge assistance works',
    steps: [
      ['Tell us the expected discharge', 'Share the hospital, ward or room and the expected discharge day, even if the time isn’t fixed yet.'],
      ['We plan the day', 'Our team assigns a verified companion and lines up a wheelchair and cab.'],
      ['Live updates', 'Summary ready, bill cleared, medicines collected, leaving hospital, home safely — on WhatsApp.'],
      ['Pay after the service', 'UPI, card or payment link once your parent is home.'],
    ],
    whoTitle: 'This helps most when',
    who: [
      'You can’t be at the hospital for the whole day the discharge drags on.',
      'Your parent is weak after a stay and shouldn’t manage counters alone.',
      'Insurance approval or billing needs someone standing at the desk.',
      'You live outside Gurugram or abroad and need eyes on the ground.',
    ],
    priceNote: 'Discharges usually take longer than an OPD visit. You pay our standard companion fee for the first 4 hours, then a per-hour rate; cabs and other costs are passed on at actuals. Hospital bills are paid directly to the hospital.',
    faq: [
      ['How long does a hospital discharge take in Gurugram?', 'Often 4 to 8 hours from the doctor’s discharge note to leaving the building, mostly waiting for the summary, billing and insurance approval. Our companion waits so your parent doesn’t have to manage alone.'],
      ['Do you pay the hospital bill?', 'No. Hospital, doctor and medicine bills are paid by you directly to the provider. The companion queues at the counters and keeps you updated so you can approve and pay.'],
      ['Can you handle insurance (TPA) approval?', 'The companion follows up at the TPA/insurance desk and shares updates and documents with you. The approval itself is between the hospital and your insurer.'],
      ['What if my parent cannot walk?', 'Tell us when you book. We arrange a wheelchair to the gate and will tell you if your parent needs medical transport or an ambulance instead of a cab.'],
      ['Can you also help with admission?', 'Yes — we offer admission support for paperwork, room allocation and settling in, priced for longer stays.'],
    ],
    ctaTitle: 'Plan your parent’s discharge with us',
  },
  {
    path: '/for-nri-families',
    kicker: 'For NRI families',
    h1: 'Your parents in Gurugram, looked after while you’re abroad',
    lead: 'When your mother or father needs to see a doctor and you’re in another country, ChampOnCall sends a verified companion to be with them — and keeps you updated on WhatsApp, in your time zone, from pickup until they’re home.',
    serviceName: 'Hospital companion for parents of NRIs',
    serviceType: 'Hospital accompaniment for elderly parents of NRI families',
    serviceDescription: 'For NRI families with parents in Gurugram: a verified companion accompanies the parent to hospital, OPD, diagnostics, admission or discharge, with live WhatsApp updates and a visit summary for children living abroad.',
    includedTitle: 'What you get from wherever you are',
    included: [
      ['Someone you can trust there', 'Every companion is ID-verified, background-checked and trained in hospital navigation and escalation.'],
      ['WhatsApp updates', 'Assigned, arrived, at hospital, consultation, tests, returning home — each milestone on WhatsApp, with a tracking link.'],
      ['The doctor’s words, written down', 'The companion notes what the doctor says and you get a short summary with photos of prescriptions and reports.'],
      ['Book from abroad', 'Message us on WhatsApp from any country. Your parent doesn’t need a smartphone.'],
      ['Pay after the visit', 'Nothing upfront. Our team shares a payment option that works for you, including from abroad.'],
      ['Operations team watching', 'Our Gurugram team monitors every active visit and calls you if anything changes.'],
    ],
    stepsTitle: 'How it works for families abroad',
    steps: [
      ['WhatsApp us from anywhere', 'Share your parent’s address in Gurugram, the hospital or clinic, and the time.'],
      ['We call your parent', 'With your permission, our team confirms details with your parent and introduces the companion.'],
      ['You follow along', 'Live updates on WhatsApp while you’re at work or asleep — read them when you wake up.'],
      ['Summary and payment', 'A visit summary when they’re home, then pay after the visit.'],
    ],
    whoTitle: 'NRI families use us for',
    who: [
      'Regular follow-ups and OPD visits for a chronic condition.',
      'Diagnostic tests and scans, with reports sent to you.',
      'Hospital admission and discharge days.',
      'Peace of mind that someone reliable is there when you can’t be.',
    ],
    priceNote: 'Same transparent pricing as every family: our standard companion fee for the first 4 hours, then a per-hour rate. No subscriptions.',
    faq: [
      ['Can I book and pay from outside India?', 'Yes. Book by WhatsApp from any country. You pay after the visit, and our team shares a payment option that works from abroad.'],
      ['Will I get updates in my time zone?', 'Updates arrive on WhatsApp the moment each milestone happens, so you can follow live or read them later. You also get a tracking link with the full timeline.'],
      ['Does my parent need a smartphone?', 'No. Our team calls your parent on a normal phone to confirm the visit, and the companion introduces themselves at the door with a booking code.'],
      ['Which areas do you cover?', 'All of Gurugram, including DLF Phases 1–5, Golf Course Road, Sohna Road, South City, Sushant Lok, Palam Vihar, Nirvana Country, New Gurugram and Manesar. Outside Gurugram, message us and we’ll check.'],
      ['Is this an emergency or home-nursing service?', 'No. Companions accompany and coordinate; they don’t give medical care. In an emergency, call 112 or 108.'],
    ],
    ctaTitle: 'Arrange a companion for your parent',
  },
];

export const servicePageFor = (path: string) => SERVICE_PAGES.find((p) => p.path === path);
