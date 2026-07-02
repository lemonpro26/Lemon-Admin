"""Backend tests for the new 'Retained clients' feature + 'All time' behavior.

Covers:
- POST /api/admin/leads/{lead_id}/retained  (mark_lead_retained)
- POST /api/admin/calls/{call_id}/retained  (mark_call_retained)
- GET  /api/admin/retained                  (admin_get_retained)
- POST /api/admin/calls/test                (used to create an inbound call)
- All-time bound handling (start=2000-01-01)
"""

import os
import time
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].strip()
ADMIN_PASSWORD = "LemonPros2026!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/admin/login",
                      json={"username": "owner", "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seed_lead(auth_headers):
    """Create a minimal lead via the public /api/leads endpoint (no auth required)."""
    payload = {
        "first_name": "TESTRetained",
        "last_name": "Client",
        "email": "test_retained@example.com",
        "phone": "3105550199",
        "car_year": "2022", "car_make": "Tesla", "car_model": "Model Y",
        "session_id": f"retained-test-{int(time.time())}",
        "source_page": "home",
    }
    r = requests.post(f"{BASE_URL}/api/leads", json=payload, timeout=15)
    assert r.status_code == 200, f"lead create failed: {r.status_code} {r.text}"
    lead_id = r.json()["id"]
    yield lead_id
    # cleanup
    try:
        requests.delete(f"{BASE_URL}/api/admin/leads/{lead_id}", headers=auth_headers, timeout=10)
    except Exception:
        pass


@pytest.fixture(scope="module")
def seed_call(auth_headers):
    r = requests.post(f"{BASE_URL}/api/admin/calls/test", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"call create failed: {r.status_code} {r.text}"
    call_id = r.json()["call"]["id"]
    yield call_id
    try:
        requests.delete(f"{BASE_URL}/api/admin/calls/{call_id}", headers=auth_headers, timeout=10)
    except Exception:
        pass


class TestLoginAndBase:
    def test_login_ok(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["role"] == "owner"

    def test_retained_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/retained", timeout=10)
        assert r.status_code == 401


class TestLeadRetainedToggle:
    def test_mark_lead_retained_true(self, auth_headers, seed_lead):
        r = requests.post(f"{BASE_URL}/api/admin/leads/{seed_lead}/retained",
                          json={"retained": True}, headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["lead_id"] == seed_lead
        assert data["retained"] is True
        assert data["retained_at"] is not None

    def test_mark_lead_retained_false_clears_timestamp(self, auth_headers, seed_lead):
        r = requests.post(f"{BASE_URL}/api/admin/leads/{seed_lead}/retained",
                          json={"retained": False}, headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["retained"] is False
        assert data["retained_at"] is None

    def test_mark_missing_lead_returns_404(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/admin/leads/does-not-exist/retained",
                          json={"retained": True}, headers=auth_headers, timeout=10)
        assert r.status_code == 404


class TestCallRetainedToggle:
    def test_mark_call_retained_true(self, auth_headers, seed_call):
        r = requests.post(f"{BASE_URL}/api/admin/calls/{seed_call}/retained",
                          json={"retained": True}, headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["call_id"] == seed_call
        assert data["retained"] is True
        assert data["retained_at"] is not None

    def test_mark_call_retained_false_clears(self, auth_headers, seed_call):
        r = requests.post(f"{BASE_URL}/api/admin/calls/{seed_call}/retained",
                          json={"retained": False}, headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["retained_at"] is None

    def test_mark_missing_call_returns_404(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/admin/calls/does-not-exist/retained",
                          json={"retained": True}, headers=auth_headers, timeout=10)
        assert r.status_code == 404


class TestRetainedList:
    def test_retained_list_reflects_marks(self, auth_headers, seed_lead, seed_call):
        # Mark both retained
        r1 = requests.post(f"{BASE_URL}/api/admin/leads/{seed_lead}/retained",
                           json={"retained": True}, headers=auth_headers, timeout=10)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/admin/calls/{seed_call}/retained",
                           json={"retained": True}, headers=auth_headers, timeout=10)
        assert r2.status_code == 200

        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(
            f"{BASE_URL}/api/admin/retained",
            params={"start": "2000-01-01", "end": today},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data
        assert "lead_count" in data and "call_count" in data
        assert data["lead_count"] >= 1
        assert data["call_count"] >= 1
        assert data["total"] == data["lead_count"] + data["call_count"]

        ids = {(it["type"], it["id"]) for it in data["items"]}
        assert ("lead", seed_lead) in ids
        assert ("call", seed_call) in ids

        # Type-specific fields present
        lead_item = next(i for i in data["items"] if i["type"] == "lead" and i["id"] == seed_lead)
        assert lead_item["phone"]
        assert lead_item["retained_at"]
        call_item = next(i for i in data["items"] if i["type"] == "call" and i["id"] == seed_call)
        assert call_item["retained_at"]

    def test_unmark_removes_from_list(self, auth_headers, seed_lead, seed_call):
        # Unmark both
        requests.post(f"{BASE_URL}/api/admin/leads/{seed_lead}/retained",
                      json={"retained": False}, headers=auth_headers, timeout=10)
        requests.post(f"{BASE_URL}/api/admin/calls/{seed_call}/retained",
                      json={"retained": False}, headers=auth_headers, timeout=10)

        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(
            f"{BASE_URL}/api/admin/retained",
            params={"start": "2000-01-01", "end": today},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        ids = {(it["type"], it["id"]) for it in data["items"]}
        assert ("lead", seed_lead) not in ids
        assert ("call", seed_call) not in ids
