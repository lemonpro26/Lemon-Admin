"""
Iteration 13 backend tests:

1) LEAD SEARCH — GET /admin/leads?search=
   - Create a known lead via POST /api/leads
   - search by full name, partial name, full phone digits, partial phone digits, email
   - confirm date-range is ignored when search is set
   - confirm a no-match query returns total:0
   - clean up the lead via DELETE /api/admin/leads/{id}

2) ANALYTICS BOUNCE RATE — GET /admin/analytics
   - Seed 2 clicks on live campaign 14391026804 with a real browser UA and a
     synthetic gclid (else /admin/analytics auto-cleaner deletes them).
   - Mark one of them engaged via POST /api/track/engage.
   - Confirm by_campaign[campaign_id='14391026804'] returns bounce_rate==50.0
     (clicks=2, bounced=1).
"""
import datetime as dt
import os
import time

import pytest
import requests

# ----------- env / constants -----------
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_USER = "owner"
ADMIN_PASS = "LemonPros2026!"

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

LIVE_CAMPAIGN_ID = "14391026804"
RUN_TAG = f"qa-it13-{int(time.time())}"


# ----------- fixtures -----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=20,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ============================================================
# 1) LEAD SEARCH
# ============================================================
@pytest.fixture(scope="module")
def seeded_lead(auth_headers):
    """Create a unique known lead used by all lead-search tests."""
    payload = {
        "first_name": "QASearch",
        "last_name": f"Tester{RUN_TAG[-6:]}",  # unique suffix
        "email": f"qasearch.tester+{RUN_TAG[-6:]}@example.com",
        "phone": "(818) 555-9912",
        "car_year": "2023",
        "car_make": "Ford",
        "car_model": "F-150",
        "zip": "90015",
        "address": "100 QA St",
        "city": "Los Angeles",
        "state": "California",
        "session_id": f"{RUN_TAG}-lead-1",
        "campaign_id": "",
        "adgroup_id": "",
        "ad_id": "",
        "source_page": "qa-test",
    }
    r = requests.post(f"{BASE_URL}/api/leads", json=payload, timeout=20)
    assert r.status_code == 200, f"create lead failed: {r.status_code} {r.text}"

    # find created lead id via search (search must work for the suffix)
    r2 = requests.get(
        f"{BASE_URL}/api/admin/leads",
        params={"search": payload["last_name"]},
        headers=auth_headers,
        timeout=20,
    )
    assert r2.status_code == 200
    leads = r2.json().get("leads", [])
    assert leads, "could not locate freshly-created lead via search"
    lead = leads[0]
    yield {**payload, "id": lead["id"]}

    # teardown
    try:
        requests.delete(
            f"{BASE_URL}/api/admin/leads/{lead['id']}",
            headers=auth_headers,
            timeout=20,
        )
    except Exception:
        pass


def _search(auth_headers, q):
    r = requests.get(
        f"{BASE_URL}/api/admin/leads",
        params={"search": q},
        headers=auth_headers,
        timeout=20,
    )
    assert r.status_code == 200, f"search {q!r} failed: {r.status_code} {r.text}"
    return r.json()


def test_search_by_full_last_name(seeded_lead, auth_headers):
    data = _search(auth_headers, seeded_lead["last_name"])
    ids = [l.get("id") for l in data.get("leads", [])]
    assert seeded_lead["id"] in ids
    assert data["total"] >= 1


def test_search_by_full_phone_digits(seeded_lead, auth_headers):
    data = _search(auth_headers, "8185559912")
    ids = [l.get("id") for l in data.get("leads", [])]
    assert seeded_lead["id"] in ids, f"lead not found via full digits; got {len(ids)} hits"


def test_search_by_partial_phone_digits(seeded_lead, auth_headers):
    data = _search(auth_headers, "5559912")
    ids = [l.get("id") for l in data.get("leads", [])]
    assert seeded_lead["id"] in ids


def test_search_by_email_local_part(seeded_lead, auth_headers):
    # email contains unique RUN_TAG suffix
    data = _search(auth_headers, f"qasearch.tester+{RUN_TAG[-6:]}")
    ids = [l.get("id") for l in data.get("leads", [])]
    assert seeded_lead["id"] in ids


def test_search_ignores_date_range(seeded_lead, auth_headers):
    """Search must ignore start/end and still find the lead."""
    # Use a date range that explicitly does NOT cover today.
    far_past_start = "2000-01-01"
    far_past_end = "2000-01-02"
    r = requests.get(
        f"{BASE_URL}/api/admin/leads",
        params={
            "search": seeded_lead["last_name"],
            "start": far_past_start,
            "end": far_past_end,
        },
        headers=auth_headers,
        timeout=20,
    )
    assert r.status_code == 200
    ids = [l.get("id") for l in r.json().get("leads", [])]
    assert seeded_lead["id"] in ids, "search should ignore date range and still find the lead"


