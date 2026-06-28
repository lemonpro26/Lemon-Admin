"""Tests for iteration 18:
- /api/admin/google-ads/health response shape
- /api/admin/my-credentials non-owner self-service (current password verification,
  username change, password change, re-login w/ new password, owner forbidden)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

OWNER_USER = "owner"
OWNER_PW = "LemonPros2026!"
TEST_USER = "TEST_iter18_editor"
TEST_PW = "OldPass!234"
NEW_PW = "NewPass!9876"


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/admin/login",
                      json={"username": username, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="module")
def owner_token():
    r = _login(OWNER_USER, OWNER_PW)
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def test_editor(owner_token):
    """Create a non-owner editor user; clean up at the end."""
    h = {"Authorization": f"Bearer {owner_token}"}
    # Best-effort cleanup of any leftover from prior runs
    requests.delete(f"{BASE_URL}/api/admin/users/{TEST_USER}", headers=h, timeout=10)

    r = requests.post(f"{BASE_URL}/api/admin/users",
                      headers=h,
                      json={"username": TEST_USER, "password": TEST_PW, "role": "editor"},
                      timeout=15)
    assert r.status_code == 200, f"User create failed: {r.status_code} {r.text}"

    yield TEST_USER

    # Teardown – the username may have changed mid-test. Try both names.
    for uname in (TEST_USER, TEST_USER + "_renamed"):
        try:
            requests.delete(f"{BASE_URL}/api/admin/users/{uname}", headers=h, timeout=10)
        except Exception:
            pass


# ---------- Google Ads Health ----------
class TestGoogleAdsHealth:
    def test_health_shape(self, owner_token):
        h = {"Authorization": f"Bearer {owner_token}"}
        r = requests.get(f"{BASE_URL}/api/admin/google-ads/health", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "connected" in data
        assert "configured" in data
        assert "reason" in data
        assert isinstance(data["connected"], bool)
        assert isinstance(data["configured"], bool)


# ---------- My Credentials (non-owner self-service) ----------
class TestMyCredentials:
    def test_owner_blocked(self, owner_token):
        h = {"Authorization": f"Bearer {owner_token}"}
        r = requests.put(f"{BASE_URL}/api/admin/my-credentials",
                         headers=h,
                         json={"current_password": OWNER_PW, "new_password": "irrelevant"},
                         timeout=15)
        assert r.status_code == 400, r.text
        assert "owner" in r.text.lower() or "master" in r.text.lower()

    def test_wrong_current_password_rejected(self, test_editor):
        # log in as the test editor
        login = _login(test_editor, TEST_PW)
        assert login.status_code == 200, login.text
        token = login.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.put(f"{BASE_URL}/api/admin/my-credentials",
                         headers=h,
                         json={"current_password": "WRONG_PW", "new_password": NEW_PW},
                         timeout=15)
        assert r.status_code == 401, r.text
        # And the existing password still works
        re_login = _login(test_editor, TEST_PW)
        assert re_login.status_code == 200

    def test_change_password_succeeds_and_relogin(self, test_editor):
        login = _login(test_editor, TEST_PW)
        assert login.status_code == 200
        token = login.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.put(f"{BASE_URL}/api/admin/my-credentials",
                         headers=h,
                         json={"current_password": TEST_PW, "new_password": NEW_PW},
                         timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert data.get("role") == "editor"
        assert isinstance(data.get("token"), str) and len(data["token"]) > 10

        # Old password fails
        old = _login(test_editor, TEST_PW)
        assert old.status_code == 401

        # New password works
        new = _login(test_editor, NEW_PW)
        assert new.status_code == 200, new.text
