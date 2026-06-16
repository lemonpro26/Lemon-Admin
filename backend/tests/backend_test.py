"""Lemon Pros backend API tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://lemon-checker.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'LemonPros2026!')


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/admin/login", json={"username": "", "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "owner"
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- Public/config ----------------
def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200


def test_public_config(session):
    r = session.get(f"{API}/config/public")
    assert r.status_code == 200
    data = r.json()
    assert "hook1" in data and "hook2" in data
    # hook1 should reference Lemon (Lemon Pros brand)
    assert "Lemon" in data["hook1"], f"hook1 does not mention Lemon: {data['hook1']}"


# ---------------- Tracking ----------------
def test_track_click_dedup(session):
    sid = f"TEST_{uuid.uuid4()}"
    r1 = session.post(f"{API}/track/click", json={"session_id": sid, "landing_path": "/"})
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["success"] is True
    assert d1["deduped"] is False
    r2 = session.post(f"{API}/track/click", json={"session_id": sid, "landing_path": "/"})
    assert r2.status_code == 200
    assert r2.json()["deduped"] is True


# ---------------- Geo & address ----------------
def test_geo_zip(session):
    r = session.get(f"{API}/geo-zip", params={"zip": "90015"})
    assert r.status_code == 200
    data = r.json()
    assert "found" in data
    # Should not be a hard failure; may be true or false depending on network
    assert isinstance(data["found"], bool)


def test_verify_address_soft(session):
    r = session.post(f"{API}/verify-address",
                     json={"address": "123 Main St", "city": "Los Angeles", "state": "CA", "zip": "90015"})
    assert r.status_code == 200
    data = r.json()
    # Should not hard-block: either valid or soft true
    assert ("valid" in data)


def test_verify_address_empty(session):
    r = session.post(f"{API}/verify-address", json={"address": "", "city": "", "state": "", "zip": ""})
    assert r.status_code == 200
    assert r.json()["valid"] is False


# ---------------- Leads ----------------
LEAD_PAYLOAD = {
    "car_year": "2023",
    "car_make": "Toyota",
    "car_model": "RAV4",
    "first_name": "TESTLemon",
    "last_name": "Tester",
    "email": "test.lemon@example.com",
    "phone": "(555) 123-4567",
    "address": "123 Demo St",
    "city": "Los Angeles",
    "state": "California",
    "zip": "90015",
    "session_id": f"TEST_{uuid.uuid4()}",
}


@pytest.fixture(scope="session")
def created_lead_id(session):
    r = session.post(f"{API}/leads", json=LEAD_PAYLOAD)
    assert r.status_code == 200, f"lead creation failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["success"] is True
    assert "id" in data and isinstance(data["id"], str) and len(data["id"]) > 0
    return data["id"]


def test_lead_persists_with_car_fields(session, created_lead_id, auth_headers):
    # Now fetch leads list and ensure car fields were stored
    r = session.get(f"{API}/admin/leads", headers=auth_headers, params={"limit": 500})
    assert r.status_code == 200
    leads = r.json()["leads"]
    matching = [ld for ld in leads if ld.get("id") == created_lead_id]
    assert len(matching) == 1, f"Lead {created_lead_id} not found in admin list"
    lead = matching[0]
    # CRITICAL: verify car fields persisted
    assert lead.get("car_year") == "2023", f"car_year missing/wrong: {lead.get('car_year')}"
    assert lead.get("car_make") == "Toyota", f"car_make missing/wrong: {lead.get('car_make')}"
    assert lead.get("car_model") == "RAV4", f"car_model missing/wrong: {lead.get('car_model')}"
    assert lead.get("first_name") == "TESTLemon"
    assert lead.get("email") == "test.lemon@example.com"


# ---------------- Admin auth ----------------
def test_admin_login_owner(session):
    r = session.post(f"{API}/admin/login", json={"username": "", "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    d = r.json()
    assert d["role"] == "owner"
    assert d["username"] == "owner"
    assert isinstance(d["token"], str) and len(d["token"]) > 20


def test_admin_login_wrong(session):
    r = session.post(f"{API}/admin/login", json={"username": "", "password": "wrong"})
    assert r.status_code == 401


def test_admin_leads_unauthorized(session):
    r = session.get(f"{API}/admin/leads")
    assert r.status_code == 401


def test_admin_test_lead_creates_car_fields(session, auth_headers):
    r = session.post(f"{API}/admin/leads/test", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    lead = data["lead"]
    assert lead.get("car_year")
    assert lead.get("car_make")
    assert lead.get("car_model")
    assert lead.get("id")


def test_admin_stats(session, auth_headers):
    r = session.get(f"{API}/admin/stats", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_leads" in data
    assert "total_clicks" in data
    assert "conversion_rate" in data
    assert isinstance(data["total_leads"], int)
