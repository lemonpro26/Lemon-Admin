"""
Iteration 19 — Pages-as-Editing-Hub + Multi-running Split Tests.

Tested:
  • Home + Spanish page-content GET (public) and admin GET/PUT round-trip.
  • Split slug auto-gen (split, split2, …), edit + uniqueness 409,
    multi-run, /split/decide by slug, unknown slug graceful response.
  • PA content endpoints still work (regression).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_USER = "owner"
ADMIN_PW = "LemonPros2026!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ------------------------- Page Content (home/sp) -------------------------
class TestPageContent:
    def test_public_home(self):
        r = requests.get(f"{BASE_URL}/api/page-content/home", timeout=10)
        assert r.status_code == 200
        body = r.json()
        for k in ("cta", "tooltip", "rated", "free_consult", "no_win_no_fee"):
            assert k in body and isinstance(body[k], str)

    def test_public_sp(self):
        r = requests.get(f"{BASE_URL}/api/page-content/sp", timeout=10)
        assert r.status_code == 200
        body = r.json()
        for k in ("cta", "tooltip", "rated", "free_consult", "no_win_no_fee"):
            assert k in body

    def test_unknown_page_404(self):
        r = requests.get(f"{BASE_URL}/api/page-content/bogus", timeout=10)
        assert r.status_code == 404

    def test_admin_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/page-content/home", timeout=10)
        assert r.status_code in (401, 403)

    def test_home_round_trip_restores(self, auth_headers):
        # Snapshot original
        orig = requests.get(f"{BASE_URL}/api/admin/page-content/home", headers=auth_headers, timeout=10).json()
        try:
            new_cta = "TEST_iter19_CTA_xyz"
            r = requests.put(
                f"{BASE_URL}/api/admin/page-content/home",
                headers=auth_headers,
                json={**orig, "cta": new_cta},
                timeout=10,
            )
            assert r.status_code == 200
            assert r.json()["cta"] == new_cta
            # Public GET reflects the change
            pub = requests.get(f"{BASE_URL}/api/page-content/home", timeout=10).json()
            assert pub["cta"] == new_cta
        finally:
            # Restore original
            requests.put(
                f"{BASE_URL}/api/admin/page-content/home",
                headers=auth_headers,
                json=orig,
                timeout=10,
            )
        restored = requests.get(f"{BASE_URL}/api/page-content/home", timeout=10).json()
        assert restored["cta"] == orig["cta"]

    def test_pa_content_still_works(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/pa-content", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "headline" in body


# ------------------------- Split Tests (multi-run + slug) -------------------------
@pytest.fixture(scope="class")
def created_experiments(auth_headers):
    created = []

    def make(name):
        r = requests.post(
            f"{BASE_URL}/api/admin/experiments",
            headers=auth_headers,
            json={
                "name": name,
                "variants": [
                    {"label": "Home", "path": "/", "weight": 50},
                    {"label": "PA", "path": "/pa", "weight": 50},
                ],
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        exp = r.json()
        created.append(exp)
        return exp

    state = {"make": make, "list": created}
    yield state
    # Teardown
    for exp in created:
        requests.delete(f"{BASE_URL}/api/admin/experiments/{exp['id']}", headers=auth_headers, timeout=10)


class TestSplitMultiRun:
    def test_create_two_get_unique_slugs(self, created_experiments):
        a = created_experiments["make"]("TEST_iter19_A")
        b = created_experiments["make"]("TEST_iter19_B")
        assert a.get("slug")
        assert b.get("slug")
        assert a["slug"] != b["slug"]
        # First free slug pattern: split, split2, split3...
        assert a["slug"].startswith("split") and b["slug"].startswith("split")

    def test_edit_slug_to_custom_and_clash(self, auth_headers, created_experiments):
        a, b = created_experiments["list"][0], created_experiments["list"][1]
        custom = f"test-iter19-{int(time.time())}"
        r = requests.put(
            f"{BASE_URL}/api/admin/experiments/{a['id']}",
            headers=auth_headers,
            json={"slug": custom},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["slug"] == custom
        a["slug"] = custom
        # Try to set B's slug to the same -> 409
        r2 = requests.put(
            f"{BASE_URL}/api/admin/experiments/{b['id']}",
            headers=auth_headers,
            json={"slug": custom},
            timeout=10,
        )
        assert r2.status_code == 409
        # Empty slug -> 400
        r3 = requests.put(
            f"{BASE_URL}/api/admin/experiments/{a['id']}",
            headers=auth_headers,
            json={"slug": "   "},
            timeout=10,
        )
        assert r3.status_code == 400

    def test_start_both_simultaneously(self, auth_headers, created_experiments):
        a, b = created_experiments["list"][0], created_experiments["list"][1]
        for exp in (a, b):
            r = requests.put(
                f"{BASE_URL}/api/admin/experiments/{exp['id']}",
                headers=auth_headers,
                json={"status": "running"},
                timeout=10,
            )
            assert r.status_code == 200
            assert r.json()["status"] == "running"

        # List shows both running
        lst = requests.get(f"{BASE_URL}/api/admin/experiments", headers=auth_headers, timeout=10).json()
        ids_running = {e["id"] for e in lst["experiments"] if e.get("status") == "running"}
        assert a["id"] in ids_running and b["id"] in ids_running

    def test_split_decide_per_slug(self, created_experiments):
        a, b = created_experiments["list"][0], created_experiments["list"][1]
        # A
        ra = requests.get(f"{BASE_URL}/api/split/decide", params={"slug": a["slug"], "session": "sess-a"}, timeout=10).json()
        assert ra["running"] is True
        assert ra["experiment_id"] == a["id"]
        assert ra["target"] in ("/", "/pa")
        # B (different slug)
        rb = requests.get(f"{BASE_URL}/api/split/decide", params={"slug": b["slug"], "session": "sess-b"}, timeout=10).json()
        assert rb["running"] is True
        assert rb["experiment_id"] == b["id"]
        # Unknown slug
        ru = requests.get(f"{BASE_URL}/api/split/decide", params={"slug": "zzz-unknown-iter19", "session": "x"}, timeout=10).json()
        assert ru["running"] is False
        assert ru["target"] == "/"
