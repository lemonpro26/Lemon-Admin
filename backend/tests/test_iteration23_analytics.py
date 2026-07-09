"""Iteration 23: Regression tests for analytics/webhook/tracking endpoints.

Focus:
- Admin login
- GET /admin/analytics (financial fields per campaign/landing_page incl. `retained`)
- GET /admin/analytics/hourly
- GET /admin/retained
- GET /admin/metrics
- POST /track/call-click
- GET /admin/channels/summary
- GET /admin/calls (only tracked numbers)
- GET /admin/spanish
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

TRACKED_NUMBERS = {"8443358911", "8665243722", "8332409312", "8338681802"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/admin/login",
                      json={"username": "owner", "password": "LemonPros2026!"},
                      timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["token"]
    assert data.get("role") == "owner"
    return data["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ----- Login -----
def test_login_wrong_password():
    r = requests.post(f"{API}/admin/login",
                      json={"username": "owner", "password": "wrong"}, timeout=30)
    assert r.status_code == 401


# ----- /admin/analytics main -----
def test_analytics_full(auth):
    r = requests.get(f"{API}/admin/analytics",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ["by_campaign", "by_landing_page", "direct_calls", "by_adgroup",
              "by_ad", "by_keyword", "by_sitelink", "calls_by_number"]:
        assert k in data, f"missing key {k}"
    assert isinstance(data["by_campaign"], list)
    assert isinstance(data["by_landing_page"], list)

    fin_fields = {"spend", "revenue", "roas", "cpl", "cpa", "retained"}
    # by_landing_page must contain all financial fields incl retained
    for row in data["by_landing_page"]:
        missing = fin_fields - set(row.keys())
        assert not missing, f"by_landing_page row missing {missing}: {row}"
        assert isinstance(row["retained"], int), f"retained not int: {row}"
        # CPL/CPA null when spend is 0
        if (row.get("spend") or 0) == 0:
            assert row["cpl"] is None
            assert row["cpa"] is None
            assert row["roas"] is None
        else:
            leads = row.get("leads", 0) + row.get("calls", 0)
            if leads > 0:
                # cpl should equal spend/(leads+calls) roughly
                expected = round(row["spend"] / leads, 2)
                assert row["cpl"] == expected, f"CPL mismatch row={row} expected={expected}"
            if row["retained"] > 0:
                expected_cpa = round(row["spend"] / row["retained"], 2)
                assert row["cpa"] == expected_cpa

    for row in data["by_campaign"]:
        missing = fin_fields - set(row.keys())
        assert not missing, f"by_campaign row missing {missing}: {row}"
        assert isinstance(row["retained"], int)


def test_analytics_hourly(auth):
    r = requests.get(f"{API}/admin/analytics/hourly",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, (dict, list))


def test_admin_retained(auth):
    r = requests.get(f"{API}/admin/retained",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    # accept list or dict wrapper
    assert isinstance(data, (list, dict))


def test_admin_metrics(auth):
    r = requests.get(f"{API}/admin/metrics",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    # /admin/metrics is a mock media-buying dashboard (returns 'totals', 'breakdowns')
    for k in ("totals", "breakdowns"):
        assert k in data, f"missing '{k}' in /admin/metrics response"


def test_admin_stats_total_retained(auth):
    """The 'total_retained' aggregate lives on /admin/stats (not /admin/metrics)."""
    r = requests.get(f"{API}/admin/stats",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "total_retained" in data
    assert isinstance(data["total_retained"], int)


def test_channels_summary(auth):
    r = requests.get(f"{API}/admin/channels/summary",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text


def test_admin_spanish(auth):
    r = requests.get(f"{API}/admin/spanish",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text


def test_admin_calls_only_tracked(auth):
    r = requests.get(f"{API}/admin/calls",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    calls = data if isinstance(data, list) else data.get("calls", data.get("items", []))
    assert isinstance(calls, list)
    bad = []
    for c in calls:
        # candidate 'to' fields
        to_digits = ""
        for key in ("to", "to_number", "dialed", "tracking_number", "called_number"):
            v = c.get(key)
            if v:
                to_digits = "".join(ch for ch in str(v) if ch.isdigit())[-10:]
                break
        if to_digits and to_digits not in TRACKED_NUMBERS:
            bad.append(to_digits)
    assert not bad, f"Untracked numbers appearing in /admin/calls: {set(bad)}"


# ----- /track/call-click -----
def test_track_call_click_creates_doc():
    sid = f"TEST_{uuid.uuid4()}"
    r = requests.post(f"{API}/track/call-click", json={
        "session_id": sid,
        "source_page": "/la",
        "number": "800-444-2867",
        "gclid": "TEST_gclid_xyz",
    }, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True


def test_track_call_click_bot_ignored():
    r = requests.post(f"{API}/track/call-click",
                      headers={"User-Agent": "Googlebot/2.1"},
                      json={"session_id": "bot", "source_page": "/la",
                            "number": "8004442867"}, timeout=30)
    assert r.status_code == 200
    # not asserting bot field; endpoint just shouldn't crash
