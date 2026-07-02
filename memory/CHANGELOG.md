# Changelog

## 2026-07-02
- FIXED (P0): Admin Calls tab white-screen crash on search. `<FileText />` was used in the "Matching leads" unified-search block in `AdminCalls.jsx` but never imported from lucide-react — rendering an undefined component crashed React whenever a search matched a lead (e.g. searching a phone number). Added the import.
- ADDED: Search box in the Retained tab (`AdminRetained.jsx`) that filters only retained clients client-side by name, phone (digit-aware match), source label, and type.
- NOTE: Prior session's final admin UI edits (Calls search layout, Leads columns toggle, Retained formatting) were left uncommitted, so an earlier production redeploy shipped without them. They are committed now — a fresh redeploy is required.
