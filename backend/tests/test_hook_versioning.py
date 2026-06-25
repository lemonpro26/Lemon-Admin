"""Backend tests for versioned hook editing + multilingual (en/es) isolation.

Covers:
- POST /api/admin/hook-rules creates a variant for the given lang.
- POST /api/admin/hook-rules/{id}/revise archives the old variant (moves it to
  history) and creates a new active variant.
- POST /api/admin/hook-rules/{id}/reactivate brings a paused/archived variant
  back into the active list.
- GET /api/admin/hook-rules?lang= returns rules/history/default scoped to lang.
- GET /api/config/public?lang=es serves Spanish hook variants (and / does not).
"""

import os
import uuid

import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
ADMIN_PASSWORD = "LemonPros2026!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "owner", "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# -------------------- Auth --------------------
def test_login_works():
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "", "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "owner"
    assert isinstance(data["token"], str) and len(data["token"]) > 0


def test_login_bad_password():
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "owner", "password": "wrong"},
        timeout=15,
    )
    assert r.status_code == 401


# -------------------- Hook rules: list w/ lang --------------------
def test_list_hook_rules_default_lang_en(auth):
    r = requests.get(f"{BASE_URL}/api/admin/hook-rules", headers=auth, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "rules" in data and "history" in data and "default" in data
    assert isinstance(data["rules"], list)
    assert isinstance(data["history"], list)
    # Default catch-all should be present
    assert data["default"]["is_default"] is True


def test_list_hook_rules_lang_es(auth):
    r = requests.get(f"{BASE_URL}/api/admin/hook-rules?lang=es", headers=auth, timeout=15)
    assert r.status_code == 200
    data = r.json()
    # Default for ES should reflect hook1_es seed
    assert data["default"]["lang"] == "es"


# -------------------- Versioned edit (English) --------------------
def test_create_revise_reactivate_english_flow(auth):
    suffix = uuid.uuid4().hex[:6]
    original_label = f"TEST_EN_{suffix}"
    original_hook1 = f"TEST EN ORIGINAL HOOK1 {suffix}"
    payload = {
        "label": original_label,
        "hook1": original_hook1,
        "hook2": "TEST EN HOOK2",
        "match_campaign": "", "match_adgroup": "", "match_ad": "",
        "weight": 50, "enabled": True, "lang": "en",
    }
    r = requests.post(f"{BASE_URL}/api/admin/hook-rules", json=payload, headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["lang"] == "en"
    assert created["archived"] is False
    rule_id = created["id"]

    try:
        # Confirm it's in active rules for EN
        r = requests.get(f"{BASE_URL}/api/admin/hook-rules?lang=en", headers=auth, timeout=15)
        active_ids = [x["id"] for x in r.json()["rules"]]
        assert rule_id in active_ids

        # Should NOT show up under ES
        r_es = requests.get(f"{BASE_URL}/api/admin/hook-rules?lang=es", headers=auth, timeout=15)
        es_ids = [x["id"] for x in r_es.json()["rules"]]
        assert rule_id not in es_ids, "EN rule leaked into ES list"

        # Revise -> archive old, create new
        new_hook1 = f"TEST EN REVISED HOOK1 {suffix}"
        revise_payload = {**payload, "hook1": new_hook1}
        r = requests.post(
            f"{BASE_URL}/api/admin/hook-rules/{rule_id}/revise",
            json=revise_payload, headers=auth, timeout=15,
        )
        assert r.status_code == 200, r.text
        new_rule = r.json()
        assert new_rule["hook1"] == new_hook1
        assert new_rule["id"] != rule_id
        assert new_rule.get("revised_from") == rule_id
        new_id = new_rule["id"]

        # Verify: old gone from active, present in history; new in active
        r = requests.get(f"{BASE_URL}/api/admin/hook-rules?lang=en", headers=auth, timeout=15)
        data = r.json()
        active_ids = [x["id"] for x in data["rules"]]
        history_ids = [x["id"] for x in data["history"]]
        assert rule_id not in active_ids, "old rule still in active list after revise"
        assert rule_id in history_ids, "old rule should be in history"
        assert new_id in active_ids, "new rule should be active"

        # Reactivate old version
        r = requests.post(
            f"{BASE_URL}/api/admin/hook-rules/{rule_id}/reactivate",
            headers=auth, timeout=15,
        )
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/admin/hook-rules?lang=en", headers=auth, timeout=15)
        data = r.json()
        active_ids = [x["id"] for x in data["rules"]]
        assert rule_id in active_ids, "rule should be back in active after reactivate"

        # Cleanup new rule
        requests.delete(f"{BASE_URL}/api/admin/hook-rules/{new_id}", headers=auth, timeout=15)
    finally:
        requests.delete(f"{BASE_URL}/api/admin/hook-rules/{rule_id}", headers=auth, timeout=15)


# -------------------- Spanish variant + serving --------------------
def test_spanish_variant_isolated_and_served_on_sp(auth):
    suffix = uuid.uuid4().hex[:6]
    es_hook1 = f"TEST ES ORIGINAL {suffix}"
    payload = {
        "label": f"TEST_ES_{suffix}",
        "hook1": es_hook1,
        "hook2": "TEST ES HOOK2",
        "match_campaign": "", "match_adgroup": "", "match_ad": "",
        "weight": 100, "enabled": True, "lang": "es",
    }
    r = requests.post(f"{BASE_URL}/api/admin/hook-rules", json=payload, headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    rule_id = r.json()["id"]
    assert r.json()["lang"] == "es"

    try:
        # /config/public?lang=es should serve our ES variant text
        r = requests.get(
            f"{BASE_URL}/api/config/public?lang=es&session=spanish-test-{suffix}",
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["hook1"] == es_hook1, (
            f"Spanish hook not served. Got: {r.json()['hook1']!r}"
        )

        # / (English) should NOT show the Spanish text
        r_en = requests.get(
            f"{BASE_URL}/api/config/public?session=english-test-{suffix}",
            timeout=15,
        )
        assert r_en.status_code == 200
        assert r_en.json()["hook1"] != es_hook1, "ES variant leaked into EN serving"
    finally:
        requests.delete(f"{BASE_URL}/api/admin/hook-rules/{rule_id}", headers=auth, timeout=15)


# -------------------- Auth gates --------------------
def test_revise_requires_auth():
    r = requests.post(
        f"{BASE_URL}/api/admin/hook-rules/nonexistent/revise",
        json={"label": "x", "hook1": "x", "hook2": "x"}, timeout=10,
    )
    assert r.status_code == 401


def test_reactivate_requires_auth():
    r = requests.post(
        f"{BASE_URL}/api/admin/hook-rules/nonexistent/reactivate", timeout=10,
    )
    assert r.status_code == 401
