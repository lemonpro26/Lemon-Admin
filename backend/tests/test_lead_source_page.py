"""Tests for source_page tracking on leads/clicks (Lapa vs Home)."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lemon-checker.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_USER = "owner"
ADMIN_PASS = "LemonPros2026!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _make_lead_payload(source_page: str, tag: str):
    sid = f"TEST_{tag}_{uuid.uuid4().hex[:8]}"
    return {
        "car_year": "2022",
        "car_make": "Toyota",
        "car_model": "Camry",
        "address": "1600 Pennsylvania Ave NW",
        "city": "Washington",
        "state": "DC",
        "zip": "20500",
        "first_name": f"QA{tag}",
        "last_name": "BackendTest",
        "phone": "2025550173",
        "email": f"qa.{tag.lower()}+{uuid.uuid4().hex[:6]}@example.com",
        "session_id": sid,
        "source_page": source_page,
    }


@pytest.mark.parametrize("source_page,expected", [
    ("lapa", "lapa"),
    ("home", "home"),
    ("LAPA", "lapa"),  # case normalization
    ("", "home"),       # default
])
def test_create_lead_persists_source_page(admin_session, source_page, expected):
    tag = expected.upper()
    payload = _make_lead_payload(source_page, tag)
    r = requests.post(f"{API}/leads", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True
    assert "id" in body
    lead_id = body["id"]

    # Verify via admin list
    r2 = admin_session.get(f"{API}/admin/leads", timeout=15)
    assert r2.status_code == 200, r2.text
    leads = r2.json().get("items") or r2.json().get("leads") or r2.json()
    if isinstance(leads, dict) and "items" in leads:
        leads = leads["items"]
    match = next((l for l in leads if l.get("id") == lead_id), None)
    assert match is not None, f"Lead {lead_id} not found in admin list"
    assert match.get("source_page") == expected, f"Expected source_page={expected}, got {match.get('source_page')}"

    # Cleanup
    d = admin_session.delete(f"{API}/admin/leads/{lead_id}", timeout=15)
    assert d.status_code in (200, 204), d.text


def test_track_click_accepts_source_page_lapa():
    sid = f"TEST_CLK_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/track/click", json={
        "session_id": sid,
        "landing_path": "/pa",
        "source_page": "lapa",
    }, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True


def test_track_click_accepts_source_page_home():
    sid = f"TEST_CLK_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/track/click", json={
        "session_id": sid,
        "landing_path": "/",
        "source_page": "home",
    }, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True