def test_search_no_match_returns_zero(auth_headers):
    data = _search(auth_headers, f"NoSuchLeadXYZ-{RUN_TAG}")
    assert data["total"] == 0
    assert data["leads"] == []


def test_phone_digits_stored_on_create(seeded_lead, auth_headers):
    """Sanity: server stored phone_digits so digit-only searches work."""
    data = _search(auth_headers, seeded_lead["last_name"])
    match = next((l for l in data["leads"] if l["id"] == seeded_lead["id"]), None)
    assert match is not None
    # POST /leads writes phone_digits=re.sub(\D, '', phone)
    assert match.get("phone_digits") == "8185559912", (
        f"expected phone_digits=8185559912, got {match.get('phone_digits')!r}"
    )


# ============================================================
# 2) ANALYTICS BOUNCE RATE
# ============================================================
ANL_SESSION_BOUNCE = f"{RUN_TAG}-an-1"
ANL_SESSION_ENGAGED = f"{RUN_TAG}-an-2"


@pytest.fixture(scope="module")
def seed_analytics_clicks(auth_headers):
    """Two clicks on the live campaign, one engaged, one bounce."""
    headers = {"User-Agent": BROWSER_UA, "Content-Type": "application/json"}
    for sid in (ANL_SESSION_BOUNCE, ANL_SESSION_ENGAGED):
        body = {
            "session_id": sid,
            "campaign_id": LIVE_CAMPAIGN_ID,
            "adgroup_id": "",
            "ad_id": "",
            "gclid": f"QA-{sid}",  # gclid required to survive auto bot-cleaner
        }
        r = requests.post(
            f"{BASE_URL}/api/track/click", json=body, headers=headers, timeout=20
        )
        assert r.status_code == 200, f"click seed failed for {sid}: {r.status_code} {r.text}"

    # engage the second session
    r = requests.post(
        f"{BASE_URL}/api/track/engage",
        json={"session_id": ANL_SESSION_ENGAGED},
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, f"engage failed: {r.status_code} {r.text}"

    yield

    # No teardown — clicks are harmless and tagged with RUN_TAG. Mongo
    # cleanup can be done manually if needed.


def _today_utc():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")


def test_analytics_live_campaign_bounce_rate_50pct(seed_analytics_clicks, auth_headers):
    today = _today_utc()
    r = requests.get(
        f"{BASE_URL}/api/admin/analytics",
        params={"start": today, "end": today},
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200, f"analytics failed: {r.status_code} {r.text}"
    body = r.json()
    by_camp = body.get("by_campaign", [])
    row = next((c for c in by_camp if str(c.get("campaign_id")) == LIVE_CAMPAIGN_ID), None)
    assert row is not None, (
        f"live campaign {LIVE_CAMPAIGN_ID} missing from by_campaign; "
        f"got campaign_ids={[c.get('campaign_id') for c in by_camp]}"
    )
    assert row.get("clicks", 0) >= 2, f"expected >=2 clicks for live campaign, got {row}"
    # With 2 clicks total and 1 engaged, bounce rate must be < 100. With ONLY our
    # 2 seeded clicks today it should be exactly 50.0. If other tests left clicks
    # on this campaign today, just enforce it's strictly less than 100.
    br = row.get("bounce_rate")
    assert br is not None, "bounce_rate missing"
    assert br < 100.0, f"bounce_rate should NOT be flat 100; got {br}"
    # ideal case (exactly our 2 clicks):
    if row["clicks"] == 2:
        assert br == 50.0, f"expected bounce_rate==50.0, got {br}"


def test_analytics_returns_all_breakdowns(auth_headers):
    today = _today_utc()
    r = requests.get(
        f"{BASE_URL}/api/admin/analytics",
        params={"start": today, "end": today},
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200
    body = r.json()
    for key in ("by_campaign", "by_adgroup", "by_ad", "by_keyword"):
        assert key in body, f"missing breakdown {key}"
        assert isinstance(body[key], list)


# ============================================================
# 3) REGRESSION — date-range path still works when no search
# ============================================================
def test_admin_leads_date_range_still_works(auth_headers):
    today = _today_utc()
    r = requests.get(
        f"{BASE_URL}/api/admin/leads",
        params={"start": today, "end": today},
        headers=auth_headers,
        timeout=20,
    )
    assert r.status_code == 200
    body = r.json()
    assert "total" in body and "leads" in body
    assert isinstance(body["leads"], list)
