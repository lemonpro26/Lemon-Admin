# Lemon Pros — Changelog

## 2026-07-10 (fork continuation)
- **Duplicate landing-page rows FIXED (data bug):** The same page was stored under alias `source_page` codes (`dg`/`ladg`, `tm`/`latm`, `pa`/`lapa`, `spa`/`laspa`) which aggregated as separate rows. Added `_canon_page`/`_PAGE_ALIASES` and canonicalized clicks/leads/calls/revenue/retained/spend in `/admin/analytics` so each page yields exactly ONE row. Fixed `GROUP_PRIMARY_PAGE` to use canonical codes (`dg`/`dgs`). Verified: testing_agent iteration_24 13/13 pass, no duplicate/alias codes remain.
- **calls > visits on /spa — explained (not a bug):** The Spanish tracked number (866-524-3722) is SHARED by both /sp and /spa. Calls with no page visit/tap default to the group's primary page (/spa), so /spa absorbs Spanish-number calls beyond its own visits. Known attribution heuristic.
- **By Campaign retained reconciliation:** Retained was counted by `created_at` (leads/calls created in range) but the Retained tab counts by `retained_at`. Fixed `/admin/analytics` to count retained by `retained_at`, attribute to campaign/landing page (calls enriched for click+tap attribution), and roll retained with no campaign (or paused campaigns not shown) into a new **"Unattributed / Direct"** row so the Retained column sums to the Retained tab total. Verified (both = 2 in preview).
- **Totals row in Analytics tables:** Added a `showTotals` footer to `DrillTable` (`AdminAnalytics.jsx`). By Landing Page and By Campaign now show a bottom **Total** row. Additive columns (Visits/Leads/Calls/Spend/Revenue/Retained) are summed; ratio columns (Conv. Rate, ROAS, CPL, CPA, Bounce Rate) are recomputed from the aggregates (weighted), not naïvely summed. Verified via screenshot.

## 2026-07-09 (fork continuation)
- **Analytics — Landing Page "Retained" column (frontend):** Added `Retained` to `FIN_COLS` so it shows on By Landing Page and By Campaign.
- **CPL / CPA math confirmed:** CPL = Spend ÷ (Leads + Calls), CPA = Spend ÷ Retained; null when spend=0.
- **Defensive read-time call filter:** `/admin/calls` filters out `number_group == 'other'` (untracked numbers).
- **Regression:** testing_agent iteration_23 — 11/11 backend pass. `total_retained` lives on `/admin/stats` (not `/admin/metrics`).

### Still pending / backlog
- P1: Make FB/IG/Native channels real (capture fbclid/ttclid, save network, live data)
- P1: Hook-performance-from-calls view
- P2: Lead-to-revenue pipeline statuses (New → Contacted → Retained)
- P2: Refactor server.py (>4,100 lines) into routers
- P3: Conversions by Sitelink, lead qualification logic, "Unattributed/Direct" filter chip in Calls/Leads, live-call webhook view
- P3 (blocked): SMTP email notifications (need creds)
- Top Tabs UI mockup at `/mockup/tabs` — user chose "don't do this yet"
