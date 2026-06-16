"""Media-buying metrics generator (Innovative-Metrics style) — Google Ads only.

Generates deterministic, realistic-looking demo data so the dashboard is fully
populated before the campaigns launch / real Google Ads reporting is wired in.
Numbers are seeded by the date range so they stay stable for a given range.

REAL-DATA WIRING: build_metrics() accepts `real_dims` and `real_geo` so actual
leads + revenue from the database (and, later, real Google Ads spend/impressions)
can be folded into the corresponding rows. Until launch this stays mostly mock.
"""
import random
from datetime import datetime, timezone, timedelta

PAYOUT_PER_LEAD = (45.0, 130.0)  # mock revenue range per converted lead

GEO = [
    ("California", "Los Angeles"), ("California", "San Diego"), ("Texas", "Houston"),
    ("Texas", "Dallas"), ("Florida", "Miami"), ("Florida", "Orlando"),
    ("New York", "New York"), ("Illinois", "Chicago"), ("Arizona", "Phoenix"),
    ("Georgia", "Atlanta"), ("Nevada", "Las Vegas"), ("Washington", "Seattle"),
    ("Ohio", "Columbus"), ("Pennsylvania", "Philadelphia"), ("North Carolina", "Charlotte"),
    ("Colorado", "Denver"),
]

# Google Ads only (per request: remove all other networks/sources).
SOURCES = ["Google Ads"]
GROUPS = ["Broken Spring", "Off Track", "Won't Open / Close", "New Installation",
          "Noisy Door", "Emergency Repair"]
CAMPAIGNS = ["Garage Repair - West", "Garage Repair - South", "Garage Install - National",
             "Emergency 24/7", "Brand"]
ADGROUPS = ["Emergency Repair", "Broken Spring", "Off Track", "Opener Repair",
            "New Installation", "Spring Replacement"]
SITES = ["opensesame-la.com", "opensesame-tx.com", "opensesame-fl.com", "opensesamegaragedoors.com"]
DEVICES = ["Mobile", "Desktop", "Tablet"]

# Referring domains where the traffic comes from (Google Ads ecosystem + organic/social).
REFERRERS = [
    "google.com", "googleads.g.doubleclick.net", "syndicatedsearch.goog",
    "m.google.com", "bing.com", "duckduckgo.com", "yahoo.com",
    "facebook.com", "direct / none",
]

# Operating systems the traffic is coming from.
OPERATING_SYSTEMS = ["Android", "iOS", "Windows", "macOS", "Linux", "Chrome OS", "Other"]


def _hour_label(h: int) -> str:
    ampm = "AM" if h < 12 else "PM"
    hr = h % 12 or 12
    return f"{hr} {ampm}"


def _traffic_row(rng: random.Random, name: str, clicks_lo: int, clicks_hi: int,
                 extra: dict | None = None, real_leads: int = 0):
    """Row for the traffic-style breakdowns (referrer / OS / hour):
    columns are clicks, leads, conv% and bounce rate."""
    clicks = rng.randint(clicks_lo, clicks_hi)
    conv = rng.uniform(0.02, 0.09)
    leads = max(0, int(round(clicks * conv))) + int(real_leads or 0)
    bounce = round(rng.uniform(38.0, 86.0), 2)
    row = {
        "name": name,
        "clicks": clicks,
        "leads": leads,
        "conv": round((leads / clicks * 100), 2) if clicks else 0.0,
        "bounce": bounce,
    }
    if extra:
        row.update(extra)
    return row


def _seed(date_str: str) -> random.Random:
    return random.Random(f"osgd-{date_str}")


def _row(rng: random.Random, name: str, base_imp_lo: int, base_imp_hi: int, extra: dict | None = None):
    imp = rng.randint(base_imp_lo, base_imp_hi)
    conv = rng.uniform(0.018, 0.085)
    actions = max(0, int(round(imp * conv)))
    cpc = round(rng.uniform(1.1, 4.6), 2)
    spend = round(imp * cpc, 2)
    payout = round(rng.uniform(*PAYOUT_PER_LEAD), 2)
    revenue = round(actions * payout, 2)
    cpa = round(spend / actions, 2) if actions else 0.0
    profit = round(revenue - spend, 2)
    roas = round(revenue / spend, 2) if spend else 0.0
    bounce = round(rng.uniform(70.0, 99.0), 2)
    row = {
        "name": name, "imp": imp, "actions": actions,
        "conv": round((actions / imp * 100), 2) if imp else 0.0,
        "cpc": cpc, "spend": spend, "cpa": cpa,
        "revenue": revenue, "profit": profit, "roas": roas, "bounce": bounce,
    }
    if extra:
        row.update(extra)
    return row


def _fold_real(rows, real_map):
    """Add real {name: {'actions': n, 'revenue': r}} onto matching mock rows."""
    if not real_map:
        return rows
    by_name = {r["name"]: r for r in rows}
    for name, vals in real_map.items():
        r = by_name.get(name)
        if not r:
            r = _blank_row(name)
            rows.append(r)
            by_name[name] = r
        r["actions"] += int(vals.get("actions", 0))
        r["revenue"] = round(r["revenue"] + float(vals.get("revenue", 0.0)), 2)
        r["conv"] = round((r["actions"] / r["imp"] * 100), 2) if r["imp"] else 0.0
        r["cpa"] = round(r["spend"] / r["actions"], 2) if r["actions"] else 0.0
        r["profit"] = round(r["revenue"] - r["spend"], 2)
        r["roas"] = round(r["revenue"] / r["spend"], 2) if r["spend"] else 0.0
    return rows


