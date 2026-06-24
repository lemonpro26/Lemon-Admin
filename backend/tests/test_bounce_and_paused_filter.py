"""
Backend tests for:
 1) GET /admin/ad-entities filters out paused/non-live campaigns (only IDs in
    cfg.live_campaigns appear).
 2) GET /admin/analytics bounce_rate uses the new definition:
       bounce = landing click whose session is NOT engaged AND NOT converted
                AND visits <= 1.
 3) POST /track/engage marks the session engaged (idempotent, no-op for missing).
 4) Regression: /admin/analytics still returns by_campaign/by_adgroup/by_ad/
    by_keyword arrays; /admin/ad-entities returns campaigns/adgroups/ads.

Critical gotcha: POST /track/click silently drops bot UAs (curl default qualifies).
Tests MUST send a real browser User-Agent header or the clicks vanish.
"""
import datetime as dt
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for direct pytest runs — read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

LIVE_CAMPAIGN_ID = "14391026804"   # in synced live_campaigns
PAUSED_CAMPAIGN_ID = "99999999999"  # NOT in live_campaigns

# Use a unique-per-run prefix so we never collide with prior test data.
RUN_TAG = f"qa-bounce-{int(time.time())}"
SESSION_BOUNCE = f"{RUN_TAG}-1"      # live campaign, stays a bounce
SESSION_ENGAGED = f"{RUN_TAG}-2"     # live campaign, will be engaged
SESSION_PAUSED = f"{RUN_TAG}-3"      # paused campaign (should be filtered out)
SESSION_MISSING = f"{RUN_TAG}-ghost"  # never has a click — engage must still 200


# --------------------------- fixtures ---------------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "owner", "password": "LemonPros2026!"},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok and isinstance(tok, str)
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def today_range():
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    return today, today


@pytest.fixture(scope="module", autouse=True)
def seed_clicks_and_engage():
    """Create the 3 test clicks (with a browser UA so they aren't bot-filtered)
    and engage one of them. Runs ONCE for the module."""
    ua_headers = {"User-Agent": BROWSER_UA, "Content-Type": "application/json"}

    # IMPORTANT: GET /admin/analytics calls _auto_clean_bot_clicks() which
    # silently deletes any click that has campaign_id but no gclid/wbraid/gbraid
    # (treated as phantom paid click from AdsBot). Real paid clicks always carry
    # a gclid, so test clicks MUST include one or they vanish before assertions.
    def _click(session_id, campaign_id, adgroup_id="ag1", ad_id="ad1"):
        return {
            "session_id": session_id,
            "campaign_id": campaign_id,
            "adgroup_id": adgroup_id,
            "ad_id": ad_id,
            "gclid": f"QA-{session_id}",
        }

    # Bouncer on live campaign
    r1 = requests.post(
        f"{BASE_URL}/api/track/click",
        headers=ua_headers,
        json=_click(SESSION_BOUNCE, LIVE_CAMPAIGN_ID),
        timeout=15,
    )
    assert r1.status_code == 200, f"track/click bounce failed: {r1.status_code} {r1.text}"
    assert r1.json().get("success") is True
    assert not r1.json().get("bot"), "click was bot-filtered — UA header wrong"

    # Engaged session on live campaign
    r2 = requests.post(
        f"{BASE_URL}/api/track/click",
        headers=ua_headers,
        json=_click(SESSION_ENGAGED, LIVE_CAMPAIGN_ID),
        timeout=15,
    )
    assert r2.status_code == 200, f"track/click engaged failed: {r2.status_code} {r2.text}"
    assert not r2.json().get("bot")

    # Click on paused campaign — must be excluded from /admin/ad-entities
    r3 = requests.post(
        f"{BASE_URL}/api/track/click",
        headers=ua_headers,
        json=_click(SESSION_PAUSED, PAUSED_CAMPAIGN_ID, adgroup_id="ag9", ad_id=""),
        timeout=15,
    )
    assert r3.status_code == 200
    assert not r3.json().get("bot")

    # Mark session-2 engaged
    r4 = requests.post(
        f"{BASE_URL}/api/track/engage",
        headers=ua_headers,
        json={"session_id": SESSION_ENGAGED},
        timeout=15,
    )
    assert r4.status_code == 200
    assert r4.json().get("success") is True
    yield
    # Note: there is no admin endpoint to delete clicks; test rows are harmless
    # and bot-clean only removes bot UAs.


