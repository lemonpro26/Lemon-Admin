"""
Google Ads offline (server-to-server) conversion upload with revenue passback.

Uploads a click conversion keyed by GCLID (when available) plus Enhanced
Conversions for Leads (hashed email / phone / name / address) so conversions
still match when the GCLID is missing.

Everything is driven by environment variables (server-side only):
    GOOGLE_ADS_DEVELOPER_TOKEN
    GOOGLE_ADS_CLIENT_ID
    GOOGLE_ADS_CLIENT_SECRET
    GOOGLE_ADS_REFRESH_TOKEN
    GOOGLE_ADS_LOGIN_CUSTOMER_ID      (manager / MCC account, digits only)
    GOOGLE_ADS_CUSTOMER_ID            (the ad account that owns the conversion)
    GOOGLE_ADS_CONVERSION_ACTION_ID   (numeric id of the Import conversion action)
    GOOGLE_ADS_VALIDATE_ONLY          ("true" => validate but do NOT record)

The module never raises on import and degrades gracefully when not configured,
so the rest of the API keeps working before credentials are supplied.
"""
import os
import re
import hashlib
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

REQUIRED_KEYS = [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_CONVERSION_ACTION_ID",
]


# ----------------------------- configuration -----------------------------
def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def is_validate_only() -> bool:
    return os.environ.get("GOOGLE_ADS_VALIDATE_ONLY", "true").strip().lower() in (
        "1", "true", "yes", "on",
    )


def missing_keys() -> list:
    return [k for k in REQUIRED_KEYS if not (os.environ.get(k) or "").strip()]


def is_configured() -> bool:
    return len(missing_keys()) == 0


def status() -> dict:
    miss = missing_keys()
    return {
        "configured": len(miss) == 0,
        "missing": miss,
        "validate_only": is_validate_only(),
        "login_customer_id": _digits(os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "")),
        "customer_id": _digits(os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "")),
        "conversion_action_id": _digits(os.environ.get("GOOGLE_ADS_CONVERSION_ACTION_ID", "")),
        "library_installed": _library_installed(),
    }


def _library_installed() -> bool:
    try:
        import google.ads.googleads.client  # noqa: F401
        return True
    except Exception:
        return False


# ----------------------------- hashing utils -----------------------------
def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _norm_email(email: str) -> str:
    return (email or "").strip().lower()


def _norm_phone(phone: str) -> str:
    # E.164-ish: keep a leading + then digits. Google expects +<countrycode><number>.
    p = (phone or "").strip()
    digits = re.sub(r"\D", "", p)
    if not digits:
        return ""
    # Default to US (+1) when a 10-digit local number is supplied.
    if len(digits) == 10:
        digits = "1" + digits
    return "+" + digits


def _norm_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def hash_email(email: str) -> str:
    e = _norm_email(email)
    return _sha256(e) if e else ""


def hash_phone(phone: str) -> str:
    p = _norm_phone(phone)
    return _sha256(p) if p else ""


def hash_text(value: str) -> str:
    t = _norm_text(value)
    return _sha256(t) if t else ""


# ----------------------------- client -----------------------------
_CLIENT = None


