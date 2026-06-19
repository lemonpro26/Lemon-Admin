
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
