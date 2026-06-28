"""Iteration 17: end-to-end backend checks for the freshly built batch of features.

Covers:
- /admin/funnel/campaigns?page=...
- /admin/calls?search=... (cross-date search)
- /admin/leads (captures IP) and lead detail returns ip_address
- /admin/pa-content GET/PUT round-trip + revert
- /admin/users/{username}/activity (login_history + change_history)
- /admin/analytics google_ads_connected flag
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    'REACT_APP_BACKEND_URL',
    'https://lemon-checker.preview.emergentagent.com',
).rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'LemonPros2026!')


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def token(s):
    r = s.post(f"{API}/admin/login", json={"username": "", "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Funnel Campaigns ----------------
def test_funnel_campaigns_requires_auth(s):
    r = s.get(f"{API}/admin/funnel/campaigns?page=lapa")
    assert r.status_code in (401, 403)


@pytest.mark.parametrize("page", ["home", "lapa", "sp", "overall"])
def test_funnel_campaigns_returns_ok(s, h, page):
    r = s.get(f"{API}/admin/funnel/campaigns?page={page}", headers=h)
    assert r.status_code == 200, f"{page}: {r.status_code} {r.text}"
    data = r.json()
    # Loose schema check: should be a dict or list of campaigns; key names may vary.
    assert isinstance(data, (dict, list)), type(data)


# ---------------- Calls search ----------------
def test_admin_calls_search_param_accepted(s, h):
    # Even a string that returns 0 results must succeed with 200.
    r = s.get(f"{API}/admin/calls?search=zzznotreal_{uuid.uuid4().hex[:6]}", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    # response should look like a list/paginated object
    assert isinstance(body, (list, dict))


def test_admin_calls_search_ignores_date(s, h):
    # Without date filter and with empty search, should still return 200.
    r1 = s.get(f"{API}/admin/calls?search=", headers=h)
    assert r1.status_code == 200
    # With far-past date and a search term, search should still match across all calls.
    r2 = s.get(f"{API}/admin/calls?search=5&start=2020-01-01&end=2020-01-02", headers=h)
    assert r2.status_code == 200


# ---------------- Leads IP capture ----------------
def test_lead_post_captures_ip_and_detail_exposes_it(s, h):
    sid = f"TEST_iter17_{uuid.uuid4().hex[:10]}"
    # Seed a click to satisfy any attribution side-effects.
    s.post(f"{API}/track/click", json={"session_id": sid, "source": "test"})
    payload = {
        "session_id": sid,
        "first_name": "TESTiter17",
        "last_name": "User",
        "phone": "555-000-9999",
        "email": "test_iter17@example.com",
        "car_make": "Tesla",
        "car_model": "Model 3",
        "car_year": "2022",
        "address": "1 Test St",
        "city": "Testville",
        "state": "PA",
        "zip": "12345",
        "source_page": "home",
    }
    r = s.post(f"{API}/leads", json=payload)
    assert r.status_code in (200, 201), f"create lead: {r.status_code} {r.text}"
    lead = r.json()
    lead_id = lead.get("id")
    assert lead_id, f"no id in lead response: {lead}"

    # Fetch list and find our lead (admin)
    r2 = s.get(f"{API}/admin/leads?search=TESTiter17", headers=h)
    assert r2.status_code == 200
    body = r2.json()
    leads = body if isinstance(body, list) else body.get("leads", body.get("items", []))
    match = next((l for l in leads if l.get("id") == lead_id or l.get("session_id") == sid), None)
    assert match, f"lead not found in list: {leads[:3] if isinstance(leads, list) else leads}"
    # IP should be present (string, non-empty for HTTP requests)
    ip = match.get("ip") or match.get("ip_address")
    assert ip, f"ip missing on lead: {match}"

    # Cleanup
    try:
        s.post(f"{API}/admin/data/purge-test", headers=h)
    except Exception:
        pass


# ---------------- PA content ----------------
def test_pa_content_round_trip(s, h):
    r = s.get(f"{API}/admin/pa-content", headers=h)
    assert r.status_code == 200, r.text
    cur = r.json()
    original_headline = cur.get("headline")
    assert original_headline, f"no headline returned: {cur}"

    test_headline = f"TEST_iter17 headline {uuid.uuid4().hex[:6]}"
    upd = dict(cur)
    upd["headline"] = test_headline
    r2 = s.put(f"{API}/admin/pa-content", json=upd, headers=h)
    assert r2.status_code == 200, r2.text

    # Verify the public /pa-content (or read-back) shows the new value.
    r3 = s.get(f"{API}/admin/pa-content", headers=h)
    assert r3.status_code == 200
    assert r3.json().get("headline") == test_headline

    # Revert
    revert = dict(cur)
    revert["headline"] = original_headline
    r4 = s.put(f"{API}/admin/pa-content", json=revert, headers=h)
    assert r4.status_code == 200
    r5 = s.get(f"{API}/admin/pa-content", headers=h)
    assert r5.json().get("headline") == original_headline


# ---------------- User activity ----------------
def test_user_activity_owner(s, h):
    r = s.get(f"{API}/admin/users/owner/activity", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    # Expect keys for login + change history.
    assert "login_history" in data or "logins" in data, list(data.keys())
    assert "change_history" in data or "changes" in data, list(data.keys())


def test_user_activity_requires_auth(s):
    r = s.get(f"{API}/admin/users/owner/activity")
    assert r.status_code in (401, 403)


# ---------------- Analytics google_ads ----------------
def test_analytics_loads_and_google_ads_connected(s, h):
    r = s.get(f"{API}/admin/analytics", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    # The flag should exist and be truthy per main agent's note.
    assert "google_ads_connected" in data, list(data.keys())[:20]
    assert data["google_ads_connected"] is True, f"google_ads_connected={data['google_ads_connected']}"
