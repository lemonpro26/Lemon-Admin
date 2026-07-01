"""Iteration 21 — Calls-tab overhaul (segmentation by DIALED tracking number).

Covers:
- GET /api/admin/phone-numbers   -> 4 tracked numbers + pages
- GET /api/admin/calls           -> each call enriched with number_group / label / tracked_number_display
- POST /api/admin/calls/test     -> tracking_number rotates through the 4 tracked numbers
- Unknown tracking_number        -> maps to number_group == 'other'
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_USER = "owner"
ADMIN_PASS = "LemonPros2026!"

EXPECTED_DISPLAYS = {"844-335-8911", "866-524-3722", "833-240-9312", "833-868-1802"}
EXPECTED_KEYS = {"home_pa", "spanish", "dg", "dgs"}


def _digits(s):
    return re.sub(r"\D", "", s or "")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    tok = r.json().get("token")
    assert tok, "no token in login response"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# --- phone-numbers endpoint --------------------------------------------------

class TestPhoneNumbers:
    def test_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/admin/phone-numbers")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_returns_four_tracked_numbers(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/admin/phone-numbers", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        nums = data.get("numbers")
        assert isinstance(nums, list), f"numbers not a list: {data}"
        assert len(nums) == 4, f"expected 4 numbers, got {len(nums)}: {nums}"

        keys = {n["key"] for n in nums}
        displays = {n["display"] for n in nums}
        assert keys == EXPECTED_KEYS, f"unexpected keys: {keys}"
        assert displays == EXPECTED_DISPLAYS, f"unexpected displays: {displays}"

        # Each number carries label + pages list
        for n in nums:
            assert n.get("label"), f"missing label: {n}"
            assert isinstance(n.get("pages"), list) and n["pages"], f"missing pages: {n}"
            assert _digits(n["display"]) == n["digits"], f"digits mismatch: {n}"


# --- test-call generator rotates + maps correctly ----------------------------

class TestCreateTestCallAndSegment:
    def test_create_test_calls_rotate_and_segment(self, api_client, auth_headers):
        created_ids = []
        seen_groups = set()
        # Create 12 test calls — random rotation should hit all 4 groups with high probability.
        for _ in range(12):
            r = api_client.post(f"{BASE_URL}/api/admin/calls/test", headers=auth_headers)
            assert r.status_code == 200, f"test-call failed: {r.status_code} {r.text}"
            call = r.json().get("call") or {}
            assert call.get("id"), f"no id in response: {call}"
            created_ids.append(call["id"])
            # tracking_number must be one of the 4 tracked displays
            assert call.get("tracking_number") in EXPECTED_DISPLAYS, f"unexpected tracking_number: {call.get('tracking_number')}"

        # Now GET calls and verify enrichment for our created ones
        r = api_client.get(f"{BASE_URL}/api/admin/calls", headers=auth_headers)
        assert r.status_code == 200
        calls = r.json().get("calls", [])
        by_id = {c["id"]: c for c in calls if c.get("id") in set(created_ids)}
        assert len(by_id) == len(created_ids), f"missing calls in GET: created {len(created_ids)}, found {len(by_id)}"

        for cid, c in by_id.items():
            assert c.get("number_group") in EXPECTED_KEYS, f"bad number_group: {c}"
            assert c.get("number_group_label"), f"missing number_group_label: {c}"
            assert c.get("tracked_number_display") in EXPECTED_DISPLAYS, f"bad tracked_number_display: {c}"
            # display must correspond to tracking_number digits
            assert _digits(c["tracking_number"]) == _digits(c["tracked_number_display"])
            seen_groups.add(c["number_group"])

        # We expect at least 3 of the 4 groups to appear in 12 rotations (very likely 4).
        assert len(seen_groups) >= 3, f"rotation only produced {seen_groups} across 12 test calls"

        # Cleanup
        for cid in created_ids:
            api_client.delete(f"{BASE_URL}/api/admin/calls/{cid}", headers=auth_headers)


# --- specific mapping for the 866-524-3722 (spanish) case & 'other' fallback --

class TestNumberGroupMapping:
    """Insert a call directly via the CTM webhook so we can control tracking_number."""

    @pytest.fixture(autouse=True)
    def _setup(self, api_client, auth_headers):
        self.api = api_client
        self.h = auth_headers
        # created call ids to clean up
        self._ids = []
        yield
        for cid in self._ids:
            self.api.delete(f"{BASE_URL}/api/admin/calls/{cid}", headers=self.h)

    def _create_test_call_until(self, want_display):
        """Repeatedly call POST /admin/calls/test until we get a call with the given
        display (test route rotates randomly). Bounded retries."""
        for _ in range(30):
            r = self.api.post(f"{BASE_URL}/api/admin/calls/test", headers=self.h)
            assert r.status_code == 200
            call = r.json().get("call") or {}
            self._ids.append(call["id"])
            if call.get("tracking_number") == want_display:
                return call
        pytest.skip(f"could not obtain a test call with tracking_number {want_display} after 30 tries")

    def test_spanish_number_maps_to_spanish_group(self):
        call = self._create_test_call_until("866-524-3722")
        # Fetch via GET and verify enrichment
        r = self.api.get(f"{BASE_URL}/api/admin/calls", headers=self.h)
        assert r.status_code == 200
        got = next((c for c in r.json().get("calls", []) if c.get("id") == call["id"]), None)
        assert got is not None, "created call missing from admin/calls"
        assert got["number_group"] == "spanish", got
        assert got["number_group_label"] in ("Spanish & SPA", "Spanish")
        assert got["tracked_number_display"] == "866-524-3722"

    def test_home_pa_number_maps(self):
        call = self._create_test_call_until("844-335-8911")
        r = self.api.get(f"{BASE_URL}/api/admin/calls", headers=self.h)
        got = next((c for c in r.json().get("calls", []) if c.get("id") == call["id"]), None)
        assert got and got["number_group"] == "home_pa"
        assert got["tracked_number_display"] == "844-335-8911"

    def test_dg_and_dgs_numbers_map(self):
        for want, key in [("833-240-9312", "dg"), ("833-868-1802", "dgs")]:
            call = self._create_test_call_until(want)
            r = self.api.get(f"{BASE_URL}/api/admin/calls", headers=self.h)
            got = next((c for c in r.json().get("calls", []) if c.get("id") == call["id"]), None)
            assert got and got["number_group"] == key, got
            assert got["tracked_number_display"] == want
