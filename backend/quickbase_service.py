"""Read-only Quickbase lookup: given a phone number, return the client's full
name + email. Used to enrich retained clients (especially calls, which arrive
from CallTrackingMetrics with only a phone number). Never writes to Quickbase."""
import os
import re
import logging
import requests

logger = logging.getLogger(__name__)

_API = "https://api.quickbase.com/v1"


def _cfg():
    return {
        "realm": os.environ.get("QUICKBASE_REALM", ""),
        "token": os.environ.get("QUICKBASE_USER_TOKEN", ""),
        "table": os.environ.get("QUICKBASE_TABLE_ID", ""),
        "f_phone": os.environ.get("QUICKBASE_FIELD_PHONE", ""),
        "f_name": os.environ.get("QUICKBASE_FIELD_NAME", ""),
        "f_email": os.environ.get("QUICKBASE_FIELD_EMAIL", ""),
    }


def is_configured() -> bool:
    c = _cfg()
    return all([c["realm"], c["token"], c["table"], c["f_phone"], c["f_name"], c["f_email"]])


def _digits(value: str) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _fmt_phone(value: str) -> str:
    """Normalize to Quickbase's stored format: (XXX) XXX-XXXX."""
    d = _digits(value)
    if len(d) == 11 and d.startswith("1"):
        d = d[1:]
    if len(d) != 10:
        return ""
    return f"({d[0:3]}) {d[3:6]}-{d[6:]}"


def _headers(c):
    return {
        "QB-Realm-Hostname": c["realm"],
        "Authorization": f"QB-USER-TOKEN {c['token']}",
        "Content-Type": "application/json",
        "User-Agent": "LemonPros/1.0",
    }


def lookup_by_phone(phone: str) -> dict | None:
    """Return {"name","email","phone"} for the first matching Quickbase record,
    or None if not configured / not found / on error. Read-only."""
    if not is_configured():
        return None
    c = _cfg()
    formatted = _fmt_phone(phone)
    if not formatted:
        return None
    fp, fn, fe = int(c["f_phone"]), int(c["f_name"]), int(c["f_email"])
    # Exact match on the phone field, then fall back to a "contains last-7-digits"
    # search in case of odd formatting.
    d = _digits(phone)[-10:]
    where_clauses = [f"{{{fp}.EX.'{formatted}'}}"]
    if len(d) == 10:
        where_clauses.append(f"{{{fp}.CT.'{d[3:6]}-{d[6:]}'}}")
    for where in where_clauses:
        try:
            r = requests.post(
                f"{_API}/records/query",
                headers=_headers(c),
                json={"from": c["table"], "select": [fn, fp, fe], "where": where, "options": {"top": 1}},
                timeout=12,
            )
            if r.status_code != 200:
                logger.warning("Quickbase query %s -> %s %s", where, r.status_code, r.text[:200])
                continue
            data = (r.json() or {}).get("data", [])
            if data:
                rec = data[0]
                return {
                    "name": (rec.get(str(fn), {}) or {}).get("value") or "",
                    "phone": (rec.get(str(fp), {}) or {}).get("value") or "",
                    "email": (rec.get(str(fe), {}) or {}).get("value") or "",
                }
        except Exception as e:
            logger.warning("Quickbase lookup error: %s", e)
    return None
