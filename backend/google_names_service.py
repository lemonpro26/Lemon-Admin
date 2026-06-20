"""Fetch campaign / ad-group names from the Google Ads API (REST) so the admin
dashboard can show real names instead of numeric IDs.

Everything is driven by environment variables; if any are missing the module
reports "not configured" and the caller falls back to showing raw IDs.
"""
import os
import logging
import requests

logger = logging.getLogger("server")

_TOKEN_URL = "https://oauth2.googleapis.com/token"


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

    # Ad creatives — label by ad id with a readable fallback.
    try:
        for row in _search(c, token,
                           "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name FROM ad_group_ad "
                           "WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' "
                           "AND campaign.status = 'ENABLED'"):
            adobj = row.get("adGroupAd", {}).get("ad", {})
            if adobj.get("id"):
                ad[str(adobj["id"])] = adobj.get("name") or f"Ad {adobj['id']}"
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

