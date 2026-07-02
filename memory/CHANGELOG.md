# Changelog

## 2026-07-02
- FEATURE: Google Ads call-detail enrichment. Pull `call_view` (call type + campaign + status) from Google Ads and match to CTM calls.
  - `google_names_service.fetch_call_views()`: GAQL over `call_view`. NOTE `segments.date` is prohibited on call_view — filter on `call_view.start_call_date_time` instead. Google returns times in the ACCOUNT timezone with no offset; we read `customer.time_zone` and convert to UTC.
  - Matching (`_enrich_calls_with_google` in server.py): fuzzy match on caller **area code** + start time (±15 min) + duration (±25s). Google does NOT expose the full caller number via API (only area code), so this is best-effort by design (user accepted). Adds `google_matched`, `google_call_type`, `google_campaign`, `google_call_status` to the call doc. Fetch window buffered by 1 day to avoid tz-boundary misses.
  - Triggers: on every CTM call webhook (best-effort, Google data lags) + `_google_call_sync_loop` every 20 min catch-up + manual `POST /admin/calls/sync-google`.
  - Frontend (AdminCalls.jsx): "Sync Google calls" button, green "Google Ads" badge, campaign column shows Google campaign + "<type> · via Google", detail dialog "Google Ads call details" section. Verified end-to-end (matched MANUALLY_DIALED / "01. Los Angeles [E]" / RECEIVED).

- FIXED (P0): Admin Calls tab white-screen crash on search. `<FileText />` used in the "Matching leads" block in `AdminCalls.jsx` but never imported — crashed React when a search matched a lead. Import added.
- ADDED: Search box in the Retained tab (`AdminRetained.jsx`) filtering only retained clients by name, phone (digit-aware), source, type.
- NOTE: A prior session's final admin UI edits (Calls search layout, Leads columns toggle, Retained formatting) were left uncommitted, so an earlier production redeploy shipped without them. Committed now — redeploy required.
