"""IP geolocation + {!city}/{!state} token replacement helpers.

Proven in scripts/geo_poc.py (18/18 tests passed).
Uses ip-api.com (free, no API key) with robust fallback to configured defaults.
"""
import re
import ipaddress
import requests

GEO_API = "http://ip-api.com/json/{ip}?fields=status,message,regionName,region,city,query"
TIMEOUT = 4

# Simple in-memory cache: ip -> (city, state)
_CACHE: dict[str, dict] = {}

_TOKEN_RE = re.compile(r"\{!\s*(city|state)\s*\}", re.IGNORECASE)


def resolve_client_ip(headers) -> str | None:
    """Extract the real client IP from common proxy headers."""
    # headers is a Starlette Headers object (case-insensitive) or dict
    def _get(name):
        try:
            return headers.get(name)
        except Exception:
            return None

    xff = _get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    xri = _get("x-real-ip")
    if xri:
        return xri.strip()
    return None


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return not (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_unspecified
        )
    except ValueError:
        return False


def lookup_geo(ip: str | None, default_city: str, default_state: str) -> dict:
    """Return {'city', 'state', 'source', 'ip'} using ip-api with safe fallback."""
    fallback = {"city": default_city, "state": default_state, "source": "fallback", "ip": ip}
    if not ip or not _is_public_ip(ip):
        return fallback

    if ip in _CACHE:
        cached = dict(_CACHE[ip])
        cached["ip"] = ip
        return cached

    try:
        resp = requests.get(GEO_API.format(ip=ip), timeout=TIMEOUT)
        data = resp.json()
        if data.get("status") == "success":
            result = {
                "city": data.get("city") or default_city,
                "state": data.get("regionName") or default_state,
                "source": "ip-api",
                "ip": ip,
            }
            _CACHE[ip] = {"city": result["city"], "state": result["state"], "source": "ip-api"}
            return result
    except Exception:
        pass
    return fallback


_CITY_RE = re.compile(r"\{!\s*city\s*\}", re.IGNORECASE)
_STATE_RE = re.compile(r"\{!\s*state\s*\}", re.IGNORECASE)


def render_tokens(text: str, city: str, state: str) -> str:
    """Replace {!city} and {!state} tokens (case/space tolerant).

    When a value is unknown (empty), the token is removed cleanly along with an
    adjacent comma/whitespace so the sentence still reads naturally instead of
    showing an empty fallback. e.g.
        "See if your {!city}, {!state} home qualifies"  (no geo)
        -> "See if your home qualifies"
    """
    if not text:
        return text or ""

    res = text
    # City
    if city:
        res = _CITY_RE.sub(city, res)
    else:
        # remove token (+ optional comma) and the single following space,
        # then any leftover token preceded by a space.
        res = re.sub(r"\{!\s*city\s*\},?\s", "", res, flags=re.IGNORECASE)
        res = re.sub(r"\s?\{!\s*city\s*\}", "", res, flags=re.IGNORECASE)
    # State
    if state:
        res = _STATE_RE.sub(state, res)
    else:
        res = re.sub(r"\{!\s*state\s*\},?\s", "", res, flags=re.IGNORECASE)
        res = re.sub(r"\s?\{!\s*state\s*\}", "", res, flags=re.IGNORECASE)

    # Tidy up leftover artifacts from removed tokens.
    res = re.sub(r"\s+([.,!?])", r"\1", res)   # space before punctuation
    res = re.sub(r"\s{2,}", " ", res)           # collapse multiple spaces
    res = res.strip()
    res = re.sub(r"^[,\s]+", "", res)            # leading commas/space
    res = re.sub(r"[,\s]+$", "", res)            # trailing commas/space
    return res.strip()
