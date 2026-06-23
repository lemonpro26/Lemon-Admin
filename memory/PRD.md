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
- Mobile optimized for iOS + Android: safe-area (notch/home-indicator) insets, tap-highlight removal, overscroll lock; verified on 390px viewport.
- Removed the "Made with Emergent" badge from index.html (desktop + mobile).
- Vehicle data expanded: luxury/exotic brands (Bentley, Ferrari, Lamborghini, Rolls-Royce, Maserati, Aston Martin, McLaren, Jaguar, Alfa Romeo) + EVs (Rivian, Lucid, Polestar); "Other" make pinned last with RV/Motorhome/Camper Van models; makes sorted alphabetically; years reduced to 2026–2021.
- Company NAP updated: 9025 Wilshire Blvd #500, Beverly Hills, CA 90211; email info@lemonpros.com (contact, legal, notifications).
- Admin Hooks rebuilt as A/B testing manager: per-variant "% of serving" weight, target = Home page or a specific ad group, weighted serving seeded by session id (stable per visitor for clean attribution), per-hook stats (clicks, conversions, conv %). Grouped by target with normalized serving %.
- Lead-detail (and all) dialogs now scroll internally (max-h-90dvh / overflow-y-auto).

## Implemented (2026-06-18)
- Custom domain `apply.thelemonpros.com` linked (Entri CNAME → lemon-checker.emergent.host) — live.
- Verified end-to-end lead capture (all funnel fields) + Zapier CRM forwarding (HTTP 200, source="google ppc form").
- **Google Ads form-fill conversion (client-side tag)**: added `trackAdsConversion()` in `analytics.js`
  firing `gtag('event','conversion',{send_to:'AW-318021992/QndSCIqez8EcEOjC0pcB', value:1.0, currency:'USD'})`,
  called on the Thank-You page. Conversion action name in Google Ads: `LEMONPROS_CONV_SERVER`.
  (Replaces the prior GA4-only setup that sent NO conversion to Google Ads.)
- NOTE on offline/revenue upload: Google blocked legacy Google Ads API offline conversion upload for
  NEW developer tokens as of 2026-06-15 (token `w63ZtfmQuX8f3x0698fRjA` not allowlisted). Server-side
  revenue passback must use the new **Data Manager API** (not yet built). Customer ID: 962-766-5639.

## Implemented (2026-06-19)
- Admin Leads tab now shows a "Calls vs Form Leads" summary card row: Form Leads, Phone Calls,
  Total Leads (form + calls), and Form Conv. Rate — driven by `GET /api/admin/stats`, respects the date range.

## Implemented (2026-06-20)
- Admin Leads summary card row (Form Leads / Phone Calls / Total / Form Conv. Rate) wired to `/api/admin/stats`.
- Fixed Admin page not scrolling: `overflow-x: hidden` → `overflow-x: clip` on html/body/#root (the `hidden` value silently made the body a scroll container, blocking vertical scroll).
- DateRangeFilter now requires an explicit **Apply** click (no auto-apply on select); supports single-day picks.
- Analytics now shows **live campaigns only**: Google Ads sync fetches only ENABLED campaigns/ad-groups/ads and stores `live_campaigns`/`live_adgroups`; `/admin/analytics` filters out non-live numeric campaign IDs (keeps untracked/direct). "Sync names" refreshes the live list.

## Implemented (2026-06-20b)
- **Analytics drill-down**: Campaign → Ad Group → Ad → Keyword with a clickable breadcrumb, default sort by Clicks desc, and a Campaign-Type filter on the campaign list. `by_keyword` now grouped by campaign/adgroup/ad/keyword so it nests under an Ad. By Sitelink kept as its own section (the "no data" was a date-range artifact; data shows with a wide range).
- **Hooks upgrades**: search box; per-hook Hide (view-only, does NOT pause serving) with a Show-hidden toggle; "Move target" forks a brand-new hook on the new target (Home/Ad Group/Ad) and pauses the original (stats preserved); create-hook + move dropdowns show ad-group/ad NAMES. `/admin/ad-entities` returns campaigns/adgroups/ads with names; `HookRuleBody.hidden` added.
- **Date filter**: ◀ ▶ single-day step arrows added beside the range picker.
- **Unnamed campaigns**: confirmed none in current data after the live-campaign filter (leftover TEST_CAMPAIGN lead purged). Any unnamed rows the user still sees are on PRODUCTION until re-deploy.
- Verified by testing agent: 12/12 frontend checks PASS, no bugs.

