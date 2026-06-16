# Lemon Pros — Lemon Law Lead Funnel

## Original Problem Statement
Build a landing page based on code from https://github.com/khalfinmike26/garage-sales to create a
"Lemon Pros" landing page. Funnel order: Car Year → Car Make → Car Model → Name → Address → Phone → Email.
Include a list of years, car makes with logos, and car models (shown after the make is chosen).
Replace "Licensed and Bonded" with "100% Free Consultation". Backend built the same.

## User Choices
- Purpose: Lemon law legal help for defective vehicles.
- On lead completion: save to DB + email notification + POST to CRM (CRM API provided later).
- Design: same as the GitHub repo (garage-sales funnel design, rebranded).
- Car data: built-in list of popular makes + models.
- Branding: user to attach (none provided yet → Lemon Pros identity created: lemon-yellow + navy).

## Architecture
- **Frontend**: React 19 + CRACO + Tailwind + shadcn/ui + framer-motion. Multi-step funnel with
  persistent shell (header progress bar, fixed car-lot band footer).
- **Backend**: FastAPI + Motor (MongoDB). JWT admin auth, lead capture, Google Ads attribution
  tracking, IP/ZIP geo personalization ({!city}/{!state} hooks), admin dashboard, SMTP email,
  optional CRM webhook.
- Adapted verbatim from the garage-sales repo, rebranded to Lemon Pros with a vehicle funnel.

## Key Files
- `frontend/src/lib/carData.js` — years, makes (+logo CDN), models per make.
- `frontend/src/lib/funnel.js` — 7-step funnel definition (year/make/model/name/address/phone/email).
- `frontend/src/pages/FunnelStep.jsx` — step renderers (year/make/model grids + form steps).
- `frontend/src/pages/Landing.jsx` — hero + "Check If Your Car Qualifies" CTA + trust badges.
- `backend/server.py` — `/api/leads` (car fields), CRM webhook, config/hooks, admin, metrics.
- `backend/email_service.py` — Lemon Pros email templates (team notify + thank-you).

## Implemented (2026-06-16)
- Full Lemon Pros rebrand of the garage-sales funnel (logo, copy, legal docs, footer, emails).
- Vehicle funnel: Year grid → Make logo grid → Model grid (make-dependent) → Name → Address → Phone → Email.
- Car logos from public CDN (filippofilip95/car-logos-dataset), ~32 makes + models.
- "100% Free Consultation" trust badge (replaces Licensed/Insured).
- Backend lead model extended with car_year/car_make/car_model; CRM webhook forwarding added.
- Admin dashboard, JWT auth, geo hooks all carried over.

## Backlog / Next
- P1: User to provide CRM API endpoint → set `CRM_WEBHOOK_URL` in backend/.env.
- P1: User to provide SMTP creds for live email notifications.
- P1: User to attach final brand logo/colors → swap Logo.jsx + accent colors.
- P2: Vehicle "problem/defect" step + repair-attempts question to better qualify lemon-law leads.
- P2: Make/model search filter for faster selection on long lists.
