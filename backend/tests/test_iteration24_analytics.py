"""Iteration 24: Regression for canonicalized source_page + retained reconciliation.

Focus:
- No duplicate source_page rows in by_landing_page
- No alias codes (ladg/ladgs/latm/latm2/pa/spa) — must be normalized
- Financial fields present with null when spend==0
- By-campaign retained sum reconciles with /admin/retained count via '__unattributed__' row
- Drill-down endpoints, hourly, channels, spanish, calls, stats all 200
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ALIAS_CODES = {"ladg", "ladgs", "latm", "latm2", "pa", "spa"}
CANONICAL_EXPECTED = {"dg", "dgs", "tm", "tm2", "lapa", "laspa"}
FIN_FIELDS = {"spend", "revenue", "roas", "cpl", "cpa", "retained"}


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{API}/admin/login",
                      json={"username": "owner", "password": "LemonPros2026!"},
                      timeout=30)
    assert r.status_code == 200, f"login: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def analytics(auth):
    r = requests.get(f"{API}/admin/analytics",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=90)
    assert r.status_code == 200, r.text
    return r.json()


def test_login_returns_token():
    r = requests.post(f"{API}/admin/login",
                      json={"username": "owner", "password": "LemonPros2026!"},
                      timeout=30)
    assert r.status_code == 200
    assert r.json().get("token")


def test_by_landing_page_no_duplicate_source_pages(analytics):
    rows = analytics["by_landing_page"]
    codes = [r.get("source_page") for r in rows]
    dupes = [c for c in set(codes) if codes.count(c) > 1]
    assert not dupes, f"Duplicate source_page rows found: {dupes} | rows={rows}"


def test_by_landing_page_no_alias_codes(analytics):
    rows = analytics["by_landing_page"]
    codes = {r.get("source_page") for r in rows}
    bad = codes & ALIAS_CODES
    assert not bad, f"Alias codes not canonicalized: {bad} | all codes={codes}"


def test_by_landing_page_financial_fields(analytics):
    rows = analytics["by_landing_page"]
    for row in rows:
        missing = FIN_FIELDS - set(row.keys())
        assert not missing, f"row missing {missing}: {row}"
        if (row.get("spend") or 0) == 0:
            assert row["cpl"] is None, f"cpl not null when spend==0: {row}"
            assert row["cpa"] is None, f"cpa not null when spend==0: {row}"
            assert row["roas"] is None, f"roas not null when spend==0: {row}"
        assert isinstance(row["retained"], int)


def test_by_campaign_retained_reconciles_with_retained_endpoint(auth, analytics):
    r = requests.get(f"{API}/admin/retained",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200
    data = r.json()
    if isinstance(data, list):
        retained_count = len(data)
    else:
        items = data.get("items") or data.get("retained") or []
        retained_count = data.get("count", len(items))

    by_campaign = analytics["by_campaign"]
    sum_retained = sum(int(row.get("retained") or 0) for row in by_campaign)

    # Look for the reconciliation row
    unattributed = [r for r in by_campaign if r.get("campaign_id") == "__unattributed__"]
    assert sum_retained == retained_count, (
        f"By-campaign retained sum ({sum_retained}) != /admin/retained count "
        f"({retained_count}); unattributed_row={unattributed}"
    )


def test_drilldowns_present(analytics):
    for k in ("by_adgroup", "by_ad", "by_keyword", "by_sitelink"):
        assert k in analytics, f"missing key {k}"
        assert isinstance(analytics[k], list)


def test_calls_by_number(analytics):
    assert "calls_by_number" in analytics


def test_hourly_endpoint(auth):
    r = requests.get(f"{API}/admin/analytics/hourly",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text


def test_retained_has_attribution_fields(auth):
    r = requests.get(f"{API}/admin/retained",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else (
        data.get("items") or data.get("retained") or [])
    if not items:
        pytest.skip("no retained records to inspect")
    sample = items[0]
    for field in ("campaign_id", "source_page", "gclid"):
        assert field in sample, f"retained record missing {field}: {sample}"


def test_stats_total_retained(auth):
    r = requests.get(f"{API}/admin/stats",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert "total_retained" in d
    assert isinstance(d["total_retained"], int)


def test_channels_endpoint(auth):
    # Try both names — /admin/analytics/channels per problem statement
    r = requests.get(f"{API}/admin/analytics/channels",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    if r.status_code == 404:
        r = requests.get(f"{API}/admin/channels/summary",
                         params={"start": "2020-01-01", "end": "2026-12-31"},
                         headers=auth, timeout=60)
    assert r.status_code == 200, r.text


def test_spanish_endpoint(auth):
    r = requests.get(f"{API}/admin/spanish",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200, r.text


def test_admin_calls_tracked_numbers_only(auth):
    r = requests.get(f"{API}/admin/calls",
                     params={"start": "2020-01-01", "end": "2026-12-31"},
                     headers=auth, timeout=60)
    assert r.status_code == 200
    data = r.json()
    calls = data if isinstance(data, list) else data.get("calls", data.get("items", []))
    for c in calls:
        ng = c.get("number_group")
        if ng is not None:
            assert ng != "other", f"call with number_group='other' returned: {c}"