## Implemented (2026-06-20c)
- **Sitelinks live from Google Ads**: new `fetch_sitelink_metrics(start, end, campaign_ids)` (GAQL `FROM campaign_asset WHERE field_type='SITELINK'`, scoped to the live campaign IDs so only THIS landing page's campaigns are counted — not unrelated/historic ones) + `GET /admin/google-ads/sitelinks?start&end`. The Analytics "By Sitelink" section shows real Impressions / Clicks / CTR / Conversions with a "Live from Google Ads" badge.

- **Organic vs paid-untracked split**: the campaign-level "(untracked/direct)" row is now data-driven — split into "Organic" (no gclid/wbraid/gbraid) and "Google Ads (untracked)" (has a Google click id but no campaign id). Only genuinely organic traffic is labeled "Organic". (`/admin/analytics` `_untracked_split`.)

## Implemented (2026-06-22)
- **Header/branding**: logo wordmark now "The LemonPros"; mobile header shows compact "Secure" badge (no logo overlap); added "CALL NOW" label under header phone. Terms/Privacy email → info@thelemonpros.com. SEO `<meta description>` + `<title>` rewritten (removed "A product of emergent.sh").
- **Zapier CRM**: lead payload now includes `landing_page=apply.thelemonpros.com` (alongside `source`). Verified delivered 200.
- **Offline conversions migrated to Google Data Manager API** (`datamanager_service.py`, `events:ingest`). Wired into `_upload_lead_conversion`, `/admin/google-ads/status`. New Import/UPLOAD_CLICKS conversion action created by user — ctId `7658454424` (category PURCHASE, ENABLED). Validate-only test PASSES for both leads and calls (gclid + hashed email/phone matching). Still in VALIDATE_ONLY mode.
- **Phone-call revenue passback (NEW)**: calls captured via CTM webhook (`/calls/webhook?token=...`) now support "Mark as Sold & Send to Google Ads" in the Calls tab — `POST /admin/calls/{id}/sold` + `/conversion/retry`, `_upload_call_conversion` (matches on call gclid + caller phone). Calls tab UI: Revenue column, conversion badge, detail dialog. Curl-verified end-to-end (validated).

## Backlog / Next
- **Advertorial presell page `/pa` (NEW, 2026-06-23)**: standalone law-firm advertorial (PresellPA.jsx) that funnels into the existing flow; homepage `/` untouched. Includes "Meet Your Attorney" section with Michael Saeedian's real headshot, law-firm footer (firm name, Beverly Hills address, phone, Attorney Advertising disclaimer, same legal links as main site), popular-make picker → /flow/year. Verified iteration_10 (100%) + photo/name/legal follow-up verified via screenshot.
- **Company renamed "Lemon Pros" → "The Lemon Pros"** site-wide (COMPANY.name, footer, legal docs). Legal docs (Terms/Privacy/Do-Not-Sell, shared site-wide) updated to LAW-FIRM positioning (removed "not a law firm"/"connects with independent attorneys"; added attorney-client + engagement-agreement language).
- **Auto call conversions → Google Ads (2026-06-23)**: conversion action 7659418481; qualified CTM calls (≥60s, w/ gclid) auto-upload (value 0, PHONE). Verified iteration_9.
- **Call→hook attribution (iteration_8)**, **landing hook flash fix (iteration_7)** done.
- **P0**: Confirm CTM actually delivers calls AND passes `gclid` (prod DB only had the diagnostic call; verify CTM webhook URL + add gclid merge field + install CTM tracking script on landing page for DNI).
- P1: User to provide SMTP creds for live email notifications.
- P2: "Hook performance from calls" summary (calls + revenue grouped by hook variant).
- P2: Vehicle "problem/defect" step to better qualify leads.
