
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
