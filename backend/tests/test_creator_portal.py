"""Backend tests for Creator Portal + Admin Creatives review feature."""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lemon-checker.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 PNG bytes
PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01^\xd2\xa9\xd8\x00\x00\x00\x00IEND\xaeB`\x82"
)

# Minimal MP4-ish bytes (won't play, but ext check is what backend validates)
MP4_STUB = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 200


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"username": "", "password": "LemonPros2026!"}, timeout=15)
    if r.status_code != 200:
        r = requests.post(f"{API}/admin/login", json={"username": "owner", "password": "LemonPros2026!"}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def creator():
    email = f"test_creator_{uuid.uuid4().hex[:8]}@example.com"
    password = "creator123"
    name = "TEST Creator"
    r = requests.post(f"{API}/creator/register", json={"name": name, "email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["creator"]["email"] == email
    return {"email": email, "password": password, "name": name, "token": data["token"], "id": data["creator"]["id"]}


class TestCreatorAuth:
    def test_duplicate_registration(self, creator):
        r = requests.post(f"{API}/creator/register", json={"name": creator["name"], "email": creator["email"], "password": "somepass"}, timeout=15)
        assert r.status_code == 409

    def test_login_ok(self, creator):
        r = requests.post(f"{API}/creator/login", json={"email": creator["email"], "password": creator["password"]}, timeout=15)
        assert r.status_code == 200
        assert r.json()["creator"]["email"] == creator["email"]

    def test_login_wrong_pw(self, creator):
        r = requests.post(f"{API}/creator/login", json={"email": creator["email"], "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{API}/creator/me", timeout=15)
        assert r.status_code in (401, 403)

    def test_me_with_token(self, creator):
        r = requests.get(f"{API}/creator/me", headers={"Authorization": f"Bearer {creator['token']}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == creator["email"]


class TestCreativesUpload:
    def test_list_empty(self, creator):
        r = requests.get(f"{API}/creator/creatives", headers={"Authorization": f"Bearer {creator['token']}"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("creatives"), list)

    def test_upload_display_ok(self, creator):
        files = {"file": ("banner.png", io.BytesIO(PNG_1x1), "image/png")}
        data = {"type": "display", "title": "TEST Display Ad", "notes": "unit-test", "size": "300x250"}
        r = requests.post(f"{API}/creator/creatives", headers={"Authorization": f"Bearer {creator['token']}"}, files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["type"] == "display"
        assert body["size"] == "300x250"
        assert body["status"] == "pending"
        assert body["title"] == "TEST Display Ad"
        creator["display_id"] = body["id"]

    def test_upload_display_bad_size(self, creator):
        files = {"file": ("banner.png", io.BytesIO(PNG_1x1), "image/png")}
        data = {"type": "display", "title": "bad size", "size": "999x999"}
        r = requests.post(f"{API}/creator/creatives", headers={"Authorization": f"Bearer {creator['token']}"}, files=files, data=data, timeout=30)
        assert r.status_code == 400

    def test_upload_video_ok(self, creator):
        files = {"file": ("clip.mp4", io.BytesIO(MP4_STUB), "video/mp4")}
        data = {"type": "video", "title": "TEST Video Ad", "notes": "unit-test"}
        r = requests.post(f"{API}/creator/creatives", headers={"Authorization": f"Bearer {creator['token']}"}, files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["type"] == "video"
        assert body["status"] == "pending"
        creator["video_id"] = body["id"]

    def test_upload_video_wrong_ext_rejected(self, creator):
        files = {"file": ("bad.png", io.BytesIO(PNG_1x1), "image/png")}
        data = {"type": "video", "title": "wrong ext"}
        r = requests.post(f"{API}/creator/creatives", headers={"Authorization": f"Bearer {creator['token']}"}, files=files, data=data, timeout=30)
        assert r.status_code == 400

    def test_upload_requires_auth(self):
        files = {"file": ("banner.png", io.BytesIO(PNG_1x1), "image/png")}
        data = {"type": "display", "title": "x", "size": "300x250"}
        r = requests.post(f"{API}/creator/creatives", files=files, data=data, timeout=15)
        assert r.status_code in (401, 403)

    def test_creator_list_has_uploads(self, creator):
        r = requests.get(f"{API}/creator/creatives", headers={"Authorization": f"Bearer {creator['token']}"}, timeout=15)
        assert r.status_code == 200
        ids = {c["id"] for c in r.json()["creatives"]}
        assert creator["display_id"] in ids
        assert creator["video_id"] in ids

    def test_file_endpoint_requires_token(self, creator):
        r = requests.get(f"{API}/creatives/{creator['display_id']}/file", timeout=15, allow_redirects=False)
        assert r.status_code == 401

    def test_file_endpoint_with_query_token(self, creator):
        r = requests.get(f"{API}/creatives/{creator['display_id']}/file", params={"auth": creator["token"]}, timeout=30)
        assert r.status_code == 200
        assert r.content[:8] == PNG_1x1[:8]


class TestAdminReview:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{API}/admin/creatives", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_list_all(self, admin_token, creator):
        r = requests.get(f"{API}/admin/creatives", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        ids = {c["id"] for c in r.json()["creatives"]}
        assert creator["display_id"] in ids and creator["video_id"] in ids

    def test_admin_filter_display(self, admin_token, creator):
        r = requests.get(f"{API}/admin/creatives", params={"type": "display"}, headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        types = {c["type"] for c in r.json()["creatives"]}
        assert types == {"display"} or types.issubset({"display"})
        ids = {c["id"] for c in r.json()["creatives"]}
        assert creator["display_id"] in ids

    def test_admin_filter_video(self, admin_token, creator):
        r = requests.get(f"{API}/admin/creatives", params={"type": "video"}, headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        ids = {c["id"] for c in r.json()["creatives"]}
        assert creator["video_id"] in ids

    def test_admin_approve(self, admin_token, creator):
        r = requests.post(f"{API}/admin/creatives/{creator['display_id']}/status",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"status": "approved"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

        # Verify creator sees it as approved
        r2 = requests.get(f"{API}/creator/creatives", headers={"Authorization": f"Bearer {creator['token']}"}, timeout=15)
        found = [c for c in r2.json()["creatives"] if c["id"] == creator["display_id"]]
        assert found and found[0]["status"] == "approved"

    def test_admin_reject(self, admin_token, creator):
        r = requests.post(f"{API}/admin/creatives/{creator['video_id']}/status",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"status": "rejected"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"

    def test_admin_bad_status(self, admin_token, creator):
        r = requests.post(f"{API}/admin/creatives/{creator['display_id']}/status",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"status": "banana"}, timeout=15)
        assert r.status_code == 400
