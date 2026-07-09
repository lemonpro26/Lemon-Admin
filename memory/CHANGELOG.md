# Lemon Pros — Changelog

## 2026-07-09 (fork continuation)
- **Analytics — Landing Page "Retained" column (frontend):** Added a `Retained` column to the financial columns (`FIN_COLS`) in `AdminAnalytics.jsx`, so it now shows on both the "By Landing Page" and "By Campaign" tables. Backend `_fin()` already returns the `retained` int. Verified rendering (Spanish Demand Gen shows Retained=1).
- **CPL / CPA math confirmed:** CPL = Spend ÷ (Leads + Calls), CPA = Spend ÷ Retained; both return null when spend=0. Verified via `/api/admin/analytics`.
- **Defensive read-time call filter:** `/admin/calls` now filters out any call whose `number_group == 'other'` (untracked numbers), hardening the ingestion-only filter so legacy/foreign-number calls never surface in the Calls tab.
- **Regression:** testing_agent iteration_23 — 11/11 backend tests pass, no critical issues. `total_retained` lives on `/admin/stats` (not `/admin/metrics`).

### Still pending / backlog (unchanged)
- P1: Make FB/IG/Native channels real (capture fbclid/ttclid, save network, live data)
- P1: Hook-performance-from-calls view
- P2: Lead-to-revenue pipeline statuses (New → Contacted → Retained)
- P2: Refactor server.py (>4,100 lines) into routers
- P3: Conversions by Sitelink, lead qualification logic, "Unattributed/Direct" filter chip, live-call webhook view
- P3 (blocked): SMTP email notifications (need creds)
- Top Tabs UI mockup at `/mockup/tabs` — user chose "don't do this yet"