# ----------------------- /track/engage tests --------------------------
class TestEngageEndpoint:
    def test_engage_returns_success(self):
        r = requests.post(
            f"{BASE_URL}/api/track/engage",
            headers={"User-Agent": BROWSER_UA},
            json={"session_id": SESSION_ENGAGED},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is True

    def test_engage_is_idempotent(self):
        # Calling twice in a row must not error.
        for _ in range(2):
            r = requests.post(
                f"{BASE_URL}/api/track/engage",
                headers={"User-Agent": BROWSER_UA},
                json={"session_id": SESSION_ENGAGED},
                timeout=15,
            )
            assert r.status_code == 200
            assert r.json().get("success") is True

    def test_engage_missing_session_still_success(self):
        r = requests.post(
            f"{BASE_URL}/api/track/engage",
            headers={"User-Agent": BROWSER_UA},
            json={"session_id": SESSION_MISSING},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("success") is True


# ----------------- /admin/ad-entities paused filter -------------------
class TestAdEntitiesPausedFilter:
    def test_live_campaign_present_and_paused_excluded(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/ad-entities",
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"ad-entities failed: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data.get("campaigns"), list)
        assert isinstance(data.get("adgroups"), list)
        assert isinstance(data.get("ads"), list)

        campaign_ids = {c["campaign_id"] for c in data["campaigns"]}
        assert LIVE_CAMPAIGN_ID in campaign_ids, (
            f"LIVE campaign {LIVE_CAMPAIGN_ID} missing from /admin/ad-entities "
            f"(got: {sorted(campaign_ids)})"
        )
        assert PAUSED_CAMPAIGN_ID not in campaign_ids, (
            f"PAUSED campaign {PAUSED_CAMPAIGN_ID} should be filtered out but "
            f"appeared in /admin/ad-entities"
        )

        # Ad-groups/ads under paused campaign must also be filtered out
        paused_ag = [a for a in data["adgroups"] if a["campaign_id"] == PAUSED_CAMPAIGN_ID]
        paused_ads = [a for a in data["ads"] if a["campaign_id"] == PAUSED_CAMPAIGN_ID]
        assert paused_ag == [], f"paused ad-groups leaked: {paused_ag}"
        assert paused_ads == [], f"paused ads leaked: {paused_ads}"


# ----------------- /admin/analytics bounce rate -----------------------
class TestAnalyticsBounceRate:
    def _by_campaign_row(self, auth_headers, today_range, campaign_id):
        s, e = today_range
        r = requests.get(
            f"{BASE_URL}/api/admin/analytics",
            params={"start": s, "end": e},
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"analytics failed: {r.status_code} {r.text}"
        data = r.json()
        for key in ("by_campaign", "by_adgroup", "by_ad", "by_keyword"):
            assert isinstance(data.get(key), list), f"{key} not a list"
        for row in data["by_campaign"]:
            if row.get("campaign_id") == campaign_id:
                return row, data
        return None, data

    def test_live_campaign_bounce_rate_50pct(self, auth_headers, today_range):
        row, _ = self._by_campaign_row(auth_headers, today_range, LIVE_CAMPAIGN_ID)
        assert row is not None, (
            f"campaign {LIVE_CAMPAIGN_ID} not found in by_campaign — "
            "engaged sessions and bounces could not be evaluated."
        )
        # We seeded exactly two clicks today on this campaign.
        assert row["clicks"] == 2, f"expected 2 clicks, got {row['clicks']}: {row}"
        # One was engaged → it should NOT count as a bounce. The other stays.
        assert "bounce_rate" in row
        assert row["bounce_rate"] == 50.0, (
            f"expected bounce_rate=50.0, got {row['bounce_rate']}: {row} — "
            "engaged session was likely still counted as a bounce."
        )
        # And confirm raw bounce count when exposed (server returns bounce_rate
        # rather than 'bounced' — derive expected count).
        # bounce_rate = bounced/clicks*100 → bounced = 1
        derived_bounced = round(row["bounce_rate"] * row["clicks"] / 100)
        assert derived_bounced == 1

    def test_paused_campaign_excluded_from_analytics(self, auth_headers, today_range):
        row, data = self._by_campaign_row(auth_headers, today_range, PAUSED_CAMPAIGN_ID)
        assert row is None, (
            f"paused campaign {PAUSED_CAMPAIGN_ID} leaked into analytics by_campaign: {row}"
        )

    def test_analytics_arrays_regression(self, auth_headers, today_range):
        s, e = today_range
        r = requests.get(
            f"{BASE_URL}/api/admin/analytics",
            params={"start": s, "end": e},
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        for key in ("by_campaign", "by_adgroup", "by_ad", "by_keyword"):
            assert key in data
            assert isinstance(data[key], list)
