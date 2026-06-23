"""Backend tests for Auto Call Conversion feature (iteration_9).

Tests the automatic upload of qualified CallTrackingMetrics phone calls
to Google Ads as offline call-lead conversions via the /api/calls/webhook
endpoint. Also validates short-call skip and test-call exclusion.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lemon-checker.preview.emergentagent.com").rstrip("/")
ADMIN_USER = "owner"
ADMIN_PASS = "LemonPros2026!"
WEBHOOK_TOKEN = "0jyaTh6Ufb2MSpPs1U9OlN6bzotpx8K5"

# Track created call ids for cleanup
_created_ids = []


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, "No token in login response"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_session):
    yield
    for cid in _created_ids:
        try:
            admin_session.delete(f"{BASE_URL}/api/admin/calls/{cid}", timeout=10)
        except Exception:
            pass


def _find_call(admin_session, call_id):
    r = admin_session.get(f"{BASE_URL}/api/admin/calls", timeout=20)
    assert r.status_code == 200, f"GET /admin/calls failed: {r.status_code}"
    calls = r.json().get("calls", [])
    for c in calls:
        if c.get("id") == call_id:
            return c
    return None


# ---------------- Test 1: Qualified call triggers upload attempt ----------------
def test_qualified_call_auto_upload_attempted(admin_session):
    payload = {
        "caller_number": "+15551234567",
        "caller_name": "QA Auto Qualified",
        "duration": "120",
        "campaign": "Lemon Law LA",
        "gclid": "QA_TEST_GCLID_qualified_001",
        "called_at": "2026-01-15T10:00:00Z",
    }
    r = requests.post(
        f"{BASE_URL}/api/calls/webhook",
        params={"token": WEBHOOK_TOKEN},
        json=payload,
        timeout=20,
    )
    assert r.status_code == 200, f"Webhook POST failed: {r.status_code} {r.text}"
    cid = r.json().get("id")
    assert cid, "No call id returned"
    _created_ids.append(cid)

    # Poll for up to 15s for the auto-upload background task to complete
    call = None
    for _ in range(15):
        time.sleep(1)
        call = _find_call(admin_session, cid)
        if call and call.get("call_conversion_last_attempt"):
            break

    assert call is not None, "Created call not found in /admin/calls"
    status = call.get("call_conversion_status")
    detail = call.get("call_conversion_detail")
    last_attempt = call.get("call_conversion_last_attempt")
    print(f"[QUALIFIED] status={status!r} detail={detail!r} last_attempt={last_attempt!r}")

    assert status is not None, f"call_conversion_status missing — no upload attempted. call={call}"
    assert last_attempt is not None, "call_conversion_last_attempt missing"
    # Acceptable: uploaded, validated, rejected (rejected is expected for new conversion action propagating)
    assert status in ("uploaded", "validated", "rejected"), (
        f"Unexpected status {status!r}; detail={detail!r}"
    )


# ---------------- Test 2: Short call gets skipped ----------------
def test_short_call_skipped(admin_session):
    payload = {
        "caller_number": "+15559876543",
        "caller_name": "QA Auto Short",
        "duration": "20",  # < 60s
        "campaign": "Lemon Law LA",
        "gclid": "QA_TEST_GCLID_short_001",
        "called_at": "2026-01-15T10:05:00Z",
    }
    r = requests.post(
        f"{BASE_URL}/api/calls/webhook",
        params={"token": WEBHOOK_TOKEN},
        json=payload,
        timeout=20,
    )
    assert r.status_code == 200
    cid = r.json().get("id")
    _created_ids.append(cid)

    call = None
    for _ in range(10):
        time.sleep(1)
        call = _find_call(admin_session, cid)
        if call and call.get("call_conversion_status"):
            break

    assert call is not None, "Short call not found"
    status = call.get("call_conversion_status")
    detail = call.get("call_conversion_detail") or ""
    print(f"[SHORT] status={status!r} detail={detail!r}")
    assert status == "skipped_short", f"Expected skipped_short, got {status!r}"
    assert "under 60s" in detail.lower() or "60s" in detail, f"Detail should mention 60s: {detail!r}"
    assert call.get("call_conversion_uploaded") is not True


# ---------------- Test 3: Test calls do NOT auto-upload ----------------
def test_test_call_excluded(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/calls/test", timeout=20)
    assert r.status_code == 200, f"create test call failed: {r.status_code} {r.text}"
    cid = r.json().get("call", {}).get("id")
    assert cid
    _created_ids.append(cid)

    # Wait a bit to ensure no background task runs
    time.sleep(3)
    call = _find_call(admin_session, cid)
    assert call is not None
    assert call.get("is_test") is True
    status = call.get("call_conversion_status")
    print(f"[TEST_CALL] status={status!r} is_test={call.get('is_test')}")
    assert status in (None, ""), f"Test call should not have conversion status; got {status!r}"
    assert call.get("call_conversion_uploaded") is not True


# ---------------- Test 4: Regression — admin endpoints still work ----------------
def test_admin_calls_endpoint_returns_list(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/calls", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "calls" in body
    assert isinstance(body["calls"], list)
    assert "total" in body