def _get_client():
    """Lazily build (and cache) a GoogleAdsClient from env config."""
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    from google.ads.googleads.client import GoogleAdsClient

    config = {
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"].strip(),
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"].strip(),
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"].strip(),
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"].strip(),
        "use_proto_plus": True,
    }
    login_cid = _digits(os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", ""))
    if login_cid:
        config["login_customer_id"] = login_cid
    _CLIENT = GoogleAdsClient.load_from_dict(config)
    return _CLIENT


def reset_client():
    """Drop the cached client (call after credentials change)."""
    global _CLIENT
    _CLIENT = None


# ----------------------------- conversion datetime -----------------------------
def _format_conversion_dt(sale_dt) -> str:
    """Google Ads expects 'YYYY-MM-DD HH:MM:SS+HH:MM'. We emit UTC with +00:00."""
    if isinstance(sale_dt, str):
        try:
            sale_dt = datetime.fromisoformat(sale_dt.replace("Z", "+00:00"))
        except Exception:
            sale_dt = datetime.now(timezone.utc)
    if sale_dt.tzinfo is None:
        sale_dt = sale_dt.replace(tzinfo=timezone.utc)
    sale_dt = sale_dt.astimezone(timezone.utc)
    return sale_dt.strftime("%Y-%m-%d %H:%M:%S+00:00")


# ----------------------------- upload -----------------------------
def upload_offline_conversion(
    lead: dict,
    value: float,
    currency: str = "USD",
    sale_datetime=None,
    order_id: str = None,
    enhanced: bool = True,
) -> dict:
    """Upload a single offline click conversion for a lead.

    Returns a JSON-safe dict:
        {ok, status, validate_only, detail, gclid_used, identifiers}
    Never raises; all errors are captured in the response.
    """
    if not is_configured():
        return {
            "ok": False,
            "status": "not_configured",
            "validate_only": is_validate_only(),
            "detail": "Google Ads credentials are not set. Add them in backend .env.",
            "missing": missing_keys(),
        }
    if not _library_installed():
        return {"ok": False, "status": "library_missing",
                "detail": "google-ads library is not installed."}

    validate_only = is_validate_only()
    customer_id = _digits(os.environ["GOOGLE_ADS_CUSTOMER_ID"])
    conversion_action_id = _digits(os.environ["GOOGLE_ADS_CONVERSION_ACTION_ID"])
    gclid = (lead.get("gclid") or "").strip()

    try:
        from google.ads.googleads.errors import GoogleAdsException

        client = _get_client()
        conversion_action_service = client.get_service("ConversionActionService")
        ca_resource = conversion_action_service.conversion_action_path(
            customer_id, conversion_action_id
        )

        click_conversion = client.get_type("ClickConversion")
        click_conversion.conversion_action = ca_resource
        click_conversion.conversion_date_time = _format_conversion_dt(sale_datetime)
        click_conversion.conversion_value = float(value)
        click_conversion.currency_code = (currency or "USD").upper()
        if order_id:
            click_conversion.order_id = str(order_id)
        if gclid:
            click_conversion.gclid = gclid

        identifiers_used = []
        if enhanced:
            he = hash_email(lead.get("email", ""))
            if he:
                ui = client.get_type("UserIdentifier")
                ui.hashed_email = he
                click_conversion.user_identifiers.append(ui)
                identifiers_used.append("email")

            hp = hash_phone(lead.get("phone", ""))
            if hp:
                ui = client.get_type("UserIdentifier")
                ui.hashed_phone_number = hp
                click_conversion.user_identifiers.append(ui)
                identifiers_used.append("phone")

            first = lead.get("first_name", "")
            last = lead.get("last_name", "")
            postal = lead.get("zip", "")
            if (first or last) and postal:
                ui = client.get_type("UserIdentifier")
                if first:
                    ui.address_info.hashed_first_name = hash_text(first)
                if last:
                    ui.address_info.hashed_last_name = hash_text(last)
                ui.address_info.postal_code = str(postal)
                ui.address_info.country_code = "US"
                click_conversion.user_identifiers.append(ui)
                identifiers_used.append("name+postal")

        # A conversion needs at least a gclid OR user identifiers to match.
        if not gclid and not click_conversion.user_identifiers:
            return {"ok": False, "status": "no_identifier",
                    "detail": "Lead has no GCLID and no email/phone for matching."}

        request = client.get_type("UploadClickConversionsRequest")
        request.customer_id = customer_id
        request.conversions.append(click_conversion)
        request.partial_failure = True
        request.validate_only = validate_only

        upload_service = client.get_service("ConversionUploadService")
        response = upload_service.upload_click_conversions(request=request)

        # Partial-failure error means the (single) conversion was rejected.
        pf = getattr(response, "partial_failure_error", None)
        if pf and getattr(pf, "message", ""):
            return {
                "ok": False,
                "status": "rejected",
                "validate_only": validate_only,
                "detail": pf.message,
                "gclid_used": bool(gclid),
                "identifiers": identifiers_used,
            }

        return {
            "ok": True,
            "status": "validated" if validate_only else "uploaded",
            "validate_only": validate_only,
            "detail": (
                "Validated successfully (test mode — not recorded in Google Ads)."
                if validate_only
                else "Conversion uploaded to Google Ads."
            ),
            "gclid_used": bool(gclid),
            "identifiers": identifiers_used,
        }

    except GoogleAdsException as ex:  # type: ignore
        msgs = []
        try:
            for err in ex.failure.errors:
                msgs.append(err.message)
        except Exception:
            msgs.append(str(ex))
        detail = " | ".join(msgs) or str(ex)
        logger.error("Google Ads upload failed: %s", detail)
        return {"ok": False, "status": "api_error", "validate_only": validate_only,
                "detail": detail}
    except Exception as e:  # noqa: BLE001
        logger.error("Google Ads upload error: %s", e)
        return {"ok": False, "status": "error", "validate_only": validate_only,
                "detail": str(e)}
