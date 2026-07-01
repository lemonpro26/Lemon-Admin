"""
Iteration 20 tests — Demand Gen pages (/dg English + /dgs Spanish) + Spanish text edits.

Covers:
  * Public GET /api/dg-content and /api/dgs-content shape + text edits.
  * Public /api/pa-content and /api/spa-content reflect the removal of
    "exclusively"/"se dedica exclusivamente" and "network"/"La red de".
  * Admin auth required, admin GET returns 200.
  * PUT /admin/dg-content and /admin/dgs-content persist AND are independent
    from /pa-content and /spa-content.
  * POST /api/leads with source_page dg / dgs is saved.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

ADMIN_USER = "owner"
ADMIN_PASS = "LemonPros2026!"


# ----------------------- Fixtures -----------------------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/admin/login",
                 json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ----------------------- Public content shape -----------------------
class TestPublicContent:
    """Public advertorial content endpoints — shape + text edits."""

    def test_pa_content_english_edits(self, api):
        r = api.get(f"{BASE_URL}/api/pa-content")
        assert r.status_code == 200
        d = r.json()
        # Edit 1: qualify_intro starts with 'The Lemon Pros has helped' (no 'network')
        assert d["qualify_intro"].startswith("The Lemon Pros has helped"), d["qualify_intro"][:120]
        assert "network" not in d["qualify_intro"].lower()
        # Edit 2: attorney_bio does NOT contain 'exclusively'
        assert "exclusively" not in d["attorney_bio"].lower(), d["attorney_bio"]

    def test_spa_content_spanish_edits(self, api):
        r = api.get(f"{BASE_URL}/api/spa-content")
        assert r.status_code == 200
        d = r.json()
        # Spanish intro: starts with 'The Lemon Pros ha ayudado' — no 'La red de'
        assert "The Lemon Pros ha ayudado" in d["qualify_intro"], d["qualify_intro"][:150]
        assert "La red de" not in d["qualify_intro"]
        # Spanish bio: no 'se dedica exclusivamente'
        assert "se dedica exclusivamente" not in d["attorney_bio"], d["attorney_bio"]

    def test_dg_content_matches_pa_edits(self, api):
        r = api.get(f"{BASE_URL}/api/dg-content")
        assert r.status_code == 200
        d = r.json()
        assert d["qualify_intro"].startswith("The Lemon Pros has helped"), d["qualify_intro"][:120]
        assert "exclusively" not in d["attorney_bio"].lower()
        # sanity: must have PA-shape fields
        for k in ("headline", "attorney_name", "settlements", "qualify_items", "final_cta"):
            assert k in d, f"missing {k}"

    def test_dgs_content_matches_spa_edits(self, api):
        r = api.get(f"{BASE_URL}/api/dgs-content")
        assert r.status_code == 200
        d = r.json()
        assert "The Lemon Pros ha ayudado" in d["qualify_intro"]
        assert "La red de" not in d["qualify_intro"]
        assert "se dedica exclusivamente" not in d["attorney_bio"]
        for k in ("headline", "attorney_name", "settlements", "qualify_items", "final_cta"):
            assert k in d, f"missing {k}"


# ----------------------- Admin auth + admin GETs -----------------------
class TestAdminAuth:
    def test_admin_login_returns_token(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_admin_dg_content_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/dg-content")
        assert r.status_code in (401, 403), r.status_code

    def test_admin_dgs_content_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/dgs-content")
        assert r.status_code in (401, 403), r.status_code

    def test_admin_dg_get_ok(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/dg-content", headers=admin_headers)
        assert r.status_code == 200
        assert "headline" in r.json()

    def test_admin_dgs_get_ok(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/dgs-content", headers=admin_headers)
        assert r.status_code == 200
        assert "headline" in r.json()


# ----------------------- Independent editing -----------------------
class TestIndependentEditing:
    """PUT /admin/dg-content must NOT affect /pa-content; same for /dgs vs /spa."""

    def test_dg_edit_is_independent_of_pa(self, api, admin_headers):
        # Snapshot pa headline BEFORE
        pa_before = api.get(f"{BASE_URL}/api/pa-content").json()
        pa_headline_before = pa_before["headline"]

        # Edit dg headline
        new_headline = f"TEST_DG_HEADLINE_{uuid.uuid4().hex[:8]}"
        put = api.put(f"{BASE_URL}/api/admin/dg-content",
                      headers=admin_headers,
                      json={"headline": new_headline})
        assert put.status_code == 200, put.text[:200]

        # Public /dg-content reflects change
        dg = api.get(f"{BASE_URL}/api/dg-content").json()
        assert dg["headline"] == new_headline, dg["headline"]

        # /pa-content unchanged
        pa_after = api.get(f"{BASE_URL}/api/pa-content").json()
        assert pa_after["headline"] == pa_headline_before, (
            f"PA changed: {pa_headline_before} -> {pa_after['headline']}"
        )

        # Restore dg headline to original default (from a fresh pa headline default)
        restore = api.put(f"{BASE_URL}/api/admin/dg-content",
                          headers=admin_headers,
                          json={"headline": pa_headline_before})
        assert restore.status_code == 200
        dg_final = api.get(f"{BASE_URL}/api/dg-content").json()
        assert dg_final["headline"] == pa_headline_before

    def test_dgs_edit_is_independent_of_spa(self, api, admin_headers):
        spa_before = api.get(f"{BASE_URL}/api/spa-content").json()
        spa_headline_before = spa_before["headline"]

        new_headline = f"TEST_DGS_HEADLINE_{uuid.uuid4().hex[:8]}"
        put = api.put(f"{BASE_URL}/api/admin/dgs-content",
                      headers=admin_headers,
                      json={"headline": new_headline})
        assert put.status_code == 200, put.text[:200]

        dgs = api.get(f"{BASE_URL}/api/dgs-content").json()
        assert dgs["headline"] == new_headline

        spa_after = api.get(f"{BASE_URL}/api/spa-content").json()
        assert spa_after["headline"] == spa_headline_before

        # Restore
        restore = api.put(f"{BASE_URL}/api/admin/dgs-content",
                          headers=admin_headers,
                          json={"headline": spa_headline_before})
        assert restore.status_code == 200
        dgs_final = api.get(f"{BASE_URL}/api/dgs-content").json()
        assert dgs_final["headline"] == spa_headline_before


# ----------------------- Lead submission with dg / dgs source_page -----------------------
def _unique_phone():
    # unique 10 digits with prefix 555 to look obviously fake
    n = uuid.uuid4().int
    return "555" + str(n)[-7:]


class TestLeadsDgDgs:
    def _lead_payload(self, source_page):
        u = uuid.uuid4().hex[:8]
        return {
            "first_name": "TEST",
            "last_name": f"Iter20-{source_page}-{u}",
            "email": f"test_iter20_{source_page}_{u}@example.com",
            "phone": _unique_phone(),
            "vehicle_make": "Toyota",
            "vehicle_model": "Camry",
            "vehicle_year": "2022",
            "source_page": source_page,
            "session_id": f"sess_test_{u}",
        }

    def test_lead_dg(self, api):
        p = self._lead_payload("dg")
        r = api.post(f"{BASE_URL}/api/leads", json=p)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("success") is True
        assert j.get("id"), j
        # Verify persisted with source_page = 'dg' via admin listing (best-effort)
        # We already know the id; just confirm via /api/leads-count style if exists
        # (Not asserting persistence in DB directly to avoid coupling to admin routes shape.)

    def test_lead_dgs(self, api):
        p = self._lead_payload("dgs")
        r = api.post(f"{BASE_URL}/api/leads", json=p)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("success") is True
        assert j.get("id"), j
