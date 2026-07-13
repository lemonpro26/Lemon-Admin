"""Fetch campaign / ad-group names from the Google Ads API (REST) so the admin
dashboard can show real names instead of numeric IDs.

Everything is driven by environment variables; if any are missing the module
reports "not configured" and the caller falls back to showing raw IDs.
"""
import os
import logging
import re
import requests

logger = logging.getLogger("server")

_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Google Ads ad-customizer / location macros embedded in RSA headlines, e.g.
# {LOCATION(City):California} -> California, {Keyword:Lemon Law Help} -> Lemon Law Help,
# {LOCATION(City)} -> "" (no default, dropped). Cleans headlines into readable text.
_MACRO_RE = re.compile(r"\{([^}]*)\}")


def _clean_macros(text: str) -> str:
    def repl(m):
        inner = m.group(1)
        if ":" in inner:
            return inner.split(":", 1)[1].strip()
        return ""
    return _MACRO_RE.sub(repl, text or "").strip()


def _build_ad_label(adobj: dict) -> str:
    """Build a human-readable label for an ad. Uses the ad's own name when set
    (Demand Gen / image ads), otherwise the first responsive-search-ad headlines
    (macros cleaned), falling back to a type label or the raw id."""
    aid = adobj.get("id")
    name = (adobj.get("name") or "").strip()
    if name:
        return name
    rsa = adobj.get("responsiveSearchAd") or {}
    heads = [_clean_macros(h.get("text")) for h in (rsa.get("headlines") or [])]
    heads = [h for h in heads if h]
    if heads:
        label = " | ".join(heads[:2])
        return (label[:67] + "…") if len(label) > 70 else label
    atype = (adobj.get("type") or "").replace("_", " ").title().strip()
    return f"{atype} {aid}".strip() if atype else f"Ad {aid}"


def _cfg():
    return {
        "developer_token": os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", ""),
        "client_id": os.environ.get("GOOGLE_ADS_CLIENT_ID", ""),
        "client_secret": os.environ.get("GOOGLE_ADS_CLIENT_SECRET", ""),
        "refresh_token": os.environ.get("GOOGLE_ADS_REFRESH_TOKEN", ""),
        "customer_id": os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "").replace("-", ""),
        "login_customer_id": os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "").replace("-", ""),
        "version": os.environ.get("GOOGLE_ADS_API_VERSION", "v21"),
    }


def is_configured() -> bool:
    c = _cfg()
    return all([c["developer_token"], c["client_id"], c["client_secret"],
                c["refresh_token"], c["customer_id"]])


def check_connection() -> dict:
    """Verify the OAuth refresh token can still mint an access token. Used by the
    admin dashboard to warn early if Google Ads has disconnected (token revoked
    or expired) instead of failing with a raw error later."""
    if not is_configured():
        return {"connected": False, "configured": False, "reason": "not_configured"}
    try:
        _access_token(_cfg())
        return {"connected": True, "configured": True, "reason": ""}
    except requests.HTTPError as e:
        body = ""
        status = None
        try:
            body = e.response.text or ""
            status = e.response.status_code
        except Exception:
            pass
        # Only a genuine OAuth auth failure means the token is actually dead.
        # 5xx / transient errors must NOT raise a false "disconnected" alarm.
        is_auth_failure = (
            status in (400, 401, 403)
            or "invalid_grant" in body
            or "invalid_client" in body
            or "unauthorized" in body
        )
        if is_auth_failure:
            reason = "invalid_grant" if "invalid_grant" in body else "auth_error"
            logger.warning("Google Ads connection check failed (auth): %s", body[:200])
            return {"connected": False, "configured": True, "reason": reason}
        logger.warning("Google Ads connection check transient error (%s): %s", status, body[:200])
        return {"connected": True, "configured": True, "reason": "transient"}
    except Exception as e:
        # Network blip / timeout — fail OPEN so a momentary hiccup never shows the banner.
        logger.warning("Google Ads connection check transient error: %s", e)
        return {"connected": True, "configured": True, "reason": "transient"}


def _access_token(c) -> str:
    resp = requests.post(_TOKEN_URL, data={
        "client_id": c["client_id"],
        "client_secret": c["client_secret"],
        "refresh_token": c["refresh_token"],
        "grant_type": "refresh_token",
    }, timeout=20)
    resp.raise_for_status()
    return resp.json()["access_token"]


