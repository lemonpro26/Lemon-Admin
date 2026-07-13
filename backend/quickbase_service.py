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


_PHONE_FIELDS_CACHE: dict[str, list[int]] = {}


def _phone_field_ids(c) -> list[int]:
    """All phone-type field IDs in the table (e.g. primary + "Alt Phone Number"),
    so a client is matched even when the number is stored on a secondary field.
    Discovered via the Quickbase fields API and cached ONLY on success (a failed
    discovery must not permanently strand us on the primary field). Always
    includes the configured primary phone field as a fallback."""
    primary = int(c["f_phone"])
    table = c["table"]
    if _PHONE_FIELDS_CACHE.get(table):
        return _PHONE_FIELDS_CACHE[table]
    ids = [primary]
    discovered = False
    try:
        r = requests.get(
            f"{_API}/fields",
            params={"tableId": table},
            headers={k: v for k, v in _headers(c).items() if k != "Content-Type"},
            timeout=12,
        )
        if r.status_code == 200:
            found = [f["id"] for f in (r.json() or []) if f.get("fieldType") == "phone"]
            if found:
                ids = found if primary in found else [primary, *found]
                discovered = True
                logger.info("Quickbase phone fields discovered: %s", ids)
        else:
            logger.warning("Quickbase fields query -> %s %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("Quickbase fields lookup error: %s", e)
    if discovered:
        _PHONE_FIELDS_CACHE[table] = ids  # cache only a successful discovery
    else:
        logger.warning("Quickbase phone-field discovery failed; using primary %s only", primary)
    return ids


def lookup_by_phone(phone: str) -> dict | None:
    """Return {"name","email","phone"} for the first matching Quickbase record,
    or None if not configured / not found / on error. Read-only. Searches ALL
    phone fields (primary + alternate numbers)."""
    if not is_configured():
        return None
    c = _cfg()
    formatted = _fmt_phone(phone)
    if not formatted:
        return None
    fp, fn, fe = int(c["f_phone"]), int(c["f_name"]), int(c["f_email"])
    phone_fields = _phone_field_ids(c)
    # Exact match on any phone field, then fall back to a "contains last-7-digits"
    # search across all phone fields in case of odd formatting.
    d = _digits(phone)[-10:]
    where_clauses = ["OR".join(f"{{{pf}.EX.'{formatted}'}}" for pf in phone_fields)]
    if len(d) == 10:
        last7 = f"{d[3:6]}-{d[6:]}"
        where_clauses.append("OR".join(f"{{{pf}.CT.'{last7}'}}" for pf in phone_fields))
    select = list(dict.fromkeys([3, fn, fe, *phone_fields]))
    candidates: dict = {}  # record id -> {name, phone, email}
    for where in where_clauses:
        try:
            r = requests.post(
                f"{_API}/records/query",
                headers=_headers(c),
                json={"from": c["table"], "select": select, "where": where, "options": {"top": 25}},
                timeout=12,
            )
            if r.status_code != 200:
                logger.warning("Quickbase query %s -> %s %s", where, r.status_code, r.text[:200])
                continue
            for rec in (r.json() or {}).get("data", []):
                rid = (rec.get("3", {}) or {}).get("value")
                if rid in candidates:
                    continue
                phone_val = ""
                for pf in phone_fields:
                    phone_val = (rec.get(str(pf), {}) or {}).get("value") or phone_val
                    if phone_val:
                        break
                candidates[rid] = {
                    "name": ((rec.get(str(fn), {}) or {}).get("value") or "").strip(),
                    "phone": phone_val,
                    "email": (rec.get(str(fe), {}) or {}).get("value") or "",
                }
            # Once the exact-match clause returns candidates, no need for the
            # looser contains fallback.
            if candidates:
                break
        except Exception as e:
            logger.warning("Quickbase lookup error: %s", e)
    return _best_match(list(candidates.values()))


def _best_match(cands: list) -> dict | None:
    """Pick the best record when a phone number matches several Quickbase records.
    A real person's record beats a junk / "(Duplicate)" record (which often just
    holds a city like "SANTA ROSA CA"). Prefers: not-a-duplicate > has email >
    a proper mixed-case name."""
    def score(rec):
        name = rec.get("name") or ""
        if not name:
            return -1
        s = 0
        if "duplicate" not in name.lower():
            s += 1000
        if rec.get("email"):
            s += 100
        if name != name.upper():  # has lowercase -> looks like a real name, not a CITY
            s += 10
        return s
    named = [c for c in cands if c.get("name")]
    if not named:
        return None
    return max(named, key=score)
