"""Emergent Object Storage helpers — used by the Creator Portal for video/image uploads."""
import os
import requests

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "lemonpros"

_storage_key = None


def init_storage():
    """Call to obtain a session-scoped, reusable storage key (cached)."""
    global _storage_key
    if _storage_key:
        return _storage_key
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": emergent_key}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _with_retry(fn):
    """Retry once on 403 (expired key) by re-initing."""
    global _storage_key
    try:
        return fn(init_storage())
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 403:
            _storage_key = None
            return fn(init_storage())
        raise


def put_object(path: str, data: bytes, content_type: str) -> dict:
    def _do(key):
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=300,
        )
        r.raise_for_status()
        return r.json()
    return _with_retry(_do)


def get_object(path: str):
    def _do(key):
        r = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=120,
        )
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")
    return _with_retry(_do)
