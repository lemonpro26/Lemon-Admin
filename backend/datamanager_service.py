"""Google Data Manager API — offline conversion (revenue passback) via REST.

Replaces the deprecated Google Ads ConversionUploadService. Sends an offline
conversion event (GCLID + hashed identifiers + value) to a Google Ads
conversion action of type UPLOAD_CLICKS ("Website (Import from clicks)").

Reuses the existing OAuth client; the refresh token MUST be minted with the
https://www.googleapis.com/auth/datamanager scope (GOOGLE_DATAMANAGER_REFRESH_TOKEN).
Never raises; returns a JSON-safe dict.
"""
import os
import hashlib
import re
import time
from datetime import datetime, timezone

import httpx

TOKEN_URL = "https://oauth2.googleapis.com/token"
INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest"

REQUIRED_KEYS = [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_DATAMANAGER_REFRESH_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_CONVERSION_ACTION_ID",
]

_TOKEN_CACHE = {"access_token": "", "exp": 0}


def _digits(v: str) -> str:
    return re.sub(r"\D", "", v or "")


def is_validate_only() -> bool:
    return os.environ.get("GOOGLE_ADS_VALIDATE_ONLY", "true").strip().lower() in ("1", "true", "yes")


def missing_keys() -> list:
    return [k for k in REQUIRED_KEYS if not (os.environ.get(k) or "").strip()]


def is_configured() -> bool:
    return not missing_keys()


def status() -> dict:
    return {
        "api": "data_manager",
        "configured": is_configured(),
        "missing": missing_keys(),
        "validate_only": is_validate_only(),
        "customer_id": _digits(os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "")),
        "conversion_action_id": _digits(os.environ.get("GOOGLE_ADS_CONVERSION_ACTION_ID", "")),
        "has_datamanager_token": bool((os.environ.get("GOOGLE_DATAMANAGER_REFRESH_TOKEN") or "").strip()),
    }


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _norm_email(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return e
    local, domain = e.split("@", 1)
    if domain in ("gmail.com", "googlemail.com"):
        local = local.split("+", 1)[0].replace(".", "")
    return f"{local}@{domain}"


def hash_email(email: str) -> str:
    e = _norm_email(email)
    return _sha256_hex(e) if e else ""


def hash_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return ""
    if not (phone or "").strip().startswith("+"):
        if len(digits) == 10:  # assume US
            digits = "1" + digits
    return _sha256_hex("+" + digits)


def _access_token() -> str:
    now = time.time()
    if _TOKEN_CACHE["access_token"] and _TOKEN_CACHE["exp"] - 60 > now:
        return _TOKEN_CACHE["access_token"]
    data = {
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"].strip(),
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"].strip(),
        "refresh_token": os.environ["GOOGLE_DATAMANAGER_REFRESH_TOKEN"].strip(),
        "grant_type": "refresh_token",
    }
    with httpx.Client(timeout=15.0) as c:
        r = c.post(TOKEN_URL, data=data)
        r.raise_for_status()
        payload = r.json()
    _TOKEN_CACHE["access_token"] = payload["access_token"]
    _TOKEN_CACHE["exp"] = now + int(payload.get("expires_in", 3600))
    return _TOKEN_CACHE["access_token"]


def _iso_rfc3339(dt) -> str:
    if not dt:
        dt = datetime.now(timezone.utc)
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def upload_offline_conversion(lead: dict, value: float, currency: str = "USD",
                              sale_datetime=None, order_id: str = None,
                              enhanced: bool = True) -> dict:
    """Send a single offline conversion event via the Data Manager API."""
    if not is_configured():
        return {"ok": False, "status": "not_configured",
                "detail": "Data Manager credentials are not set.",
                "missing": missing_keys()}

    validate_only = is_validate_only()
    customer_id = _digits(os.environ["GOOGLE_ADS_CUSTOMER_ID"])
    conversion_action_id = _digits(os.environ["GOOGLE_ADS_CONVERSION_ACTION_ID"])
    gclid = (lead.get("gclid") or "").strip()

    event = {
        "eventTimestamp": _iso_rfc3339(sale_datetime),
        "transactionId": str(order_id or lead.get("id") or lead.get("_id") or ""),
        "eventSource": "WEB",
        "conversionValue": float(value),
        "currency": (currency or "USD").upper(),
    }
    if gclid:
        event["adIdentifiers"] = {"gclid": gclid}

    identifiers = []
    identifiers_used = []
    if enhanced:
        he = hash_email(lead.get("email", ""))
        if he:
            identifiers.append({"emailAddress": he})
            identifiers_used.append("email")
        hp = hash_phone(lead.get("phone", ""))
        if hp:
            identifiers.append({"phoneNumber": hp})
            identifiers_used.append("phone")
    if identifiers:
        event["userData"] = {"userIdentifiers": identifiers}

    if not gclid and not identifiers:
        return {"ok": False, "status": "no_identifier",
                "detail": "Lead has no GCLID and no email/phone for matching."}

    body = {
        "destinations": [{
            "operatingAccount": {"accountType": "GOOGLE_ADS", "accountId": customer_id},
            "productDestinationId": conversion_action_id,
        }],
        "events": [event],
        "consent": {"adUserData": "CONSENT_GRANTED", "adPersonalization": "CONSENT_GRANTED"},
        "encoding": "HEX",
        "validateOnly": validate_only,
    }

    try:
        token = _access_token()
        with httpx.Client(timeout=20.0) as c:
            r = c.post(INGEST_URL, json=body,
                       headers={"Authorization": f"Bearer {token}",
                                "Content-Type": "application/json"})
        if r.status_code >= 400:
            detail = r.text
            try:
                detail = r.json().get("error", {}).get("message", detail)
            except Exception:
                pass
            return {"ok": False, "status": "rejected", "http": r.status_code,
                    "validate_only": validate_only, "detail": detail,
                    "gclid_used": bool(gclid), "identifiers": identifiers_used}
        resp = r.json() if r.text else {}
        return {"ok": True,
                "status": "validated" if validate_only else "uploaded",
                "validate_only": validate_only,
                "detail": ("Validated successfully (test mode — not recorded)."
                           if validate_only else "Conversion sent to Google Ads."),
                "request_id": resp.get("requestId"),
                "gclid_used": bool(gclid), "identifiers": identifiers_used}
    except Exception as e:
        return {"ok": False, "status": "error", "validate_only": validate_only,
                "detail": str(e)}