def _search(c, token, query):
    url = f"https://googleads.googleapis.com/{c['version']}/customers/{c['customer_id']}/googleAds:search"
    headers = {
        "Authorization": f"Bearer {token}",
        "developer-token": c["developer_token"],
        "Content-Type": "application/json",
    }
    if c["login_customer_id"]:
        headers["login-customer-id"] = c["login_customer_id"]
    rows, page_token = [], None
    while True:
        body = {"query": query}
        if page_token:
            body["pageToken"] = page_token
        r = requests.post(url, headers=headers, json=body, timeout=30)
        r.raise_for_status()
        data = r.json()
        rows.extend(data.get("results", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return rows


def fetch_spend_by_day(start: str, end: str) -> dict:
    """Return real Google Ads account spend for a date range:
    {"total": float, "by_day": [{"date": "YYYY-MM-DD", "cost": float}], "currency": str}.
    Dates are 'YYYY-MM-DD'. Returns zeros if not configured / on error."""
    empty = {"total": 0.0, "by_day": [], "currency": "USD"}
    if not is_configured():
        return empty
    c = _cfg()
    try:
        token = _access_token(c)
        q = (f"SELECT segments.date, metrics.cost_micros, customer.currency_code "
             f"FROM customer WHERE segments.date BETWEEN '{start}' AND '{end}' "
             f"ORDER BY segments.date")
        rows = _search(c, token, q)
        by_day, total, currency = [], 0, "USD"
        for r in rows:
            micros = int(r.get("metrics", {}).get("costMicros", 0) or 0)
            date = r.get("segments", {}).get("date", "")
            currency = r.get("customer", {}).get("currencyCode", currency)
            total += micros
            by_day.append({"date": date, "cost": round(micros / 1_000_000, 2)})
        return {"total": round(total / 1_000_000, 2), "by_day": by_day, "currency": currency}
    except Exception as e:
        logger.info("Google spend fetch failed: %s", e)
        return empty

def fetch_spend_by_campaign(start: str, end: str) -> dict:
    """Return {campaign_id(str): cost_float} aggregated over the date range.
    Returns {} if not configured / on error."""
    if not is_configured():
        return {}
    c = _cfg()
    try:
        token = _access_token(c)
        q = (f"SELECT campaign.id, metrics.cost_micros FROM campaign "
             f"WHERE segments.date BETWEEN '{start}' AND '{end}'")
        rows = _search(c, token, q)
        out = {}
        for r in rows:
            cid = str(r.get("campaign", {}).get("id", "") or "")
            micros = int(r.get("metrics", {}).get("costMicros", 0) or 0)
            if cid:
                out[cid] = out.get(cid, 0) + micros
        return {k: round(v / 1_000_000, 2) for k, v in out.items()}
    except Exception as e:
        logger.info("Google per-campaign spend fetch failed: %s", e)
        return {}





def fetch_names() -> dict:
    """Return {"campaign": {id: name}, "adgroup": {id: name}, "ad": {id: name},
    "sitelink": {id: link_text}, "campaign_type": {id: channel_type},
    "live_campaigns": [ids], "live_adgroups": [ids]}.
    Only ENABLED (live / serving) campaigns & ad groups are returned, so the
    admin analytics can hide paused / removed campaigns.
    Covers ALL campaign types (Search, Performance Max, Demand Gen, Display, etc.)."""
    c = _cfg()
    if not is_configured():
        raise RuntimeError("Google Ads API is not configured")
    token = _access_token(c)
    campaign, adgroup, ad, sitelink, campaign_type = {}, {}, {}, {}, {}
    live_campaigns, live_adgroups = [], []

    # Only ENABLED campaigns = currently live / serving.
    for row in _search(c, token,
                       "SELECT campaign.id, campaign.name, campaign.advertising_channel_type "
                       "FROM campaign WHERE campaign.status = 'ENABLED'"):
        camp = row.get("campaign", {})
        if camp.get("id"):
            cid = str(camp["id"])
            campaign[cid] = camp.get("name", "")
            campaign_type[cid] = camp.get("advertisingChannelType", "")
            live_campaigns.append(cid)

    # Only ENABLED ad groups inside ENABLED campaigns.
    for row in _search(c, token,
                       "SELECT ad_group.id, ad_group.name FROM ad_group "
                       "WHERE ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'"):
        ag = row.get("adGroup", {})
        if ag.get("id"):
            agid = str(ag["id"])
            adgroup[agid] = ag.get("name", "")
            live_adgroups.append(agid)

    # Ad creatives — build a readable label from the ad name or its RSA headlines.
    try:
        for row in _search(c, token,
                           "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, "
                           "ad_group_ad.ad.responsive_search_ad.headlines FROM ad_group_ad "
                           "WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' "
                           "AND campaign.status = 'ENABLED'"):
            adobj = row.get("adGroupAd", {}).get("ad", {})
            if adobj.get("id"):
                ad[str(adobj["id"])] = _build_ad_label(adobj)
    except Exception as e:
        logger.info("Ad-name fetch skipped: %s", e)

    # Sitelink assets — link text keyed by asset id (matches {extensionid}).
    try:
        for row in _search(c, token,
                           "SELECT asset.id, asset.sitelink_asset.link_text FROM asset WHERE asset.type = 'SITELINK'"):
            asset = row.get("asset", {})
            if asset.get("id"):
                txt = (asset.get("sitelinkAsset", {}) or {}).get("linkText", "")
                sitelink[str(asset["id"])] = txt or f"Sitelink {asset['id']}"
    except Exception as e:
        logger.info("Sitelink-name fetch skipped: %s", e)

    return {"campaign": campaign, "adgroup": adgroup, "ad": ad,
            "sitelink": sitelink, "campaign_type": campaign_type,
            "live_campaigns": live_campaigns, "live_adgroups": live_adgroups}


def _account_timezone(c, token) -> str:
    """The Google Ads account's reporting timezone (e.g. America/Los_Angeles).
    call_view times are returned in this tz with NO offset, so we need it to
    convert them to UTC before matching against our stored calls."""
    try:
        rows = _search(c, token, "SELECT customer.time_zone FROM customer LIMIT 1")
        if rows:
            return (rows[0].get("customer", {}) or {}).get("timeZone", "") or ""
    except Exception as e:
        logger.info("Could not read account time zone: %s", e)
    return ""


def fetch_gclid_campaigns(start_date: str, end_date: str) -> dict:
    """Map each gclid seen in the account to its campaign, using the click_view
    report (which DOES expose the full gclid). This gives an EXACT call→campaign
    attribution for ad calls that carry a gclid, with no fuzzy matching.
    click_view only allows single-day queries, so we iterate day by day (Google
    keeps click_view data for ~90 days). Returns {gclid: {campaign_id, campaign_name}}."""
    from datetime import datetime as _dt, timedelta as _td
    c = _cfg()
    if not is_configured():
        raise RuntimeError("Google Ads API is not configured")
    token = _access_token(c)
    try:
        d0 = _dt.strptime(start_date, "%Y-%m-%d").date()
        d1 = _dt.strptime(end_date, "%Y-%m-%d").date()
    except Exception:
        return {}
    # click_view data is only retained ~90 days; don't ask for older.
    from datetime import date as _date
    earliest = _date.today() - _td(days=90)
    if d0 < earliest:
        d0 = earliest
    out = {}
    day = d0
    while day <= d1:
        ds = day.strftime("%Y-%m-%d")
        try:
            q = ("SELECT click_view.gclid, campaign.id, campaign.name "
                 f"FROM click_view WHERE segments.date = '{ds}'")
            for row in _search(c, token, q):
                gclid = (row.get("clickView", {}) or {}).get("gclid") or ""
                camp = row.get("campaign", {}) or {}
                if gclid and camp.get("id"):
                    out[gclid] = {"campaign_id": str(camp["id"]), "campaign_name": camp.get("name") or ""}
        except Exception as e:
            logger.info("click_view fetch %s skipped: %s", ds, e)
        day += _td(days=1)
    return out


def fetch_call_views(start_date: str, end_date: str) -> list:
    """Pull Google Ads call details (call_view) since start_date (YYYY-MM-DD).
    Returns a list of dicts with the caller's area/country code, duration, start
    time (converted to a UTC ISO string), call type (CALL_TRACKED / DIRECT_CALL /
    MANUALLY_DIALED / HIGH_END_MOBILE_SEARCH), status, and the campaign that drove
    the call. Google does NOT expose the full caller number here — only the area
    code — so callers match these to CTM calls on area code + time + duration.
    NOTE: call_view does not support segments.date, so we filter on
    call_view.start_call_date_time; Google returns that time in the ACCOUNT
    timezone with no offset, so we convert it to UTC here.
    """
    from datetime import datetime as _dt, timezone as _tz
    try:
        from zoneinfo import ZoneInfo
    except Exception:
        ZoneInfo = None

    c = _cfg()
    if not is_configured():
        raise RuntimeError("Google Ads API is not configured")
    token = _access_token(c)
    acct_tz = _account_timezone(c, token)
    tzinfo = None
    if acct_tz and ZoneInfo is not None:
        try:
            tzinfo = ZoneInfo(acct_tz)
        except Exception:
            tzinfo = None

    def _to_utc_iso(raw: str) -> str:
        if not raw:
            return ""
        try:
            naive = _dt.strptime(raw.strip(), "%Y-%m-%d %H:%M:%S")
        except Exception:
            return raw
        aware = naive.replace(tzinfo=tzinfo or _tz.utc)
        return aware.astimezone(_tz.utc).isoformat()

    query = (
        "SELECT call_view.caller_area_code, call_view.caller_country_code, "
        "call_view.call_duration_seconds, call_view.start_call_date_time, "
        "call_view.end_call_date_time, call_view.type, call_view.call_status, "
        "campaign.id, campaign.name "
        f"FROM call_view WHERE call_view.start_call_date_time >= '{start_date} 00:00:00'"
    )
    out = []
    for row in _search(c, token, query):
        cv = row.get("callView", {}) or {}
        camp = row.get("campaign", {}) or {}
        raw_start = cv.get("startCallDateTime") or ""
        out.append({
            "caller_area_code": str(cv.get("callerAreaCode") or ""),
            "caller_country_code": str(cv.get("callerCountryCode") or ""),
            "duration": int(cv.get("callDurationSeconds") or 0),
            "start_call_date_time": _to_utc_iso(raw_start),
            "start_call_local": raw_start,
            "type": cv.get("type") or "",
            "status": cv.get("callStatus") or "",
            "campaign_id": str(camp.get("id") or ""),
            "campaign_name": camp.get("name") or "",
        })
    return out


def fetch_sitelink_metrics(start_date: str, end_date: str, campaign_ids=None) -> list:
    """Real sitelink (asset) performance pulled straight from Google Ads for the
    given date range (YYYY-MM-DD). Returns a list of
    {sitelink_id, link_text, clicks, impressions, conversions} aggregated per asset.
    When campaign_ids is provided, only those campaigns are counted (so the totals
    reflect THIS landing page's campaigns, not unrelated/historic ones)."""
    c = _cfg()
    if not is_configured():
        raise RuntimeError("Google Ads API is not configured")
    token = _access_token(c)
    where = [
        "campaign_asset.field_type = 'SITELINK'",
        f"segments.date BETWEEN '{start_date}' AND '{end_date}'",
    ]
    ids = [str(x) for x in (campaign_ids or []) if str(x).strip()]
    if ids:
        where.append("campaign.id IN (" + ", ".join(ids) + ")")
    query = (
        "SELECT campaign.id, asset.id, asset.sitelink_asset.link_text, "
        "metrics.clicks, metrics.impressions, metrics.conversions "
        "FROM campaign_asset WHERE " + " AND ".join(where)
    )
    out = {}
    for row in _search(c, token, query):
        asset = row.get("asset", {})
        aid = str(asset.get("id") or "")
        if not aid:
            continue
        m = row.get("metrics", {})
        rec = out.setdefault(aid, {
            "sitelink_id": aid,
            "link_text": (asset.get("sitelinkAsset", {}) or {}).get("linkText", "") or f"Sitelink {aid}",
            "clicks": 0, "impressions": 0, "conversions": 0.0,
        })
        rec["clicks"] += int(m.get("clicks", 0) or 0)
        rec["impressions"] += int(m.get("impressions", 0) or 0)
        rec["conversions"] += float(m.get("conversions", 0) or 0)
    return sorted(out.values(), key=lambda r: r["clicks"], reverse=True)

