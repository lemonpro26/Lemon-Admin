"""Tests for funnel drop-off tracking (POST /api/track/step + GET /api/admin/funnel)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'LemonPros2026!')

FUNNEL_STEPS = ["year", "make", "model", "name", "address", "phone", "email"]
STAGE_NAMES = ["Landing View", "Year", "Make", "Model", "Name", "Address", "Phone", "Email", "Submitted"]


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"})
    return sess


@pytest.fixture(scope="module")
def auth_headers(s):
    r = s.post(f"{API}/admin/login", json={"username": "", "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ---------- /api/admin/funnel auth ----------
def test_admin_funnel_requires_auth(s):
    r = s.get(f"{API}/admin/funnel")
    assert r.status_code == 401, f"expected 401 without token, got {r.status_code}"


def test_admin_funnel_rejects_bad_token(s):
    r = s.get(f"{API}/admin/funnel", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


# ---------- /api/admin/funnel schema ----------
def test_admin_funnel_schema(s, auth_headers):
    r = s.get(f"{API}/admin/funnel", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("overall", "home", "lapa", "sp"):
        assert key in data, f"missing key {key} in funnel response"
        section = data[key]
        for fld in ("views", "submitted", "conversion_rate", "stages"):
            assert fld in section, f"missing {fld} in {key}"
        stages = section["stages"]
        assert len(stages) == len(STAGE_NAMES), f"{key} stages len={len(stages)} expected {len(STAGE_NAMES)}"
        for i, st in enumerate(stages):
            assert st["stage"] == STAGE_NAMES[i], f"{key} stage[{i}] = {st['stage']}, expected {STAGE_NAMES[i]}"
            for fld in ("count", "drop", "drop_pct", "pct_of_views"):
                assert fld in st, f"stage {st['stage']} missing {fld}"
    assert "range" in data


def test_admin_funnel_with_date_range(s, auth_headers):
    r = s.get(f"{API}/admin/funnel", headers=auth_headers, params={"start": "2025-01-01", "end": "2025-12-31"})
    assert r.status_code == 200
    assert "overall" in r.json()


# ---------- /api/track/step ----------
def test_track_step_advances_max(s, auth_headers):
    sid = f"TEST_funnel_{uuid.uuid4().hex[:10]}"
    # Bootstrap a click document
    r = s.post(f"{API}/track/click", json={"session_id": sid, "landing_path": "/", "source_page": "home"})
    assert r.status_code == 200

    # Advance through several steps
    for i, step in enumerate(FUNNEL_STEPS[:4]):  # year, make, model, name
        r = s.post(f"{API}/track/step", json={"session_id": sid, "step": step, "index": i})
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

    # Now call with a LOWER step — should not regress
    r = s.post(f"{API}/track/step", json={"session_id": sid, "step": "year", "index": 0})
    assert r.status_code == 200

    # Verify via admin funnel: this session should have advanced at least to step 3 (name)
    r = s.get(f"{API}/admin/funnel", headers=auth_headers)
    assert r.status_code == 200
    home = r.json()["home"]
    # Stage "Name" is index 4 (Landing + 4 funnel steps), count includes our session
    stages = {st["stage"]: st["count"] for st in home["stages"]}
    assert stages["Name"] >= 1, f"Name stage count expected >=1, got {stages['Name']} (session {sid})"
    # Verify Year stage >= Name stage (cumulative-reached semantics)
    assert stages["Year"] >= stages["Name"]


def test_track_step_missing_session_id(s):
    r = s.post(f"{API}/track/step", json={"session_id": "", "step": "year", "index": 0})
    assert r.status_code == 200
    assert r.json().get("skipped") is True


def test_track_step_bad_step_skipped(s):
    sid = f"TEST_funnel_bad_{uuid.uuid4().hex[:8]}"
    s.post(f"{API}/track/click", json={"session_id": sid, "landing_path": "/", "source_page": "home"})
    r = s.post(f"{API}/track/step", json={"session_id": sid, "step": "nonexistent", "index": -1})
    assert r.status_code == 200
    assert r.json().get("skipped") is True


def test_track_step_by_step_name_only(s):
    """index defaults to -1 → handler should resolve via step name."""
    sid = f"TEST_funnel_name_{uuid.uuid4().hex[:8]}"
    s.post(f"{API}/track/click", json={"session_id": sid, "landing_path": "/", "source_page": "home"})
    r = s.post(f"{API}/track/step", json={"session_id": sid, "step": "make"})
    assert r.status_code == 200
    assert r.json().get("success") is True
    assert r.json().get("skipped") is not True


# ---------- Regression: analytics/leads still work ----------
def test_admin_analytics_still_works(s, auth_headers):
    r = s.get(f"{API}/admin/analytics", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    # Just confirm shape is sane
    assert isinstance(data, dict)


def test_admin_leads_still_works(s, auth_headers):
    r = s.get(f"{API}/admin/leads", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))
