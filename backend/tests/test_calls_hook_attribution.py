"""
Tests for the new call -> hook attribution feature.
- /admin/calls now enriches each call with: saw_landing_page, hook_label,
  hook1, hook2, matched_rule_id (by joining call.gclid -> clicks.gclid).
- Scenario A: call gclid matches an existing click -> saw_landing_page=True
- Scenario B: call gclid does NOT match -> saw_landing_page=False, hook_label=None
Also re-verifies admin auth, /admin/calls/test, and regression for sold/conversion.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lemon-checker.preview.emergentagent.com").rstrip("/")
CALLS_WEBHOOK_TOKEN = "0jyaTh6Ufb2MSpPs1U9OlN6bzotpx8K5"
ADMIN_PASSWORD = "LemonPros2026!"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# --- shared state across tests in this module ---
created_call_ids: list = []
seed_session_prefix = f"TESTHOOK_{uuid.uuid4().hex[:8]}"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "owner", "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data.get("role") == "owner"
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(api, auth_headers):
    yield
    # Teardown: delete any test calls we created
    for cid in created_call_ids:
        try:
            api.delete(f"{BASE_URL}/api/admin/calls/{cid}", headers=auth_headers)
        except Exception:
            pass


# ---------------- Helpers ----------------
def _post_click(api, session_id: str, gclid: str, campaign_id: str = "qa-hook-camp"):
    """Seed a click with a real browser UA (curl default UA is dropped as a bot)."""
    headers = {"User-Agent": BROWSER_UA, "Content-Type": "application/json"}
    body = {
        "session_id": session_id,
        "gclid": gclid,
        "campaign_id": campaign_id,
        "adgroup_id": "",
        "ad_id": "",
        "keyword": "qa hook test",
    }
    return requests.post(f"{BASE_URL}/api/track/click", json=body, headers=headers, timeout=20)


def _post_call_webhook(gclid: str, session_id: str = "", caller_name: str = "QA Hook Test"):
    body = {
        "caller_number": "(555) 010-2030",
        "caller_name": caller_name,
        "tracking_number": "(844) 335-8911",
        "duration": "60",
        "source": "google",
        "campaign": "Lemon Law LA",
        "gclid": gclid,
        "session_id": session_id,
        "city": "Los Angeles",
        "state": "CA",
    }
    return requests.post(
        f"{BASE_URL}/api/calls/webhook",
        params={"token": CALLS_WEBHOOK_TOKEN},
        json=body,
        timeout=20,
    )


def _get_calls(api, headers):
    r = api.get(f"{BASE_URL}/api/admin/calls", headers=headers, timeout=20)
    assert r.status_code == 200, f"GET /admin/calls failed: {r.status_code} {r.text}"
    return r.json().get("calls", [])


# ---------------- Tests ----------------

# Sanity / auth
def test_health_admin_login(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10


# Webhook token enforcement
def test_calls_webhook_requires_token():
    r = requests.post(f"{BASE_URL}/api/calls/webhook", json={"caller_number": "(555) 000-0000"}, timeout=15)
    assert r.status_code == 401


# --- Scenario A: matching click -> saw_landing_page=True ---
def test_scenario_a_call_with_matching_click(api, auth_headers):
    gclid = f"TESTHOOK_A_{uuid.uuid4().hex[:10]}"
    session_id = f"{seed_session_prefix}_A"

    # 1) Seed click with browser UA
    click_resp = _post_click(api, session_id, gclid)
    assert click_resp.status_code == 200, f"click failed: {click_resp.status_code} {click_resp.text}"
    cj = click_resp.json()
    assert cj.get("success") is True
    assert cj.get("bot") is not True, "click was treated as bot - UA header rejected"

    # 2) Post call webhook with SAME gclid
    call_resp = _post_call_webhook(gclid, session_id=session_id, caller_name="QA Hook Test A")
    assert call_resp.status_code == 200
    call_id = call_resp.json().get("id")
    assert call_id
    created_call_ids.append(call_id)

    # 3) Fetch admin/calls and find our call
    time.sleep(0.5)
    calls = _get_calls(api, auth_headers)
    match = next((c for c in calls if c.get("id") == call_id), None)
    assert match is not None, f"Call {call_id} not present in /admin/calls"

    # Enrichment assertions for scenario A
    assert match.get("saw_landing_page") is True, f"Expected saw_landing_page=True, got {match.get('saw_landing_page')}"
    assert match.get("hook_label") is not None, "hook_label should not be None when click matched"
    assert isinstance(match.get("hook_label"), str) and len(match["hook_label"]) > 0
    # hook1/hook2 may be empty strings if config has none, but keys must exist
    assert "hook1" in match and "hook2" in match
    assert "matched_rule_id" in match  # may be None if default-hook variant


# --- Scenario B: no matching click -> saw_landing_page=False ---
def test_scenario_b_call_without_matching_click(api, auth_headers):
    gclid = f"TESTHOOK_B_NOMATCH_{uuid.uuid4().hex[:10]}"

    # Post call webhook WITHOUT seeding any click for this gclid
    call_resp = _post_call_webhook(gclid, session_id="", caller_name="QA Hook Test B")
    assert call_resp.status_code == 200
    call_id = call_resp.json().get("id")
    assert call_id
    created_call_ids.append(call_id)

    time.sleep(0.5)
    calls = _get_calls(api, auth_headers)
    match = next((c for c in calls if c.get("id") == call_id), None)
    assert match is not None, f"Call {call_id} not present in /admin/calls"

    assert match.get("saw_landing_page") is False, f"Expected saw_landing_page=False, got {match.get('saw_landing_page')}"
    assert match.get("hook_label") is None
    assert match.get("hook1") is None
    assert match.get("hook2") is None
    assert match.get("matched_rule_id") is None


# --- /admin/calls/test still adds a sample call (frontend "Test call" button) ---
def test_admin_calls_test_endpoint(api, auth_headers):
    r = api.post(f"{BASE_URL}/api/admin/calls/test", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("success") is True
    call = j.get("call") or {}
    assert "id" in call
    created_call_ids.append(call["id"])

    # Should appear in /admin/calls
    calls = _get_calls(api, auth_headers)
    ids = [c.get("id") for c in calls]
    assert call["id"] in ids

    # Test-call has a gclid like 'TestCallGclid...' which won't match a real click
    sample = next(c for c in calls if c.get("id") == call["id"])
    assert "saw_landing_page" in sample
    # Will be False (no matching click)
    assert sample.get("saw_landing_page") is False


# --- REGRESSION: mark-as-sold revenue passback ---
def test_mark_call_sold_regression(api, auth_headers):
    # Create a call to mark sold (use webhook, so it has a gclid)
    gclid = f"TESTHOOK_SOLD_{uuid.uuid4().hex[:10]}"
    call_resp = _post_call_webhook(gclid, caller_name="QA Hook Test Sold")
    assert call_resp.status_code == 200
    call_id = call_resp.json()["id"]
    created_call_ids.append(call_id)

    r = api.post(
        f"{BASE_URL}/api/admin/calls/{call_id}/sold",
        headers=auth_headers,
        json={"value": 1500.0, "currency": "USD"},
        timeout=30,
    )
    assert r.status_code == 200, f"sold failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("success") is True
    assert body.get("sale_status") == "sold"
    assert float(body.get("sale_value")) == 1500.0
    assert "conversion" in body  # conversion result block returned (ok or pending)

    # GET to confirm persistence in /admin/calls
    calls = _get_calls(api, auth_headers)
    match = next((c for c in calls if c.get("id") == call_id), None)
    assert match is not None
    assert match.get("sale_status") == "sold"
    assert float(match.get("sale_value")) == 1500.0


# --- /admin/calls is auth-protected ---
def test_admin_calls_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/calls", timeout=15)
    assert r.status_code in (401, 403)