def _blank_row(name):
    return {"name": name, "imp": 0, "actions": 0, "conv": 0.0, "cpc": 0.0,
            "spend": 0.0, "cpa": 0.0, "revenue": 0.0, "profit": 0.0, "roas": 0.0, "bounce": 0.0}


def _dimension(rng, names, lo, hi, real_map=None):
    rows = [_row(rng, n, lo, hi) for n in names]
    rows = _fold_real(rows, real_map)
    rows.sort(key=lambda r: r["revenue"], reverse=True)
    return rows


def _totals(rows):
    imp = sum(r["imp"] for r in rows)
    actions = sum(r["actions"] for r in rows)
    spend = round(sum(r["spend"] for r in rows), 2)
    revenue = round(sum(r["revenue"] for r in rows), 2)
    return {
        "imp": imp, "actions": actions,
        "conv": round((actions / imp * 100), 2) if imp else 0.0,
        "spend": spend, "cpa": round(spend / actions, 2) if actions else 0.0,
        "revenue": revenue, "profit": round(revenue - spend, 2),
        "roas": round(revenue / spend, 2) if spend else 0.0,
        "bounce": round(sum(r["bounce"] for r in rows) / len(rows), 2) if rows else 0.0,
    }


def build_metrics(date_str: str, hook_variants: list[dict], real_geo: dict | None = None,
                  real_dims: dict | None = None, days: int = 1,
                  real_hourly: dict | None = None) -> dict:
    """date_str: seed key (start of range). hook_variants: real hook punches.
    real_geo: {(state,city): leads}. real_dims: {'campaign'|'adgroup'|'source'|'group':
    {name: {'actions': n, 'revenue': r}}}. real_hourly: {hour(0-23): leads}."""
    rng = _seed(date_str)
    real_dims = real_dims or {}
    real_hourly = real_hourly or {}

    sites = _dimension(rng, SITES, 40, 3200)
    source = _dimension(rng, SOURCES, 200, 4000, real_dims.get("source"))
    group = _dimension(rng, GROUPS, 120, 2200, real_dims.get("group"))
    campaign = _dimension(rng, CAMPAIGNS, 150, 3500, real_dims.get("campaign"))
    adgroup = _dimension(rng, ADGROUPS, 100, 2500, real_dims.get("adgroup"))

    # Referrer breakdown — domains the traffic is coming from.
    referrer = [_traffic_row(rng, d, 30, 1400) for d in REFERRERS]
    referrer.sort(key=lambda r: r["clicks"], reverse=True)

    # Device breakdown — operating systems.
    os_device = [_traffic_row(rng, o, 40, 1800) for o in OPERATING_SYSTEMS]
    os_device.sort(key=lambda r: r["clicks"], reverse=True)

    # GEO
    geo_state_map = {}
    geo_city_rows = []
    for state, city in GEO:
        r = _row(rng, city, 50, 1500, extra={"state": state, "city": city})
        if real_geo:
            r["actions"] += real_geo.get((state, city), 0)
        geo_city_rows.append(r)
        st = geo_state_map.setdefault(state, {"name": state, "state": state, "imp": 0, "actions": 0,
                                              "spend": 0.0, "revenue": 0.0, "bounce": []})
        st["imp"] += r["imp"]
        st["actions"] += r["actions"]
        st["spend"] += r["spend"]
        st["revenue"] += r["revenue"]
        st["bounce"].append(r["bounce"])
    geo_state_rows = []
    for st in geo_state_map.values():
        imp, actions = st["imp"], st["actions"]
        spend, revenue = round(st["spend"], 2), round(st["revenue"], 2)
        geo_state_rows.append({
            "name": st["name"], "state": st["state"], "imp": imp, "actions": actions,
            "conv": round((actions / imp * 100), 2) if imp else 0.0,
            "cpc": round(spend / imp, 2) if imp else 0.0, "spend": spend,
            "cpa": round(spend / actions, 2) if actions else 0.0,
            "revenue": revenue, "profit": round(revenue - spend, 2),
            "roas": round(revenue / spend, 2) if spend else 0.0,
            "bounce": round(sum(st["bounce"]) / len(st["bounce"]), 2) if st["bounce"] else 0.0,
        })
    geo_state_rows.sort(key=lambda r: r["revenue"], reverse=True)
    geo_city_rows.sort(key=lambda r: r["revenue"], reverse=True)

    # CSID / hook variants (real punches + mock metrics)
    csid_rows = []
    for hv in hook_variants:
        r = _row(rng, hv.get("source", "Hook"), 60, 1600,
                 extra={"csid": hv["csid"], "punch1": hv["punch1"], "punch2": hv["punch2"],
                        "source": hv.get("source", "")})
        csid_rows.append(r)
    csid_rows.sort(key=lambda r: r["revenue"], reverse=True)

    # TIME — leads per hour of the day (00:00–23:00). Real leads folded in by hour.
    time_rows = []
    for h in range(24):
        time_rows.append(_traffic_row(
            rng, _hour_label(h), 20, 600,
            extra={"hour": h, "label": _hour_label(h)},
            real_leads=int(real_hourly.get(h, 0)),
        ))

    return {
        "is_mock": True,
        "date": date_str,
        "currency": "USD",
        "totals": _totals(source),
        "dimensions": {
            "sites": sites, "source": source, "group": group,
            "campaign": campaign, "adgroup": adgroup,
        },
        "breakdowns": {
            "time": time_rows,
            "geo_state": geo_state_rows,
            "geo_city": geo_city_rows,
            "csid": csid_rows,
            "device": os_device,
            "referrer": referrer,
        },
    }
