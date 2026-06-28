

## 2026-06-28 — Post-redeploy verification (iteration_17, 100% pass)
Batch verified end-to-end (backend 12/12, frontend 8/8), now live on production.
- Header red Call CTA (#EF4444) with phone + CALL NOW/LLAME AHORA on Home/PA/Spanish, desktop+mobile; number visible on mobile; Spanish mobile hides "LEMON LAW HELP" subtitle (Logo hideSubtitle when lang=es); xs non-absolute logo => no overlap at 360/390px. PA header (pa-header-call) updated to match.
- PA page: attorney badges one-line on desktop; school line bold; red "See If My Car Qualifies" CTA under settlements.
- Google Ads reconnected: regenerated OAuth refresh token; consent screen set to "In production" (stops 7-day expiry). google_ads_connected=true; sync pulls 6 campaigns/12 adgroups/17 ads/34 sitelinks. NOTE: production GOOGLE_ADS_REFRESH_TOKEN must be set via deployment settings (separate from preview .env).
- Funnel: Phone Calls box; All-Pages conversion=(leads+calls)/views; per-page "Campaigns feeding [page]" (GET /admin/funnel/campaigns).
- Split Test: date filter defaults Today; "All time" removed; inline rename after launch; no banner flash.
- Calls tab: search across all calls (ignores date); Live auto-refresh badge. Leads: Live auto-refresh; IP Address in View Lead (POST /leads stores `ip`).
- Analytics: per-row Bounce% breakdown popover (Converted/Engaged-no-lead/Bounced); backend returns per-row `bounced`.
- PA Page CMS tab edits all /pa copy + "See page" preview iframe. Team activity history (owner-only): db.admin_activity; GET /admin/users/{username}/activity. Admin tab persistence (localStorage). Timezone-correct date filtering (client tz_offset).

### Deferred / Known
- DEFERRED: self-service username/password change for team members in Settings (started, paused; integration_expert consulted; plan: unified /admin/me/credentials PBKDF2+JWT + Settings UI).
- Dev-only console warning in Split Test (`<span>` in `<select>` editor annotation) — harmless, prod unaffected.
- server.py ~2779 lines — router refactor pending.


## 2026-06-22 — New bindright-style design shipped to the MAIN site
- Approved mockup ported to real public pages. Shared chrome updated: SiteHeader
  (navy, centered light lemon logo, "safe & secure" white text, big phone with
  click-to-call conversion, funnel-aware Back + red progress bar) and SiteFooter
  (navy, links: Terms/Do-Not-Sell/Privacy/Contact + copyright).
- PublicShell now full-bleed smooth highway+sky scene behind content (replaces
  SuburbanBand houses). Landing restyled: bold Poppins (font-mock) headline + CTA
  card; all /track/click + /config/public + start() logic preserved. Hero now shows
  fallback copy instantly (no blank-hero flash).
- FunnelStep restyled into a white card with bold Poppins question; all step logic
  (selectAndNext/goNext/submitLead + field verification) unchanged. Footer pages
  (Contact/LegalPage) inherit the new navy chrome.
- Verified by testing agent: 7/7 PASS incl. real Zapier lead submission → thank-you,
  no JS errors (iteration_6.json). Mockup routes /mockup + /mockup/funnel still exist.
- ACTION: user must click "Re-deploy changes" to push to production (apply.thelemonpros.com).


## 2026-06-20 (pm2) — Hook target picker redesign + master-admin credential change
- Hooks "Create a Hook" → "Show this hook on" is now a tab/pill drill-down:
  Home pill + a pill per campaign; clicking a campaign reveals "Entire campaign"
  + ad-group pills. cForm now uses tCampaign/tAdgroup; campaign-level targeting
  (match_campaign only) is now creatable from the UI (backend already supported it).
  "Showing on:" summary line reflects the selection.
- Master Admin Credentials: owner can change own username/password in Settings →
  Users (owner-creds-card, owner only). Backend: PUT /admin/owner-credentials
  (require_owner, verifies current password, stores custom creds in db.admin_owner
  singleton, re-issues JWT). /admin/login checks custom owner creds; env
  ADMIN_PASSWORD remains an always-valid recovery password. list_users shows the
  real owner username.
- Verified: testing agent 15/15 frontend checkpoints PASS (iteration_5.json);
  owner cred flows + env recovery curl-verified.


## 2026-06-20 (pm) — Automatic bot-click cleaning (hands-off)
- _auto_clean_bot_clicks() runs on every GET /admin/analytics and /admin/stats:
  silently deletes (all-time) bot user-agent hits + fake paid clicks (campaign
  tag, no gclid/wbraid/gbraid). Real paid clicks kept. No UI, no button.
- Removed the manual "Clean bot traffic" button from AdminAnalytics (user wanted
  it fully automatic and never shown). diagnose/purge-bots endpoints retained.

## 2026-06-20 — Phantom/bot click fix (Demand gen showing fake clicks)
- ROOT CAUSE: AdsBot-Google crawls landing pages of every ENABLED campaign
  (even ones not serving today). These hits carry the campaign's tg_ref but NO
  gclid; real paid clicks always have a gclid/wbraid/gbraid. The old filter only
  hid NOT-ENABLED campaigns, so AdsBot traffic on still-enabled "Demand gen"
  slipped through as ~107 clicks.
- Ingestion: /track/click now drops known bots (is_bot_ua / _BOT_UA_RE: AdsBot,
  Googlebot, crawlers, headless, monitors, http libs) -> returns {bot:true}, no insert.
- GET /admin/clicks/diagnose?campaign_id&start&end -> classifies clicks
  (real_paid vs fake_paid [campaign, no gclid] vs bot_user_agent) + top fake UAs.
- POST /admin/clicks/purge-bots?campaign_id&start&end -> permanently deletes
  bot-UA hits + fake paid clicks (campaign tag, no gclid). Real paid kept.
- Admin Analytics: "Clean bot traffic" button (data-testid analytics-clean-bots)
  diagnoses all-time, confirms count, then purges. Verified via curl (kept 5 real
  paid, removed bot/fake). NOTE: user must run this in PRODUCTION to clear the 107.

## 2026-06-19 — Google Ads names, spam blocking, admin cleanup
- Google Ads API (REST v21) integration: auto-fetch campaign/ad-group/ad NAMES by ID.
  - google_names_service.py + POST /api/admin/ad-labels/sync-google (6h cache, force param).
  - Auto-syncs on Analytics load + manual "Sync names" button. Env: GOOGLE_ADS_* in backend/.env.
  - OAuth app PUBLISHED (token no longer 7-day-expiry). Customer 9627665639.
- Manual ad-label override: POST /api/admin/ad-labels (pencil edit in Analytics).
- Spam blocking: leads from googlesyndication.com / doubleclick.net referrer silently dropped
  (BLOCKED_REFERRER_SUBSTRINGS). referrer captured in tracking.js -> lead/click.
- Hook attribution fix: leads inherit click's matched_rule_id (POST /admin/leads/reattribute-hooks backfill).
- Delete leads: DELETE /api/admin/leads/{id} + row trash icon + detail button.
- Removed mock Media-Buying (Metrics) tab + demo hooks. POST /admin/data/purge-test (clears test leads+clicks).
- gbraid/wbraid mobile click-id capture. Click-to-call conversion (AW-318021992/I_x1CMbE2cEcEOjC0pcB).
- Lead-form conversion (AW-318021992/QndSCIqez8EcEOjC0pcB) on ThankYou.
- SMTP email_service supports SSL(465) + STARTTLS(587). Pending user SMTP creds.

## 2026-06-19 (pm) — All-campaign-type tracking, sitelinks, Calls tab
- Calls tab (AdminCalls.jsx) fed by CallTrackingMetrics webhook:
  POST /api/calls/webhook?token=<CALLS_WEBHOOK_TOKEN> (accepts JSON or form). Admin: GET /admin/calls, DELETE /admin/calls/{id}.
- Campaign-name sync now covers ALL campaign types (PMax, Demand Gen, etc.) + stores campaign advertising_channel_type.
  Analytics shows a 'Type' column (Search/Performance Max/Demand Gen).
- Sitelink tracking: capture feeditemid + extensionid -> sitelink_id on click/lead. New 'By Sitelink' analytics section;
  sitelink names pulled from Google Ads (asset.sitelink_asset.link_text). google_names_service.fetch_names returns sitelink + campaign_type.
- Verified via testing_agent iteration_3.json: 7/7 frontend checks pass.
- NOTE: user must ensure Google Ads tracking template includes feeditemid={feeditemid} & extensionid={extensionid} for sitelink data.
- STILL PENDING: user's SMTP credentials for own-server lead emails; CallTrackingMetrics webhook URL paste (needs CTM Admin/Manager role).
