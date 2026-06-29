from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import secrets
import random
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
import uuid
import jwt
import requests
from datetime import datetime, timezone, timedelta

from geo import resolve_client_ip, lookup_geo, render_tokens
from metrics_mock import build_metrics
import google_ads_service as gads
import datamanager_service as dm
import google_names_service as gnames
from email_service import (
    send_email,
    build_internal_notification_html,
    build_thank_you_html,
    build_contact_html,
    DEFAULT_THANK_YOU_BODY,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'lemonpros2026')
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24

# --- Bot / crawler detection ----------------------------------------------
# Real Google Ads *paid* clicks always carry a gclid (or wbraid/gbraid). The
# biggest source of phantom clicks is AdsBot-Google, which crawls the landing
# page of every ENABLED campaign (even ones not serving today) to check ad
# quality — these hits carry the campaign's tg_ref but NO gclid. We drop known
# bots at ingestion and can purge any that slipped through.
import re as _re
from contextvars import ContextVar

# Client timezone offset (minutes, JS getTimezoneOffset semantics: UTC = local + offset).
# Set per-request by middleware so _date_range() buckets by the user's LOCAL day.
_request_tz_offset: ContextVar[int] = ContextVar("_request_tz_offset", default=0)
_BOT_UA_RE = _re.compile(
    r"(adsbot|googlebot|google-inspectiontool|apis-google|mediapartners|bingbot|"
    r"slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebookexternalhit|"
    r"facebot|twitterbot|linkedinbot|embedly|quora link|pinterest|slackbot|"
    r"vkshare|w3c_validator|redditbot|applebot|semrushbot|ahrefsbot|mj12bot|"
    r"dotbot|petalbot|bytespider|gptbot|ccbot|claudebot|anthropic|perplexity|"
    r"headlesschrome|phantomjs|puppeteer|playwright|python-requests|python-urllib|"
    r"curl/|wget/|go-http-client|java/|okhttp|axios|node-fetch|libwww|scrapy|"
    r"uptimerobot|pingdom|lighthouse|statuscake|datadog|newrelic|bot\b|spider|"
    r"crawler|crawl|monitoring|preview)",
    _re.IGNORECASE,
)


def is_bot_ua(ua: str) -> bool:
    return bool(ua and _BOT_UA_RE.search(ua))

# Where the website Contact form is forwarded.
CONTACT_FORWARD_EMAIL = os.environ.get('CONTACT_FORWARD_EMAIL', 'info@lemonpros.com')

# Optional CRM webhook — leads are POSTed here as JSON when a URL is configured.
CRM_WEBHOOK_URL = os.environ.get('CRM_WEBHOOK_URL', '')

CALLS_WEBHOOK_TOKEN = os.environ.get('CALLS_WEBHOOK_TOKEN', '')

# Auto-upload qualified inbound calls to Google Ads as offline call conversions.
GOOGLE_ADS_CALL_CONVERSION_ACTION_ID = os.environ.get('GOOGLE_ADS_CALL_CONVERSION_ACTION_ID', '')
try:
    MIN_CALL_CONVERSION_SECONDS = int(os.environ.get('MIN_CALL_CONVERSION_SECONDS', '60'))
except Exception:
    MIN_CALL_CONVERSION_SECONDS = 60

# Referrer substrings whose lead submissions are treated as bot/spam and silently
# dropped (no DB save, no CRM forward, no email). googlesyndication = display-ad bots.
BLOCKED_REFERRER_SUBSTRINGS = ("googlesyndication.com", "doubleclick.net")

# Defaults for the site config (seeded on first run).
# NOTE: no default city/state — when a visitor's location is unknown the
# {!city}/{!state} macros are stripped cleanly instead of showing a fallback.
DEFAULT_CONFIG = {
    "hook1": "Stuck With a Lemon? You May Be Owed Money.",
    "hook2": "Find out in 60 seconds if your defective vehicle qualifies for a refund, replacement, or cash compensation under {!state} Lemon Law — at no cost to you.",
    # Spanish landing page (/sp) hooks
    "hook1_es": "¿Atrapado con un Auto Defectuoso? Podría Tener Derecho a una Compensación.",
    "hook2_es": "Averigüe en 60 segundos si su vehículo defectuoso califica para un reembolso, reemplazo o compensación en efectivo — sin costo alguno para usted.",
    # Email notification settings
    "notification_emails": ["info@lemonpros.com"],
    "notify_team": True,
    "send_thank_you": False,
    # Editable customer thank-you email
    "thank_you_subject": "Thanks for your request — Lemon Pros",
    "thank_you_body": DEFAULT_THANK_YOU_BODY,
    # Landing-page split test (Home `/` vs PA `/pa`)
    "split_test_enabled": False,
    "split_home_pct": 50,
    # User-managed directory of custom page links (built-ins are added client-side)
    "custom_pages": [],
}


# Editable copy for the /pa advertorial page. Admin "PA Page" tab overrides these;
# the public page falls back to these defaults for any missing field.
DEFAULT_PA_CONTENT = {
    "attorney_eyebrow": "Meet Your Attorney",
    "attorney_name": "Michael Saeedian, Esq.",
    "attorney_title": "Founding Attorney · The Lemon Pros · CA State Bar #265470",
    "attorney_award": "National Trial Lawyers — Top 40 Under 40",
    "attorney_bio": (
        "Michael Saeedian is a California Lemon Law attorney that auto manufacturers fear. "
        "A UCLA graduate with a Juris Doctorate from Loyola Law School, he exclusively practices "
        "lemon law — fighting to secure the maximum refund, replacement, or cash settlement for "
        "drivers stuck with defective vehicles. When you submit your case, you work directly with "
        "a licensed, award-winning attorney, not a call center."
    ),
    "attorney_badges": ["Top 100 Trial Lawyers", "5-Star Rated on Yelp", "Lead Counsel Rated", "No Win, No Fee"],
    "attorney_school": "UCLA · J.D., Loyola Law School, Los Angeles",
    "settlements_eyebrow": "Recent Settlements",
    "settlements": [
        {"amount": "$107,500", "label": "Mercedes GLE"},
        {"amount": "$98,000", "label": "Tesla Model Y"},
        {"amount": "$94,500", "label": "Ford F-150"},
        {"amount": "$89,000", "label": "Jeep Grand Cherokee"},
        {"amount": "$85,200", "label": "Chevy Silverado"},
        {"amount": "$79,800", "label": "Hyundai Tucson"},
        {"amount": "$76,500", "label": "Kia Sorento"},
    ],
    "settlements_disclaimer": "Prior results do not guarantee a similar outcome.",
    "settlements_cta": "See If My Car Qualifies",
    "headline": "Stuck With a Defective Vehicle? You May Be Owed a Refund, a New Car, or Cash.",
    "subhead": (
        "Thousands of drivers are stuck making payments on cars that spend more time in the shop "
        "than on the road. Here's how today's Lemon Laws can force the manufacturer to pay you "
        "back — at no cost to you."
    ),
    "body": [
        "If your vehicle has been in the shop again and again for the same problem — and it's still "
        "under the manufacturer's warranty — federal and state Lemon Laws may entitle you to a full "
        "refund, a replacement vehicle, or a substantial cash settlement.",
        "Most consumers have no idea these protections exist. Automakers are required by law to stand "
        "behind their vehicles, and when they can't fix a recurring defect within a reasonable number "
        "of attempts, the burden shifts to them — not you. That can mean getting back everything "
        "you've paid, including your down payment and monthly payments.",
        "We strongly urge any driver dealing with persistent engine, transmission, electrical, braking, "
        "or safety problems to check if they qualify. There is no cost and no obligation to find out, "
        "and the entire process takes less than 60 seconds to start.",
    ],
    "callout_quote": (
        "If your car keeps breaking down under warranty, the manufacturer may be legally required to "
        "buy it back — and you could be owed thousands."
    ),
    "callout_cta": "See If My Car Qualifies",
    "qualify_heading": "How Do I Qualify?",
    "qualify_intro": (
        "The Lemon Pros network has helped countless consumers hold manufacturers accountable. If you "
        "can answer yes to any of the following, you should check your case today:"
    ),
    "qualify_items": [
        "My vehicle has been repaired multiple times for the same issue",
        "The problem started while it was still under the manufacturer warranty",
        "My car has spent weeks in the shop or is unsafe to drive",
        "I'm still making payments on a vehicle I can't rely on",
    ],
    "step1_label": "Select Your Vehicle's Make",
    "step2_label": "Answer a few quick questions",
    "step2_text": (
        "Find out in under 60 seconds if you qualify for a refund, replacement, or cash compensation. "
        "It's free and there's no obligation."
    ),
    "final_cta": "Check If Your Car Qualifies",
}


def _merged_pa_content(cfg: dict) -> dict:
    """Stored pa_content merged over defaults so missing fields always resolve."""
    stored = (cfg or {}).get("pa_content") or {}
    return {**DEFAULT_PA_CONTENT, **stored}


# Editable copy for the Home (`/`) and Spanish (`/sp`) landing pages. The big
# headline/subhead are managed by the Hooks/Spanish tabs (A/B + geo macros);
# these cover the CTA button, tooltip and trust-line badges.
DEFAULT_HOME_CONTENT = {
    "tooltip": "Takes 60 seconds — see if you qualify!",
    "cta": "Check If Your Car Qualifies",
    "rated": "5-Star Rated",
    "free_consult": "100% Free Consultation",
    "no_win_no_fee": "No Win, No Fee",
}
DEFAULT_SP_CONTENT = {
    "tooltip": "Toma 60 segundos — ¡vea si califica!",
    "cta": "Verifique Si Su Auto Califica",
    "rated": "Calificación 5 Estrellas",
    "free_consult": "Consulta 100% Gratis",
    "no_win_no_fee": "Si No Gana, No Paga",
}
PAGE_CONTENT_DEFAULTS = {"home": DEFAULT_HOME_CONTENT, "sp": DEFAULT_SP_CONTENT}


def _merged_page_content(cfg: dict, page: str) -> dict:
    defaults = PAGE_CONTENT_DEFAULTS[page]
    stored = (cfg or {}).get(f"{page}_content") or {}
    return {**defaults, **{k: v for k, v in stored.items() if k in defaults}}

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ----------------------------- Models -----------------------------
class LoginRequest(BaseModel):
    username: Optional[str] = ""
    password: str


class ConfigUpdate(BaseModel):
    hook1: str
    hook2: str


class EmailTemplateBody(BaseModel):
    thank_you_subject: str
    thank_you_body: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "editor"  # editor | view_only


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None


class OwnerCredsUpdate(BaseModel):
    current_password: str
    new_username: Optional[str] = None
    new_password: Optional[str] = None


class MyCredsUpdate(BaseModel):
    current_password: str
    new_username: Optional[str] = None
    new_password: Optional[str] = None


class LeadCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    zip: Optional[str] = ""
    car_year: Optional[str] = ""
    car_make: Optional[str] = ""
    car_model: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    first_name: str
    last_name: str
    email: str
    phone: str
    # Attribution
    session_id: Optional[str] = ""
    campaign_id: Optional[str] = ""
    adgroup_id: Optional[str] = ""
    ad_id: Optional[str] = ""
    keyword: Optional[str] = ""
    gclid: Optional[str] = ""
    gbraid: Optional[str] = ""
    wbraid: Optional[str] = ""
    referrer: Optional[str] = ""
    feeditemid: Optional[str] = ""
    extensionid: Optional[str] = ""
    params: Optional[dict] = None
    source_page: Optional[str] = ""
    split_experiment_id: Optional[str] = ""
    split_variant: Optional[str] = ""


class ClickTrack(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    campaign_id: Optional[str] = ""
    adgroup_id: Optional[str] = ""
    ad_id: Optional[str] = ""
    keyword: Optional[str] = ""
    gclid: Optional[str] = ""
    gbraid: Optional[str] = ""
    wbraid: Optional[str] = ""
    referrer: Optional[str] = ""
    feeditemid: Optional[str] = ""
    extensionid: Optional[str] = ""
    landing_path: Optional[str] = ""
    params: Optional[dict] = None
    source_page: Optional[str] = ""
    split_experiment_id: Optional[str] = ""
    split_variant: Optional[str] = ""


class HookRuleBody(BaseModel):
    label: str
    match_campaign: Optional[str] = ""
    match_adgroup: Optional[str] = ""
    match_ad: Optional[str] = ""
    hook1: str
    hook2: str
    weight: int = 50
    enabled: bool = True
    hidden: bool = False
    lang: Optional[str] = "en"


class NotificationSettings(BaseModel):
    notification_emails: List[str] = []
    notify_team: bool = True
    send_thank_you: bool = True


class TestEmailBody(BaseModel):
    to: str


class ContactBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    email: str
    phone: Optional[str] = ""
    message: str


class AddressVerify(BaseModel):
    address: str
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip: Optional[str] = ""


class PhoneVerify(BaseModel):
    phone: str
    region: Optional[str] = "US"


class EmailVerify(BaseModel):
    email: str


class SaleBody(BaseModel):
    """Marks a lead as sold and triggers the offline conversion upload."""
    value: float
    currency: Optional[str] = "USD"
    sale_datetime: Optional[str] = None  # ISO; defaults to now (UTC)


# ----------------------------- Helpers -----------------------------
def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _date_range(start: str, end: str):
    """Return (start_iso, end_iso, days) covering full LOCAL days for the request's
    timezone (from the client's tz_offset, minutes as per JS getTimezoneOffset).
    created_at values are stored in UTC, so local-day boundaries are converted to
    UTC for the query. Defaults to 'today' in the client's local timezone."""
    offset = _request_tz_offset.get()  # minutes; UTC = local + offset
    delta = timedelta(minutes=offset)
    # "Now" in the client's local wall-clock time.
    local_now = datetime.now(timezone.utc).replace(tzinfo=None) - delta
    today = local_now.date()
    try:
        s = datetime.fromisoformat(start).date() if start else today
    except Exception:
        s = today
    try:
        e = datetime.fromisoformat(end).date() if end else today
    except Exception:
        e = today
    if e < s:
        s, e = e, s
    # Local-day boundaries → UTC instants.
    start_local = datetime(s.year, s.month, s.day, 0, 0, 0)
    end_local = datetime(e.year, e.month, e.day, 23, 59, 59, 999999)
    start_dt = (start_local + delta).replace(tzinfo=timezone.utc)
    end_dt = (end_local + delta).replace(tzinfo=timezone.utc)
    return start_dt.isoformat(), end_dt.isoformat(), (e - s).days + 1


def _hash_pw(pw: str, salt: str = None) -> str:
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100000).hex()
    return f"{salt}${h}"


def _verify_pw(pw: str, stored: str) -> bool:
    try:
        salt, h = (stored or "").split("$", 1)
    except ValueError:
        return False
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100000).hex() == h


def serialize_doc(doc: dict) -> dict:
    """Make a Mongo doc JSON-safe (drop _id, convert datetimes)."""
    if not doc:
        return doc
    clean = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, datetime):
            clean[k] = v.isoformat()
        else:
            clean[k] = v
    return clean


async def get_or_create_config() -> dict:
    cfg = await db.site_config.find_one({"_id": "singleton"})
    if not cfg:
        new_doc = {"_id": "singleton", **DEFAULT_CONFIG, "updated_at": _now_iso()}
        await db.site_config.insert_one(new_doc)
        cfg = new_doc
    else:
        missing = {k: v for k, v in DEFAULT_CONFIG.items() if k not in cfg}
        if missing:
            await db.site_config.update_one({"_id": "singleton"}, {"$set": missing})
            cfg.update(missing)
    return {k: v for k, v in cfg.items() if k != "_id"}


def _weighted_pick(rules: list, seed: str):
    """Deterministically pick one rule from a bucket using each rule's weight as
    its share of serving. Seeded by the visitor's session so they see a stable
    hook across the recorded click, the displayed hook, and the resulting lead
    (this keeps the A/B attribution clean)."""
    rules = sorted(rules, key=lambda r: r.get("id", ""))
    weights = [max(0.0, float(r.get("weight", 50) or 0)) for r in rules]
    rng = random.Random(f"{seed}|" + "|".join(r.get("id", "") for r in rules))
    total = sum(weights)
    if total <= 0:
        return rng.choice(rules)
    pick = rng.uniform(0, total)
    upto = 0.0
    for r, w in zip(rules, weights):
        upto += w
        if pick <= upto:
            return r
    return rules[-1]


async def resolve_hooks(cfg: dict, campaign: str, adgroup: str, ad: str, seed: str = "", lang: str = "en") -> dict:
    """A/B-aware hook resolution. Among the enabled (non-archived) rules for this
    language that match the incoming campaign / ad group / ad, take the most
    specific bucket and choose one variant weighted by its serving %. Falls back
    to the default site config (per language)."""
    lang = "es" if (lang or "en") == "es" else "en"
    rules = await db.hook_rules.find({"enabled": True, "archived": {"$ne": True}}).to_list(length=500)
    rules = [r for r in rules if (r.get("lang") or "en") == lang]
    inc = {
        "match_campaign": (campaign or "").strip(),
        "match_adgroup": (adgroup or "").strip(),
        "match_ad": (ad or "").strip(),
    }

    def matches(r):
        for field, val in inc.items():
            rv = (r.get(field) or "").strip()
            if rv and rv != val:
                return False
        return True

    def specificity(r):
        return sum(1 for f in inc if (r.get(f) or "").strip())

    applicable = [r for r in rules if matches(r)]
    if applicable:
        max_spec = max(specificity(r) for r in applicable)
        bucket = [r for r in applicable if specificity(r) == max_spec]
        chosen = _weighted_pick(bucket, seed)
        return {
            "hook1": chosen["hook1"],
            "hook2": chosen["hook2"],
            "matched_rule": chosen.get("id"),
            "matched_rule_label": chosen.get("label"),
        }
    dh1 = cfg.get("hook1_es", "") if lang == "es" else cfg["hook1"]
    dh2 = cfg.get("hook2_es", "") if lang == "es" else cfg["hook2"]
    return {
        "hook1": dh1,
        "hook2": dh2,
        "matched_rule": None,
        "matched_rule_label": None,
    }


def create_token(username: str, role: str) -> str:
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def require_admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"username": payload.get("sub", "admin"), "role": payload.get("role", "editor")}


def require_editor(user: dict = Depends(require_admin)) -> dict:
    """Block view-only users from any write/change operation."""
    if user.get("role") == "view_only":
        raise HTTPException(status_code=403, detail="View-only access: changes are not allowed.")
    return user


def require_owner(user: dict = Depends(require_admin)) -> dict:
    """Only the master/owner admin can manage owner credentials."""
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only the master admin can do this.")
    return user


# ----------------------------- Activity / audit log -----------------------------
async def _record_activity(username: str, kind: str, action: str, request: Request = None, detail: str = ""):
    """Append a row to the admin activity log (login + change history)."""
    try:
        ip = resolve_client_ip(request.headers) if request else ""
        ua = request.headers.get("user-agent", "") if request else ""
        await db.admin_activity.insert_one({
            "id": str(uuid.uuid4()),
            "username": username or "",
            "kind": kind,            # 'login' | 'change'
            "action": action,        # human-readable label
            "detail": detail,        # e.g. "PUT /admin/hook-rules/123"
            "ip": ip,
            "user_agent": ua,
            "at": _now_iso(),
        })
    except Exception as e:
        logger.warning("activity log failed: %s", e)


def _username_from_request(request: Request) -> str:
    """Best-effort decode of the bearer token to attribute a change to a user."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return ""
    try:
        payload = jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("sub", "")
    except Exception:
        return ""


# Friendly labels for change-history entries, derived from method + path.
_CHANGE_RULES = [
    ("PUT", r"/admin/pa-content$", "Edited PA page content"),
    ("PUT", r"/admin/page-content/[^/]+$", "Edited page content"),
    ("PUT", r"/admin/config$", "Updated settings"),
    ("PUT", r"/admin/spanish$", "Edited Spanish hooks"),
    ("PUT", r"/admin/pages$", "Updated pages directory"),
    ("PUT", r"/admin/owner-credentials$", "Changed master login"),
    ("PUT", r"/admin/my-credentials$", "Changed own login"),
    ("PUT", r"/admin/notifications$", "Updated notifications"),
    ("PUT", r"/admin/email-template$", "Edited email template"),
    ("POST", r"/admin/hook-rules/[^/]+/revise$", "Revised a hook"),
    ("POST", r"/admin/hook-rules/[^/]+/reactivate$", "Reactivated a hook version"),
    ("POST", r"/admin/hook-rules$", "Created a hook"),
    ("PUT", r"/admin/hook-rules/[^/]+$", "Updated a hook"),
    ("DELETE", r"/admin/hook-rules/[^/]+$", "Deleted a hook"),
    ("POST", r"/admin/experiments$", "Created a split test"),
    ("PUT", r"/admin/experiments/[^/]+$", "Updated a split test"),
    ("DELETE", r"/admin/experiments/[^/]+$", "Deleted a split test"),
    ("POST", r"/admin/users$", "Created a team member"),
    ("PUT", r"/admin/users/[^/]+$", "Updated a team member"),
    ("DELETE", r"/admin/users/[^/]+$", "Removed a team member"),
    ("POST", r"/admin/calls/[^/]+/sold$", "Marked a call as sold"),
    ("POST", r"/admin/leads/[^/]+/sold$", "Marked a lead as sold"),
    ("DELETE", r"/admin/calls/[^/]+$", "Deleted a call"),
    ("DELETE", r"/admin/leads/[^/]+$", "Deleted a lead"),
    ("POST", r"/admin/ad-labels$", "Updated ad labels"),
]


def _change_label(method: str, path: str) -> str:
    for m, pat, label in _CHANGE_RULES:
        if m == method and _re.search(pat, path):
            return label
    tail = path.replace("/api/admin/", "").split("?")[0] or "resource"
    return f"{method} {tail}"


async def get_owner_account() -> dict:
    """Custom owner username/password stored in DB (overrides the env default
    once the owner changes their credentials in Settings)."""
    return await db.admin_owner.find_one({"_id": "singleton"}) or {}


# ----------------------------- Public routes -----------------------------
@api_router.get("/")
async def root():
    return {"message": "Lemon Pros API"}


@api_router.get("/config/public")
async def get_public_config(
    request: Request,
    campaign: str = Query("", description="campaign id (tg_ref)"),
    adgroup: str = Query("", description="ad group id"),
    ad: str = Query("", description="ad / creative id (sub2)"),
    session: str = Query("", description="visitor session id (A/B serving seed)"),
    lang: str = Query("", description="language: 'es' for the Spanish page"),
):
    """Return hooks with {!city}/{!state} resolved from visitor IP geolocation.
    When location is unknown the macros are stripped. The serving hook is chosen
    by weighted A/B among matching variants, seeded by the session id. For the
    Spanish page (lang=es) the editable Spanish hooks are returned (no A/B)."""
    cfg = await get_or_create_config()
    ip = resolve_client_ip(request.headers)
    geo = lookup_geo(ip, "", "")
    page_lang = "es" if (lang or "").lower() == "es" else "en"
    resolved = await resolve_hooks(cfg, campaign, adgroup, ad, seed=session, lang=page_lang)
    return {
        "hook1": render_tokens(resolved["hook1"], geo["city"], geo["state"]),
        "hook2": render_tokens(resolved["hook2"], geo["city"], geo["state"]),
        "city": geo["city"],
        "state": geo["state"],
        "geo_source": geo["source"],
        "matched_rule": resolved["matched_rule"],
        "matched_rule_label": resolved["matched_rule_label"],
    }


@api_router.get("/pa-content")
async def get_pa_content_public():
    """Public: editable copy for the /pa advertorial page (defaults + overrides)."""
    cfg = await get_or_create_config()
    return _merged_pa_content(cfg)


@api_router.get("/admin/pa-content")
async def get_pa_content_admin(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    return _merged_pa_content(cfg)


@api_router.put("/admin/pa-content")
async def update_pa_content(body: dict, _: dict = Depends(require_editor)):
    """Save PA-page copy. Only known fields are persisted; lists are sanitized."""
    allowed = set(DEFAULT_PA_CONTENT.keys())
    update = {}
    for k, v in (body or {}).items():
        if k not in allowed:
            continue
        if k == "settlements" and isinstance(v, list):
            update[k] = [{"amount": str(s.get("amount", "")).strip(), "label": str(s.get("label", "")).strip()}
                         for s in v if isinstance(s, dict) and (s.get("amount") or s.get("label"))]
        elif k in ("body", "qualify_items", "attorney_badges") and isinstance(v, list):
            update[k] = [str(x).strip() for x in v if str(x).strip()]
        elif isinstance(v, str):
            update[k] = v.strip()
    await db.site_config.update_one(
        {"_id": "singleton"},
        {"$set": {"pa_content": {**DEFAULT_PA_CONTENT, **update}, "updated_at": _now_iso()}},
        upsert=True,
    )
    cfg = await get_or_create_config()
    return _merged_pa_content(cfg)


@api_router.get("/page-content/{page}")
async def get_page_content_public(page: str):
    """Public: editable copy (CTA, tooltip, trust badges) for the Home/Spanish page."""
    if page not in PAGE_CONTENT_DEFAULTS:
        raise HTTPException(status_code=404, detail="Unknown page")
    cfg = await get_or_create_config()
    return _merged_page_content(cfg, page)


@api_router.get("/admin/page-content/{page}")
async def get_page_content_admin(page: str, _: dict = Depends(require_admin)):
    if page not in PAGE_CONTENT_DEFAULTS:
        raise HTTPException(status_code=404, detail="Unknown page")
    cfg = await get_or_create_config()
    return _merged_page_content(cfg, page)


@api_router.put("/admin/page-content/{page}")
async def update_page_content(page: str, body: dict, _: dict = Depends(require_editor)):
    if page not in PAGE_CONTENT_DEFAULTS:
        raise HTTPException(status_code=404, detail="Unknown page")
    defaults = PAGE_CONTENT_DEFAULTS[page]
    update = {k: v.strip() for k, v in (body or {}).items()
              if k in defaults and isinstance(v, str)}
    merged = {**defaults, **update}
    await db.site_config.update_one(
        {"_id": "singleton"},
        {"$set": {f"{page}_content": merged, "updated_at": _now_iso()}},
        upsert=True,
    )
    cfg = await get_or_create_config()
    return _merged_page_content(cfg, page)


@api_router.post("/track/click")
async def track_click(body: ClickTrack, request: Request):
    """Record a click/visit, de-duplicated per session_id. Captures full Google
    Ads attribution and the hook rule that matched (for per-hook traffic)."""
    cfg = await get_or_create_config()
    ua = request.headers.get("user-agent", "")
    # Drop known bots/crawlers (e.g. AdsBot-Google crawling enabled campaigns)
    # so they never inflate paid-campaign click counts.
    if is_bot_ua(ua):
        return {"success": True, "bot": True}
    ip = resolve_client_ip(request.headers)
    geo = lookup_geo(ip, "", "")
    now = _now_iso()

    existing = await db.clicks.find_one({"session_id": body.session_id})
    if existing:
        await db.clicks.update_one(
            {"session_id": body.session_id},
            {"$set": {"last_seen": now}, "$inc": {"visits": 1}},
        )
        return {"success": True, "deduped": True}

    resolved = await resolve_hooks(cfg, body.campaign_id, body.adgroup_id, body.ad_id, seed=body.session_id)
    doc = body.model_dump()
    doc["ip"] = ip or ""
    doc["user_agent"] = request.headers.get("user-agent", "")
    doc["city"] = geo["city"]
    doc["state"] = geo["state"]
    doc["matched_rule_id"] = resolved["matched_rule"]
    doc["sitelink_id"] = doc.get("extensionid") or doc.get("feeditemid") or ""
    doc["id"] = str(uuid.uuid4())
    doc["first_seen"] = now
    doc["last_seen"] = now
    doc["visits"] = 1
    doc["converted"] = False
    await db.clicks.insert_one(doc)
    return {"success": True, "deduped": False}


@api_router.post("/track/engage")
async def track_engage(body: ClickTrack, request: Request):
    """Mark a session as engaged (entered the funnel) so it is not counted as a
    bounce. Idempotent — safe to call multiple times per session."""
    if is_bot_ua(request.headers.get("user-agent", "")):
        return {"success": True, "bot": True}
    if not body.session_id:
        return {"success": True, "skipped": True}
    await db.clicks.update_one(
        {"session_id": body.session_id},
        {"$set": {"engaged": True, "last_seen": _now_iso()}},
    )
    return {"success": True}


# Ordered funnel steps (must match frontend STEP_IDS).
FUNNEL_STEPS = ["year", "make", "model", "name", "address", "phone", "email"]


class StepTrack(BaseModel):
    session_id: str
    step: str = ""
    index: int = -1


@api_router.post("/track/step")
async def track_step(body: StepTrack, request: Request):
    """Record the furthest funnel step a visitor reached (for drop-off analytics).
    Only ever advances (uses $max). Idempotent."""
    if is_bot_ua(request.headers.get("user-agent", "")):
        return {"success": True, "bot": True}
    if not body.session_id:
        return {"success": True, "skipped": True}
    idx = body.index if body.index >= 0 else (FUNNEL_STEPS.index(body.step) if body.step in FUNNEL_STEPS else -1)
    if idx < 0:
        return {"success": True, "skipped": True}
    await db.clicks.update_one(
        {"session_id": body.session_id},
        {"$max": {"funnel_max_step": idx}, "$set": {"engaged": True, "last_seen": _now_iso()}},
    )
    return {"success": True}
    """Stable 0-99 bucket for a visitor (consistent across requests/processes)."""
    if not seed:
        seed = uuid.uuid4().hex
    return int(hashlib.md5(seed.encode()).hexdigest(), 16) % 100


def _weighted_variant(variants: list, seed: str) -> dict:
    """Stable weighted pick of a variant for a visitor (seeded by session)."""
    total = sum(max(0, int(v.get("weight", 0))) for v in variants) or 1
    bucket = int(hashlib.md5((seed or uuid.uuid4().hex).encode()).hexdigest(), 16) % total
    acc = 0
    for v in variants:
        acc += max(0, int(v.get("weight", 0)))
        if bucket < acc:
            return v
    return variants[-1]


@api_router.get("/split/decide")
async def split_decide(slug: str = Query("split", description="split entry slug"),
                       session: str = Query("", description="visitor session id")):
    """Decide which page a visitor should see for the RUNNING experiment bound to
    this entry slug (e.g. /split, /split2). Stable per session. When no experiment
    is running on this slug, everyone goes Home. The returned experiment_id +
    variant are stamped on the visitor's click/lead so Split Test stats count
    ONLY traffic that came through that split URL."""
    slug = (slug or "split").strip().lower() or "split"
    exp = await db.experiments.find_one({"status": "running", "slug": slug})
    if not exp:
        return {"running": False, "target": "/", "experiment_id": "", "variant": ""}
    variants = exp.get("variants", [])
    if not variants:
        return {"running": False, "target": "/", "experiment_id": "", "variant": ""}
    chosen = _weighted_variant(variants, session)
    return {
        "running": True,
        "experiment_id": exp["id"],
        "variant": chosen.get("label", ""),
        "target": chosen.get("path", "/"),
    }



def _dispatch_lead_emails(cfg: dict, lead: dict):
    """Runs in a BackgroundTask. Sends team notification + customer thank-you."""
    try:
        if cfg.get("notify_team", True):
            recipients = cfg.get("notification_emails") or []
            if recipients:
                vehicle = " ".join(
                    p for p in (lead.get("car_year", ""), lead.get("car_make", ""), lead.get("car_model", "")) if p
                ).strip()
                send_email(
                    recipients,
                    subject=f"New Lemon Law Lead: {lead.get('full_name','')} — {vehicle}".strip(" —"),
                    html=build_internal_notification_html(lead),
                    reply_to=lead.get("email") or None,
                )
        if cfg.get("send_thank_you", True) and lead.get("email"):
            send_email(
                lead["email"],
                subject=cfg.get("thank_you_subject") or "Thanks for your request — Lemon Pros",
                html=build_thank_you_html(lead, cfg.get("thank_you_body")),
            )
    except Exception as e:
        logger.error("Lead email dispatch failed: %s", e)


def _post_lead_to_crm(lead: dict):
    """Runs in a BackgroundTask. Forwards the lead to an external CRM/Zapier
    webhook when CRM_WEBHOOK_URL is configured. No-op (logged) when not set.
    Strips internal marketing-tracking fields and tags the lead source."""
    if not CRM_WEBHOOK_URL:
        return
    drop = {"campaign_id", "adgroup_id", "ad_id", "keyword", "gclid", "gbraid", "wbraid", "params", "matched_rule_id"}
    payload = {k: v for k, v in lead.items() if k not in drop}
    payload["source"] = "google ppc form"
    # Tag the landing page so the CRM/Zapier knows which funnel the lead came from:
    # Spanish (/sp) vs everything else (/pa).
    slug = "sp" if (lead.get("source_page") or "").lower() == "sp" else "pa"
    payload["landing_page"] = f"apply.lemonpros.com/{slug}"
    try:
        resp = requests.post(CRM_WEBHOOK_URL, json=payload, timeout=10)
        if resp.status_code >= 400:
            logger.error("CRM webhook returned %s: %s", resp.status_code, resp.text[:300])
        else:
            logger.info("CRM webhook delivered lead %s (%s)", lead.get("id"), resp.status_code)
    except Exception as e:
        logger.error("CRM webhook post failed: %s", e)


@api_router.post("/leads")
async def create_lead(payload: LeadCreate, request: Request, background_tasks: BackgroundTasks):
    # Drop bot/spam submissions arriving from blocked ad-network referrers
    # (e.g. googlesyndication.com). Return 200 so the bot stops retrying, but
    # never persist, forward to CRM, or email.
    ref = (payload.referrer or "").lower()
    if any(b in ref for b in BLOCKED_REFERRER_SUBSTRINGS):
        logger.info("Blocked spam lead from referrer: %s", payload.referrer)
        return {"success": True, "blocked": True}
    cfg = await get_or_create_config()
    ip = resolve_client_ip(request.headers)
    geo = lookup_geo(ip, "", "")
    resolved = await resolve_hooks(cfg, payload.campaign_id, payload.adgroup_id, payload.ad_id, seed=payload.session_id)

    lead = payload.model_dump()
    lead["id"] = str(uuid.uuid4())
    lead["source_page"] = (payload.source_page or "home").lower()
    lead["phone_digits"] = _re.sub(r"\D", "", payload.phone or "")
    lead["full_name"] = f"{payload.first_name} {payload.last_name}".strip()
    lead["city"] = payload.city or geo["city"]
    lead["state"] = payload.state or geo["state"]
    lead["ip"] = ip or ""
    lead["user_agent"] = request.headers.get("user-agent", "")
    # Attribute the lead to the SAME hook the visitor actually saw at click time
    # (recorded on the click doc), so per-hook click/lead stats stay consistent.
    click_doc = await db.clicks.find_one({"session_id": payload.session_id}, {"matched_rule_id": 1})
    if click_doc is not None and "matched_rule_id" in click_doc:
        lead["matched_rule_id"] = click_doc.get("matched_rule_id")
    else:
        lead["matched_rule_id"] = resolved["matched_rule"]
    lead["sitelink_id"] = lead.get("extensionid") or lead.get("feeditemid") or ""
    lead["created_at"] = _now_iso()

    # Phone de-duplication: if this phone already exists as a prior FORM LEAD or a
    # prior CALL, still save the lead for the record but do NOT fire a duplicate
    # into the CRM. Match on the last 10 digits (ignores +1 / formatting).
    digits10 = lead["phone_digits"][-10:]
    is_dupe = False
    if len(digits10) >= 10:
        suffix = {"$regex": _re.escape(digits10) + "$"}
        prior_lead = await db.leads.count_documents({"phone_digits": suffix})
        prior_call = await db.calls.count_documents({"caller_digits": suffix})
        is_dupe = (prior_lead > 0) or (prior_call > 0)
    lead["crm_duplicate_skipped"] = is_dupe

    await db.leads.insert_one({**lead})

    if payload.session_id:
        await db.clicks.update_one(
            {"session_id": payload.session_id},
            {"$set": {"converted": True, "converted_at": lead["created_at"]}},
        )

    background_tasks.add_task(_dispatch_lead_emails, cfg, {k: v for k, v in lead.items() if k != "_id"})
    if is_dupe:
        logger.info("Lead %s NOT sent to CRM — duplicate phone %s (prior lead/call exists)", lead["id"], digits10)
    else:
        background_tasks.add_task(_post_lead_to_crm, {k: v for k, v in lead.items() if k != "_id"})
    return {"success": True, "id": lead["id"], "crm_duplicate_skipped": is_dupe}


NOMINATIM_HEADERS = {"User-Agent": "LemonPros-LeadFunnel/1.0 (info@lemonpros.com)"}


def _nominatim(params: dict):
    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={**params, "format": "json", "addressdetails": 1, "limit": 1, "countrycodes": "us"},
        headers=NOMINATIM_HEADERS,
        timeout=8,
    )
    return resp.json()


@api_router.get("/geo-zip")
async def geo_from_zip(zip: str = Query(..., min_length=3, max_length=10)):
    """Resolve an accurate city/state from a US ZIP code (Nominatim)."""
    try:
        data = _nominatim({"postalcode": zip})
        if data:
            a = data[0].get("address", {})
            city = a.get("city") or a.get("town") or a.get("village") or a.get("hamlet") or ""
            state = a.get("state") or ""
            return {"found": bool(city or state), "city": city, "state": state}
    except Exception:
        pass
    return {"found": False, "city": "", "state": ""}


@api_router.post("/verify-address")
async def verify_address(body: AddressVerify):
    """Verify that a submitted address is a REAL street address using the free,
    open-source Nominatim / OpenStreetMap geocoder. Rejects random text and a
    real street typed under the wrong ZIP. Fails open only on network errors so
    genuine users are never blocked by API downtime."""
    if not body.address or not body.address.strip():
        return {"valid": False, "reason": "empty"}

    street = body.address.strip()
    zip5 = (body.zip or "").strip()[:5]
    state = (body.state or "").strip()
    city = (body.city or "").strip()

    def evaluate(data):
        """Accept only when OSM resolves an actual road (not a city/ZIP centroid)
        and, when a ZIP was provided, the matched ZIP agrees with it."""
        if not data:
            return None
        top = data[0]
        addr = top.get("address", {})
        road = addr.get("road") or ""
        if not road:
            return None  # only matched a town/postcode area, not a street
        result_zip = (addr.get("postcode") or "")[:5]
        if zip5 and result_zip and zip5 != result_zip:
            return None  # real street, but not in the ZIP the user entered
        return {
            "valid": True,
            "matched_street_level": bool(addr.get("house_number")),
            "formatted": top.get("display_name", ""),
            "normalized": {
                "house_number": addr.get("house_number", ""),
                "road": road,
                "city": addr.get("city") or addr.get("town") or addr.get("village") or "",
                "state": addr.get("state", ""),
                "zip": result_zip,
            },
        }

    try:
        # 1) Structured query — most precise (street + city/state/postalcode).
        structured = {"street": street}
        if city:
            structured["city"] = city
        if state:
            structured["state"] = state
        if zip5:
            structured["postalcode"] = zip5
        res = evaluate(_nominatim(structured))
        if res:
            return res
        # 2) Free-form fallback for less common formatting.
        q = ", ".join(p for p in [street, city, f"{state} {zip5}".strip()] if p)
        res = evaluate(_nominatim({"q": q}))
        if res:
            return res
        return {"valid": False, "reason": "not_found"}
    except Exception:
        return {"valid": True, "soft": True, "matched_street_level": False, "formatted": ""}


@api_router.post("/verify-phone")
async def verify_phone(body: PhoneVerify):
    """Validate a phone number against real numbering plans using the free,
    open-source `phonenumbers` library (Google's libphonenumber). Blocks random
    digits / impossible numbers. Local check (no network), so it never fails open."""
    raw = (body.phone or "").strip()
    if not raw:
        return {"valid": False, "reason": "empty"}
    try:
        import phonenumbers
        num = phonenumbers.parse(raw, (body.region or "US"))
        if not phonenumbers.is_valid_number(num):
            return {"valid": False, "reason": "invalid"}
        return {
            "valid": True,
            "formatted": phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.NATIONAL),
            "e164": phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164),
        }
    except Exception:
        return {"valid": False, "reason": "unparseable"}


@api_router.post("/verify-email")
async def verify_email_address(body: EmailVerify):
    """Validate an email's syntax AND that its domain can actually receive mail
    (live DNS/MX lookup) using the free, open-source `email-validator` library.
    Rejects random text and dead domains; fails open only on transient DNS errors."""
    raw = (body.email or "").strip()
    if not raw:
        return {"valid": False, "reason": "empty"}
    try:
        from email_validator import validate_email, EmailNotValidError
        try:
            info = validate_email(raw, check_deliverability=True)
            return {"valid": True, "normalized": getattr(info, "normalized", None) or getattr(info, "email", raw)}
        except EmailNotValidError as e:
            msg = str(e).lower()
            try:
                validate_email(raw, check_deliverability=False)
                syntax_ok = True
            except EmailNotValidError:
                syntax_ok = False
            if not syntax_ok:
                return {"valid": False, "reason": "syntax"}
            if any(k in msg for k in ("try again", "timeout", "temporar", "error while", "nameserver", "timed out")):
                return {"valid": True, "soft": True}
            return {"valid": False, "reason": "undeliverable"}
    except Exception:
        return {"valid": True, "soft": True}



@api_router.post("/contact")
async def contact_form(body: ContactBody, background_tasks: BackgroundTasks):
    """Public contact form — forwards the message to the company inbox."""
    if not body.name.strip() or not body.message.strip():
        raise HTTPException(status_code=400, detail="Name and message are required.")
    html = build_contact_html(body.name.strip(), body.email.strip(), (body.phone or "").strip(), body.message.strip())
    background_tasks.add_task(
        send_email,
        [CONTACT_FORWARD_EMAIL],
        f"Website Contact: {body.name.strip()}",
        html,
        body.email.strip() or None,
    )
    return {"success": True}


# ----------------------------- Auth + users -----------------------------
@api_router.post("/admin/login")
async def admin_login(body: LoginRequest, request: Request):
    uname = (body.username or "").strip()
    owner = await get_owner_account()
    owner_username = (owner.get("username") or "owner")
    owner_hash = owner.get("password_hash")
    # Owner login: blank, "owner", or the custom owner username.
    if uname.lower() in ("", "owner", owner_username.lower()):
        ok = False
        if owner_hash and _verify_pw(body.password, owner_hash):
            ok = True
        elif body.password == ADMIN_PASSWORD:
            ok = True  # env password = bootstrap + recovery
        if ok:
            await _record_activity(owner_username, "login", "Signed in", request)
            return {"token": create_token(owner_username, "owner"), "username": owner_username, "role": "owner"}
    user = await db.admin_users.find_one({"username": uname})
    if user and _verify_pw(body.password, user.get("password_hash", "")):
        await _record_activity(uname, "login", "Signed in", request)
        return {"token": create_token(uname, user["role"]), "username": uname, "role": user["role"]}
    raise HTTPException(status_code=401, detail="Incorrect username or password")


@api_router.get("/admin/me")
async def admin_me(user: dict = Depends(require_admin)):
    return {"username": user["username"], "role": user["role"]}


@api_router.get("/admin/users")
async def list_users(user: dict = Depends(require_admin)):
    users = await db.admin_users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(200)
    owner_acct = await get_owner_account()
    owner = {"username": owner_acct.get("username") or "owner", "role": "owner", "is_owner": True}
    return {"users": [owner] + users, "current": user}


@api_router.get("/admin/users/{username}/activity")
async def user_activity(username: str, _: dict = Depends(require_owner), limit: int = Query(50)):
    """Master-only: login history + change history for a team member."""
    limit = max(1, min(int(limit or 50), 200))
    cur = db.admin_activity.find({"username": username}, {"_id": 0}).sort("at", -1).limit(limit * 2)
    rows = await cur.to_list(limit * 2)
    logins = [r for r in rows if r.get("kind") == "login"][:limit]
    changes = [r for r in rows if r.get("kind") == "change"][:limit]
    last_login = logins[0]["at"] if logins else None
    return {"username": username, "logins": logins, "changes": changes,
            "login_count": len(logins), "change_count": len(changes), "last_login": last_login}


@api_router.put("/admin/owner-credentials")
async def update_owner_credentials(body: OwnerCredsUpdate, user: dict = Depends(require_owner)):
    """Master admin self-service: change own username and/or password. Requires
    the current password (custom DB password or the env bootstrap password)."""
    owner = await get_owner_account()
    owner_hash = owner.get("password_hash")
    valid = (owner_hash and _verify_pw(body.current_password, owner_hash)) or (body.current_password == ADMIN_PASSWORD)
    if not valid:
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    update = {}
    new_username = (body.new_username or "").strip()
    if new_username and new_username.lower() != (owner.get("username") or "owner").lower():
        if await db.admin_users.find_one({"username": new_username}):
            raise HTTPException(status_code=409, detail="That username is taken by a team member.")
        update["username"] = new_username
    if body.new_password:
        if len(body.new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        update["password_hash"] = _hash_pw(body.new_password)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    update["updated_at"] = _now_iso()
    await db.admin_owner.update_one({"_id": "singleton"}, {"$set": update}, upsert=True)
    final_username = update.get("username") or owner.get("username") or "owner"
    # Re-issue token because the username (token subject) may have changed.
    return {"success": True, "username": final_username, "token": create_token(final_username, "owner")}


@api_router.put("/admin/my-credentials")
async def update_my_credentials(body: MyCredsUpdate, request: Request, user: dict = Depends(require_admin)):
    """Self-service: any logged-in team member changes their OWN username and/or
    password. Requires the current password. The owner uses /owner-credentials."""
    if user.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Owners use the Master Admin Credentials card.")
    acct = await db.admin_users.find_one({"username": user["username"]})
    if not acct:
        raise HTTPException(status_code=404, detail="Your account was not found.")
    if not _verify_pw(body.current_password, acct.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    update = {}
    new_username = (body.new_username or "").strip()
    if new_username and new_username.lower() != user["username"].lower():
        if new_username.lower() == "owner":
            raise HTTPException(status_code=400, detail="'owner' is reserved.")
        owner = await get_owner_account()
        if new_username.lower() == (owner.get("username") or "owner").lower():
            raise HTTPException(status_code=409, detail="That username is taken.")
        if await db.admin_users.find_one({"username": new_username}):
            raise HTTPException(status_code=409, detail="That username is taken.")
        update["username"] = new_username
    if body.new_password:
        if len(body.new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        update["password_hash"] = _hash_pw(body.new_password)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    update["updated_at"] = _now_iso()
    await db.admin_users.update_one({"username": user["username"]}, {"$set": update})
    final_username = update.get("username") or user["username"]
    # Re-issue token because the username (token subject) may have changed.
    return {"success": True, "username": final_username,
            "token": create_token(final_username, user["role"]), "role": user["role"]}


@api_router.post("/admin/users")
async def create_user(body: UserCreate, user: dict = Depends(require_editor)):
    uname = body.username.strip()
    if not uname or not body.password:
        raise HTTPException(status_code=400, detail="Username and password are required.")
    if uname.lower() == "owner":
        raise HTTPException(status_code=400, detail="'owner' is reserved.")
    if body.role not in ("editor", "view_only"):
        raise HTTPException(status_code=400, detail="Role must be editor or view_only.")
    if await db.admin_users.find_one({"username": uname}):
        raise HTTPException(status_code=409, detail="Username already exists.")
    doc = {
        "id": str(uuid.uuid4()),
        "username": uname,
        "password_hash": _hash_pw(body.password),
        "role": body.role,
        "created_at": _now_iso(),
    }
    await db.admin_users.insert_one(doc)
    return {"username": uname, "role": body.role}


@api_router.put("/admin/users/{username}")
async def update_user(username: str, body: UserUpdate, user: dict = Depends(require_editor)):
    if username.lower() == "owner":
        raise HTTPException(status_code=400, detail="The owner account cannot be modified here.")
    update = {}
    if body.password:
        update["password_hash"] = _hash_pw(body.password)
    if body.role:
        if body.role not in ("editor", "view_only"):
            raise HTTPException(status_code=400, detail="Role must be editor or view_only.")
        update["role"] = body.role
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    res = await db.admin_users.update_one({"username": username}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"success": True}


@api_router.delete("/admin/users/{username}")
async def delete_user(username: str, user: dict = Depends(require_editor)):
    if username.lower() == "owner":
        raise HTTPException(status_code=400, detail="The owner account cannot be deleted.")
    res = await db.admin_users.delete_one({"username": username})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"success": True}


# ----------------------------- Config / hooks -----------------------------
@api_router.get("/admin/config")
async def admin_get_config(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    # Return only hook1/hook2 (no default_city/default_state per admin overhaul)
    return {
        "hook1": cfg.get("hook1", ""),
        "hook2": cfg.get("hook2", ""),
        "notification_emails": cfg.get("notification_emails", []),
        "notify_team": cfg.get("notify_team", True),
        "send_thank_you": cfg.get("send_thank_you", True),
        "thank_you_subject": cfg.get("thank_you_subject", ""),
        "thank_you_body": cfg.get("thank_you_body", ""),
        "updated_at": cfg.get("updated_at", ""),
    }


@api_router.put("/admin/config")
async def admin_update_config(body: ConfigUpdate, _: dict = Depends(require_editor)):
    update = body.model_dump()
    update["updated_at"] = _now_iso()
    await db.site_config.update_one({"_id": "singleton"}, {"$set": update}, upsert=True)
    cfg = await get_or_create_config()
    return serialize_doc(cfg)


class ExperimentVariant(BaseModel):
    label: str
    path: str
    weight: int = 50


class ExperimentBody(BaseModel):
    name: str
    variants: List[ExperimentVariant]


async def _experiment_stats(exp: dict, s_iso: str = "", e_iso: str = "") -> dict:
    """Per-variant clicks/leads/conversion for an experiment — counts ONLY traffic
    that was routed through /split (stamped with this experiment id). When a date
    range is given, only clicks/leads within it are counted."""
    eid = exp["id"]
    click_match = {"split_experiment_id": eid}
    lead_match = {"split_experiment_id": eid}
    if s_iso and e_iso:
        click_match["first_seen"] = {"$gte": s_iso, "$lte": e_iso}
        lead_match["created_at"] = {"$gte": s_iso, "$lte": e_iso}
    clicks = {}
    async for c in db.clicks.aggregate([
        {"$match": click_match},
        {"$group": {"_id": "$split_variant", "n": {"$sum": 1}}},
    ]):
        clicks[c["_id"] or ""] = c["n"]
    leads = {}
    async for l in db.leads.aggregate([
        {"$match": lead_match},
        {"$group": {"_id": "$split_variant", "n": {"$sum": 1}}},
    ]):
        leads[l["_id"] or ""] = l["n"]
    variants = []
    best = None
    for v in exp.get("variants", []):
        lbl = v.get("label", "")
        c, lc = clicks.get(lbl, 0), leads.get(lbl, 0)
        conv = round((lc / c * 100), 1) if c else 0.0
        row = {"label": lbl, "path": v.get("path", ""), "weight": v.get("weight", 0),
               "clicks": c, "leads": lc, "conversion_rate": conv}
        variants.append(row)
        if c > 0 and (best is None or conv > best["conversion_rate"]):
            best = row
    # Winner only if at least two variants have traffic and one clearly leads.
    with_traffic = [v for v in variants if v["clicks"] > 0]
    winner = None
    if len(with_traffic) >= 2:
        top = max(v["conversion_rate"] for v in with_traffic)
        leaders = [v for v in with_traffic if v["conversion_rate"] == top]
        winner = "tie" if len(leaders) > 1 else leaders[0]["label"]
    return {"variants": variants, "winner": winner}


async def _next_split_slug() -> str:
    """First free split entry slug: split, split2, split3, …"""
    used = set()
    async for e in db.experiments.find({}, {"slug": 1}):
        if e.get("slug"):
            used.add(e["slug"])
    if "split" not in used:
        return "split"
    n = 2
    while f"split{n}" in used:
        n += 1
    return f"split{n}"


@api_router.get("/admin/experiments")
async def list_experiments(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    docs = await db.experiments.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    s_iso, e_iso = ("", "")
    if start or end:
        s_iso, e_iso, _d = _date_range(start, end)
    for d in docs:
        d["stats"] = await _experiment_stats(d, s_iso, e_iso)
    return {"experiments": docs}


@api_router.post("/admin/experiments")
async def create_experiment(body: ExperimentBody, _: dict = Depends(require_editor)):
    variants = [{"label": v.label.strip() or v.path,
                 "path": "/" + v.path.strip().lstrip("/"),
                 "weight": max(0, int(v.weight))} for v in body.variants]
    exp = {"id": str(uuid.uuid4()), "name": body.name.strip() or "Untitled test",
           "variants": variants, "status": "draft", "slug": await _next_split_slug(),
           "created_at": _now_iso(), "stopped_at": ""}
    await db.experiments.insert_one(dict(exp))
    return exp


@api_router.put("/admin/experiments/{exp_id}")
async def update_experiment(exp_id: str, body: dict, _: dict = Depends(require_editor)):
    exp = await db.experiments.find_one({"id": exp_id})
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    update = {"updated_at": _now_iso()}
    if "name" in body:
        update["name"] = str(body["name"]).strip() or exp.get("name")
    if "slug" in body:
        raw = str(body["slug"] or "").strip().lower().lstrip("/")
        slug = _re.sub(r"[^a-z0-9-]+", "-", raw).strip("-")
        if not slug:
            raise HTTPException(status_code=400, detail="The URL slug can't be empty.")
        clash = await db.experiments.find_one({"slug": slug, "id": {"$ne": exp_id}})
        if clash:
            raise HTTPException(status_code=409, detail="That URL is already used by another test.")
        update["slug"] = slug
    if "variants" in body and isinstance(body["variants"], list):
        update["variants"] = [{"label": (v.get("label") or v.get("path") or "").strip(),
                               "path": "/" + str(v.get("path", "")).strip().lstrip("/"),
                               "weight": max(0, int(v.get("weight", 0)))} for v in body["variants"]]
    if "status" in body and body["status"] in ("draft", "running", "stopped"):
        new_status = body["status"]
        # Each test runs on its OWN entry URL, so multiple tests can run at once.
        if new_status == "stopped":
            update["stopped_at"] = _now_iso()
        update["status"] = new_status
    await db.experiments.update_one({"id": exp_id}, {"$set": update})
    doc = await db.experiments.find_one({"id": exp_id}, {"_id": 0})
    doc["stats"] = await _experiment_stats(doc)
    return doc


@api_router.delete("/admin/experiments/{exp_id}")
async def delete_experiment(exp_id: str, _: dict = Depends(require_editor)):
    res = await db.experiments.delete_one({"id": exp_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return {"success": True}


class SpanishHooksUpdate(BaseModel):
    hook1_es: str
    hook2_es: str


async def _source_breakdown(source_page: str, s_iso: str, e_iso: str, fields: list) -> list:
    """Clicks + leads grouped by `fields`, restricted to one source_page."""
    def _grp(prefix):
        return {f: f"${f}" for f in fields}
    clicks = {}
    async for row in db.clicks.aggregate([
        {"$match": {"first_seen": {"$gte": s_iso, "$lte": e_iso}, "source_page": source_page}},
        {"$group": {"_id": _grp("c"), "n": {"$sum": 1}}},
    ]):
        key = tuple((row["_id"].get(f) or "") for f in fields)
        clicks[key] = row["n"]
    leads = {}
    async for row in db.leads.aggregate([
        {"$match": {"created_at": {"$gte": s_iso, "$lte": e_iso}, "source_page": source_page}},
        {"$group": {"_id": _grp("l"), "n": {"$sum": 1}}},
    ]):
        key = tuple((row["_id"].get(f) or "") for f in fields)
        leads[key] = row["n"]
    rows = []
    for k in set(clicks) | set(leads):
        entry = {fields[i]: k[i] for i in range(len(fields))}
        c, lc = clicks.get(k, 0), leads.get(k, 0)
        entry["clicks"] = c
        entry["leads"] = lc
        entry["conversion_rate"] = round((lc / c * 100), 1) if c else (100.0 if lc else 0.0)
        rows.append(entry)
    rows.sort(key=lambda r: (r["leads"], r["clicks"]), reverse=True)
    return rows


@api_router.get("/admin/funnel")
async def admin_funnel(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    """Per-landing-page funnel: how many visitors reach each step and where they
    drop off. Stages: Landing view -> Year -> Make -> Model -> Name -> Address ->
    Phone -> Email -> Submitted."""
    s_iso, e_iso, _d = _date_range(start, end)
    match = {"first_seen": {"$gte": s_iso, "$lte": e_iso}}

    # Histogram of furthest step reached, grouped by source page.
    pages = {}  # page -> {"views": n, "hist": {idx: n}, "converted": n}

    def _page(sp):
        key = (sp or "home").lower()
        if key not in ("home", "lapa", "sp"):
            key = "home"
        return key

    async for row in db.clicks.aggregate([
        {"$match": match},
        {"$group": {"_id": {"sp": "$source_page", "step": "$funnel_max_step"}, "n": {"$sum": 1}}},
    ]):
        p = _page(row["_id"].get("sp"))
        d = pages.setdefault(p, {"views": 0, "hist": {}, "converted": 0})
        step = row["_id"].get("step")
        d["views"] += row["n"]
        if step is not None and step >= 0:
            d["hist"][step] = d["hist"].get(step, 0) + row["n"]

    async for row in db.clicks.aggregate([
        {"$match": {**match, "converted": True}},
        {"$group": {"_id": "$source_page", "n": {"$sum": 1}}},
    ]):
        p = _page(row["_id"])
        pages.setdefault(p, {"views": 0, "hist": {}, "converted": 0})["converted"] += row["n"]

    labels = {"home": "Home", "lapa": "PA Page", "sp": "Spanish"}
    stage_names = ["Landing View"] + [s.capitalize() for s in FUNNEL_STEPS] + ["Submitted"]

    def build(d, calls=0):
        views = d["views"]
        hist = d["hist"]
        # reached[i] = visitors whose furthest step >= i
        reached = []
        for i in range(len(FUNNEL_STEPS)):
            reached.append(sum(n for st, n in hist.items() if st >= i))
        counts = [views] + reached + [d["converted"]]
        stages = []
        prev = None
        for name, c in zip(stage_names, counts):
            drop = (prev - c) if (prev is not None and prev >= c) else 0
            drop_pct = round((drop / prev * 100), 1) if prev else 0.0
            pct_of_top = round((c / counts[0] * 100), 1) if counts[0] else 0.0
            stages.append({"stage": name, "count": c, "drop": drop, "drop_pct": drop_pct, "pct_of_views": pct_of_top})
            prev = c
        # A phone call counts as a conversion too. Calls aren't tied to a specific
        # landing page (inbound), so they're only folded into the "All Pages" view.
        conversions = d["converted"] + calls
        return {"views": views, "submitted": d["converted"], "calls": calls,
                "conversions": conversions,
                "form_conversion_rate": round((d["converted"] / views * 100), 1) if views else 0.0,
                "conversion_rate": round((conversions / views * 100), 1) if views else 0.0,
                "stages": stages}

    # Total inbound calls in range — counted as conversions on the overall view.
    total_calls = await db.calls.count_documents({"created_at": {"$gte": s_iso, "$lte": e_iso}})

    # Overall (sum of all pages)
    overall = {"views": 0, "hist": {}, "converted": 0}
    for d in pages.values():
        overall["views"] += d["views"]
        overall["converted"] += d["converted"]
        for st, n in d["hist"].items():
            overall["hist"][st] = overall["hist"].get(st, 0) + n

    result = {"overall": build(overall, calls=total_calls), "total_calls": total_calls}
    for key, lbl in labels.items():
        result[key] = {"label": lbl, **build(pages.get(key, {"views": 0, "hist": {}, "converted": 0}))}
    result["range"] = {"start": s_iso, "end": e_iso}
    return result


@api_router.get("/admin/funnel/campaigns")
async def admin_funnel_campaigns(page: str = Query("overall"), _: dict = Depends(require_admin),
                                 start: str = Query(""), end: str = Query("")):
    """Campaigns feeding a landing page's traffic, with clicks/leads per campaign.
    `page` is one of: overall | home | lapa | sp."""
    s_iso, e_iso, _d = _date_range(start, end)
    cfg = await get_or_create_config()
    ad_labels = cfg.get("ad_labels") or {}
    page_map = {"home": "home", "lapa": "lapa", "sp": "sp"}

    click_match = {"first_seen": {"$gte": s_iso, "$lte": e_iso}}
    lead_match = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    if page in page_map:
        click_match["source_page"] = page_map[page]
        lead_match["source_page"] = page_map[page]

    clicks = {}
    async for row in db.clicks.aggregate([
        {"$match": click_match},
        {"$group": {"_id": "$campaign_id", "n": {"$sum": 1}}},
    ]):
        clicks[row["_id"] or ""] = row["n"]
    leads = {}
    async for row in db.leads.aggregate([
        {"$match": lead_match},
        {"$group": {"_id": "$campaign_id", "n": {"$sum": 1}}},
    ]):
        leads[row["_id"] or ""] = row["n"]

    total_clicks = sum(clicks.values())
    rows = []
    for cid in set(clicks) | set(leads):
        c, lc = clicks.get(cid, 0), leads.get(cid, 0)
        name = ad_labels.get(cid) or ad_labels.get(str(cid)) or (cid if cid else "Direct / Untracked")
        rows.append({
            "campaign_id": cid, "campaign": name, "clicks": c, "leads": lc,
            "conversion_rate": round((lc / c * 100), 1) if c else (100.0 if lc else 0.0),
            "pct_of_traffic": round((c / total_clicks * 100), 1) if total_clicks else 0.0,
        })
    rows.sort(key=lambda r: (r["clicks"], r["leads"]), reverse=True)
    return {"page": page, "total_clicks": total_clicks, "campaigns": rows}



@api_router.get("/admin/spanish")
async def get_spanish(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    """Spanish-page (`/sp`, source_page='sp') control panel: editable hooks +
    totals + campaign/ad-group breakdown filtered to Spanish traffic only."""
    cfg = await get_or_create_config()
    s_iso, e_iso, _days = _date_range(start, end)
    clicks = await db.clicks.count_documents(
        {"first_seen": {"$gte": s_iso, "$lte": e_iso}, "source_page": "sp"})
    leads = await db.leads.count_documents(
        {"created_at": {"$gte": s_iso, "$lte": e_iso}, "source_page": "sp"})
    return {
        "hook1_es": cfg.get("hook1_es", ""),
        "hook2_es": cfg.get("hook2_es", ""),
        "stats": {
            "clicks": clicks,
            "leads": leads,
            "conversion_rate": round((leads / clicks * 100), 1) if clicks else 0.0,
        },
        "by_campaign": await _source_breakdown("sp", s_iso, e_iso, ["campaign_id"]),
        "by_adgroup": await _source_breakdown("sp", s_iso, e_iso, ["campaign_id", "adgroup_id"]),
        "ad_labels": cfg.get("ad_labels") or {},
        "range": {"start": s_iso, "end": e_iso},
    }


@api_router.put("/admin/spanish")
async def update_spanish(body: SpanishHooksUpdate, _: dict = Depends(require_editor)):
    await db.site_config.update_one(
        {"_id": "singleton"},
        {"$set": {"hook1_es": body.hook1_es, "hook2_es": body.hook2_es, "updated_at": _now_iso()}},
        upsert=True,
    )
    return {"hook1_es": body.hook1_es, "hook2_es": body.hook2_es}


class PageItem(BaseModel):
    label: str
    path: str


class PagesUpdate(BaseModel):
    pages: List[PageItem]


@api_router.get("/admin/pages")
async def get_pages(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    return {"custom_pages": cfg.get("custom_pages", []) or []}


@api_router.put("/admin/pages")
async def update_pages(body: PagesUpdate, _: dict = Depends(require_editor)):
    pages = []
    for p in body.pages:
        path = ("/" + p.path.strip().lstrip("/")) if p.path.strip() else "/"
        pages.append({"id": str(uuid.uuid4()), "label": p.label.strip() or path, "path": path})
    await db.site_config.update_one(
        {"_id": "singleton"},
        {"$set": {"custom_pages": pages, "updated_at": _now_iso()}},
        upsert=True,
    )
    return {"custom_pages": pages}




@api_router.get("/admin/email-template")
async def get_email_template(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    return {
        "thank_you_subject": cfg.get("thank_you_subject", ""),
        "thank_you_body": cfg.get("thank_you_body", ""),
    }


@api_router.put("/admin/email-template")
async def update_email_template(body: EmailTemplateBody, _: dict = Depends(require_editor)):
    await db.site_config.update_one({"_id": "singleton"}, {"$set": {
        "thank_you_subject": body.thank_you_subject,
        "thank_you_body": body.thank_you_body,
        "updated_at": _now_iso(),
    }}, upsert=True)
    cfg = await get_or_create_config()
    return {
        "thank_you_subject": cfg.get("thank_you_subject", ""),
        "thank_you_body": cfg.get("thank_you_body", ""),
    }


@api_router.post("/admin/email-template/test")
async def test_thank_you_email(body: TestEmailBody, _: dict = Depends(require_editor)):
    cfg = await get_or_create_config()
    sample = {
        "first_name": "Test", "last_name": "Customer", "full_name": "Test Customer",
        "email": body.to, "address": "123 Demo St, Council Bluffs, IA",
        "city": "Council Bluffs", "state": "Iowa", "issue": "Broken spring",
        "service_type": "Repair",
    }
    result = send_email(
        body.to,
        subject=cfg.get("thank_you_subject") or "Thanks for your request",
        html=build_thank_you_html(sample, cfg.get("thank_you_body")),
    )
    if not result["ok"]:
        raise HTTPException(status_code=502, detail=f"Email send failed: {result['error']}")
    return {"success": True}


# ----------------------------- Notification settings -----------------------------
def _clean_emails(emails):
    seen, out = set(), []
    for e in emails or []:
        e = (e or "").strip().lower()
        if e and "@" in e and e not in seen:
            seen.add(e)
            out.append(e)
    return out


@api_router.get("/admin/notifications")
async def get_notifications(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    return {
        "notification_emails": cfg.get("notification_emails", []),
        "notify_team": cfg.get("notify_team", True),
        "send_thank_you": cfg.get("send_thank_you", True),
        "smtp_configured": bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_PASS")),
        "sender_email": os.environ.get("SENDER_EMAIL", ""),
    }


def _mask_webhook(url: str) -> str:
    """Mask the secret token in a webhook URL for safe display in the admin UI."""
    if not url:
        return ""
    try:
        head, _, _ = url.partition("://")
        rest = url.split("://", 1)[1]
        host = rest.split("/", 1)[0]
        parts = rest.split("/")
        # Keep the host + first path segment, mask the rest (the secret).
        visible = "/".join(parts[:3])
        return f"{head}://{visible}/" + ("\u2022" * 6) if len(parts) > 3 else url
    except Exception:
        return url[:24] + "\u2022" * 6


@api_router.get("/admin/integrations")
async def get_integrations(_: dict = Depends(require_admin)):
    """Live status of outbound integrations shown in Admin → Settings."""
    crm_url = os.environ.get("CRM_WEBHOOK_URL", "") or CRM_WEBHOOK_URL
    is_zapier = "zapier.com" in crm_url
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    resend_key = os.environ.get("RESEND_API_KEY", "")
    email_live = bool(resend_key) or bool(smtp_host and smtp_user and smtp_pass)
    email_provider = "Resend" if resend_key else ("SMTP" if (smtp_host and smtp_user and smtp_pass) else None)
    leads_total = await db.leads.count_documents({})
    return {
        "lead_posting": {
            "configured": bool(crm_url),
            "live": bool(crm_url),
            "provider": "Zapier" if is_zapier else ("Webhook" if crm_url else None),
            "url_masked": _mask_webhook(crm_url),
            "method": "POST (JSON)",
            "source_tag": "google ppc form",
            "fields": [
                "first_name", "last_name", "full_name", "email", "phone",
                "car_year", "car_make", "car_model",
                "address", "city", "state", "zip",
                "source", "id", "created_at",
            ],
            "total_leads": leads_total,
        },
        "email": {
            "configured": email_live,
            "live": email_live,
            "provider": email_provider,
            "purpose": "Lead notifications only (no customer thank-you email)",
            "host": smtp_host,
            "port": os.environ.get("SMTP_PORT", "465"),
            "sender_email": os.environ.get("SENDER_EMAIL", "") or smtp_user,
            "sender_name": os.environ.get("SENDER_NAME", "Lemon Pros"),
            "recipients": (await get_or_create_config()).get("notification_emails", []),
        },
    }



@api_router.put("/admin/notifications")
async def update_notifications(body: NotificationSettings, _: dict = Depends(require_editor)):
    update = {
        "notification_emails": _clean_emails(body.notification_emails),
        "notify_team": body.notify_team,
        "send_thank_you": body.send_thank_you,
        "updated_at": _now_iso(),
    }
    await db.site_config.update_one({"_id": "singleton"}, {"$set": update}, upsert=True)
    cfg = await get_or_create_config()
    return {
        "notification_emails": cfg.get("notification_emails", []),
        "notify_team": cfg.get("notify_team", True),
        "send_thank_you": cfg.get("send_thank_you", True),
    }


@api_router.post("/admin/notifications/test")
async def send_test_email(body: TestEmailBody, _: dict = Depends(require_editor)):
    sample = {
        "first_name": "Test", "last_name": "Lead", "full_name": "Test Lead",
        "phone": "(555) 123-4567", "email": body.to, "address": "123 Demo St",
        "city": "Los Angeles", "state": "California", "zip": "90015",
        "car_year": "2023", "car_make": "Ford", "car_model": "F-150",
        "campaign_id": "CAMP123", "adgroup_id": "AG456", "ad_id": "AD789",
        "keyword": "lemon law attorney", "gclid": "TEST_GCLID",
    }
    result = send_email(
        body.to,
        subject="Test — Lemon Pros lead notification",
        html=build_internal_notification_html(sample),
    )
    if not result["ok"]:
        raise HTTPException(status_code=502, detail=f"Email send failed: {result['error']}")
    return {"success": True}


# ----------------------------- Leads -----------------------------
@api_router.get("/admin/leads")
async def admin_get_leads(
    _: dict = Depends(require_admin),
    limit: int = Query(500, ge=1, le=2000),
    skip: int = Query(0, ge=0),
    start: str = Query(""),
    end: str = Query(""),
    search: str = Query(""),
):
    search = (search or "").strip()
    if search:
        # Search by name / phone / email across ALL leads (ignore date range).
        # Phone match ignores formatting (compare digits only).
        rx = _re.escape(search)
        digits = _re.sub(r"\D", "", search)
        ors = [
            {"full_name": {"$regex": rx, "$options": "i"}},
            {"first_name": {"$regex": rx, "$options": "i"}},
            {"last_name": {"$regex": rx, "$options": "i"}},
            {"email": {"$regex": rx, "$options": "i"}},
            {"phone": {"$regex": rx, "$options": "i"}},
        ]
        if digits:
            ors.append({"phone_digits": {"$regex": _re.escape(digits)}})
        q = {"$or": ors}
    else:
        s_iso, e_iso, _days = _date_range(start, end)
        q = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    total = await db.leads.count_documents(q)
    cursor = db.leads.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    leads = await cursor.to_list(length=limit)
    return {"total": total, "leads": leads, "range": {"start": start, "end": end}}


@api_router.post("/admin/leads/test")
async def create_test_lead(_: dict = Depends(require_editor)):
    """Create a realistic sample lead so the team can practice entering revenue."""
    rng = random.Random()
    first = rng.choice(["Alex", "Jordan", "Sam", "Taylor", "Casey", "Morgan", "Riley"])
    last = rng.choice(["Johnson", "Smith", "Garcia", "Lee", "Brown", "Davis", "Miller"])
    vehicle = rng.choice([
        ("2023", "Ford", "F-150"), ("2022", "Toyota", "RAV4"), ("2024", "Honda", "Civic"),
        ("2021", "Jeep", "Grand Cherokee"), ("2023", "Tesla", "Model 3"), ("2022", "Chevrolet", "Silverado"),
    ])
    geo = rng.choice([("Los Angeles", "California", "90015"), ("Phoenix", "Arizona", "85004"),
                      ("Houston", "Texas", "77002"), ("Miami", "Florida", "33101")])
    lead = {
        "id": str(uuid.uuid4()),
        "first_name": first, "last_name": last, "full_name": f"{first} {last}",
        "email": f"{first.lower()}.{last.lower()}@example.com",
        "phone": f"(555) {rng.randint(100,999)}-{rng.randint(1000,9999)}",
        "phone_digits": "",
        "address": f"{rng.randint(100,9999)} Demo St",
        "city": geo[0], "state": geo[1], "zip": geo[2],
        "car_year": vehicle[0], "car_make": vehicle[1], "car_model": vehicle[2],
        "campaign_id": "TEST_CAMPAIGN", "adgroup_id": "TEST_ADGROUP", "ad_id": "",
        "keyword": "lemon law attorney", "gclid": "",
        "matched_rule_id": None, "is_test": True,
        "created_at": _now_iso(),
    }
    await db.leads.insert_one({**lead})
    return {"success": True, "lead": {k: v for k, v in lead.items() if k != "_id"}}


@api_router.post("/admin/data/purge-test")
async def purge_test_data(_: dict = Depends(require_editor)):
    """Delete test/mock leads AND clicks (so analytics stops showing fake campaigns
    like TEST_CAMPAIGN / {campaignid}). Matches known test campaigns, test session
    prefixes, is_test flag, and @example.com emails. Real ad traffic is untouched."""
    TEST_CAMP = ["SHOULD_BE_REMOVED", "TESTCAMP", "TEST_CAMPAIGN", "HKTEST", "{campaignid}", "{campaignid}}"]
    sess_regex = {"$regex": "^(TEST_|src-test|zapier-test|hooktest-|spam-|verify-|gbraid-|del-|ok-|hooktest)", "$options": "i"}
    clicks_q = {"$or": [{"campaign_id": {"$in": TEST_CAMP}}, {"session_id": sess_regex}]}
    leads_q = {"$or": [
        {"campaign_id": {"$in": TEST_CAMP}},
        {"session_id": sess_regex},
        {"is_test": True},
        {"email": {"$regex": r"@example\.com$", "$options": "i"}},
    ]}
    cr = await db.clicks.delete_many(clicks_q)
    lr = await db.leads.delete_many(leads_q)
    return {"success": True, "clicks_deleted": cr.deleted_count, "leads_deleted": lr.deleted_count}


def _fake_paid_click_query(campaign_id: str = "") -> dict:
    """A click is a phantom/fake PAID click when it carries a campaign tag but no
    Google click id (gclid/wbraid/gbraid) — real paid clicks always have one.
    AdsBot-Google crawling enabled campaigns is the usual source."""
    no_gid = {"$and": [
        {"$or": [{"gclid": {"$in": ["", None]}}, {"gclid": {"$exists": False}}]},
        {"$or": [{"wbraid": {"$in": ["", None]}}, {"wbraid": {"$exists": False}}]},
        {"$or": [{"gbraid": {"$in": ["", None]}}, {"gbraid": {"$exists": False}}]},
    ]}
    has_campaign = {"campaign_id": {"$nin": ["", None]}} if not campaign_id else {"campaign_id": campaign_id}
    return {"$and": [has_campaign, no_gid]}


@api_router.get("/admin/clicks/diagnose")
async def diagnose_clicks(_: dict = Depends(require_admin), campaign_id: str = Query(""),
                          start: str = Query(""), end: str = Query("")):
    """Classify clicks so the owner can see WHERE phantom traffic comes from:
    real paid (campaign + gclid), fake paid (campaign, no gclid = bot crawl),
    bot user-agent, and organic. Optionally scoped to one campaign / date range."""
    s_iso, e_iso, _ = _date_range(start, end)
    date_q = {"first_seen": {"$gte": s_iso, "$lte": e_iso}}

    total = await db.clicks.count_documents(date_q)
    bot_ua = await db.clicks.count_documents({**date_q, "user_agent": {"$regex": _BOT_UA_RE.pattern, "$options": "i"}})
    fake_paid = await db.clicks.count_documents({"$and": [date_q, _fake_paid_click_query(campaign_id)]})
    scope = {"campaign_id": campaign_id} if campaign_id else {"campaign_id": {"$nin": ["", None]}}
    paid_total = await db.clicks.count_documents({**date_q, **scope})
    real_paid = paid_total - fake_paid

    # Top user agents among the fake-paid clicks for transparency.
    top_uas = []
    async for row in db.clicks.aggregate([
        {"$match": {"$and": [date_q, _fake_paid_click_query(campaign_id)]}},
        {"$group": {"_id": "$user_agent", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 8},
    ]):
        top_uas.append({"user_agent": (row["_id"] or "(none)")[:120], "count": row["n"]})

    return {"total_clicks": total, "bot_user_agent": bot_ua,
            "paid_clicks": paid_total, "real_paid": real_paid, "fake_paid": fake_paid,
            "campaign_id": campaign_id or None, "top_fake_user_agents": top_uas}


@api_router.post("/admin/clicks/purge-bots")
async def purge_bot_clicks(_: dict = Depends(require_editor), campaign_id: str = Query(""),
                           start: str = Query(""), end: str = Query("")):
    """Permanently delete phantom clicks: any bot user-agent hit, plus paid clicks
    that have a campaign tag but no gclid/wbraid/gbraid (AdsBot crawls). Optionally
    scoped to one campaign / date range. Real paid clicks are untouched."""
    s_iso, e_iso, _ = _date_range(start, end)
    date_q = {"first_seen": {"$gte": s_iso, "$lte": e_iso}}
    query = {"$and": [date_q, {"$or": [
        {"user_agent": {"$regex": _BOT_UA_RE.pattern, "$options": "i"}},
        _fake_paid_click_query(campaign_id),
    ]}]}
    res = await db.clicks.delete_many(query)
    return {"success": True, "clicks_deleted": res.deleted_count, "campaign_id": campaign_id or None}


async def _auto_clean_bot_clicks():
    """Silently purge phantom traffic (bot user-agents + paid clicks with no
    Google click id) across all time. Called on every analytics/stats load so
    bot traffic is automatically removed and never shown."""
    try:
        await db.clicks.delete_many({"$or": [
            {"user_agent": {"$regex": _BOT_UA_RE.pattern, "$options": "i"}},
            _fake_paid_click_query(""),
        ]})
    except Exception:
        pass


@api_router.post("/admin/leads/reattribute-hooks")
async def reattribute_hooks(_: dict = Depends(require_editor)):
    """One-time backfill: align each existing lead's matched_rule_id with the hook
    its click (same session_id) was actually assigned. Fixes historical leads that
    were attributed to the wrong hook (or default) at submit time."""
    updated = 0
    async for lead in db.leads.find({}, {"id": 1, "session_id": 1, "matched_rule_id": 1}):
        sid = lead.get("session_id")
        if not sid:
            continue
        click = await db.clicks.find_one({"session_id": sid}, {"matched_rule_id": 1})
        if click is not None and "matched_rule_id" in click and click.get("matched_rule_id") != lead.get("matched_rule_id"):
            await db.leads.update_one({"id": lead["id"]}, {"$set": {"matched_rule_id": click.get("matched_rule_id")}})
            updated += 1
    return {"success": True, "updated": updated}


@api_router.delete("/admin/leads/{lead_id}")
async def delete_lead(lead_id: str, _: dict = Depends(require_editor)):
    """Permanently delete a lead from the database."""
    res = await db.leads.delete_one({"id": lead_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True}


# ---------------- Phone calls (CallTrackingMetrics webhook) ----------------
async def _auto_upload_call_conversion(call: dict):
    """Automatically upload a qualifying inbound call to Google Ads as an offline
    call-lead conversion (separate from the revenue 'Sold' action). Fires for real
    (non-test) calls that meet the minimum duration and have a gclid or phone for
    matching. Never raises; records the result on the call document."""
    try:
        if call.get("is_test"):
            return
        if not GOOGLE_ADS_CALL_CONVERSION_ACTION_ID:
            return
        duration = int(call.get("duration") or 0)
        if duration < MIN_CALL_CONVERSION_SECONDS:
            await db.calls.update_one({"id": call["id"]}, {"$set": {
                "call_conversion_status": "skipped_short",
                "call_conversion_detail": f"Call under {MIN_CALL_CONVERSION_SECONDS}s — not counted.",
            }})
            return
        lead_like = {
            "id": call.get("id"),
            "email": "",
            "phone": call.get("caller_number", ""),
            "gclid": call.get("gclid", ""),
        }
        result = await asyncio.to_thread(
            dm.upload_offline_conversion,
            lead=lead_like, value=0.0, currency="USD",
            sale_datetime=call.get("called_at"), order_id=call.get("id"),
            enhanced=True, conversion_action_id=GOOGLE_ADS_CALL_CONVERSION_ACTION_ID,
            event_source="PHONE",
        )
        await db.calls.update_one({"id": call["id"]}, {"$set": {
            "call_conversion_uploaded": bool(result.get("ok") and not result.get("validate_only")),
            "call_conversion_status": result.get("status"),
            "call_conversion_detail": result.get("detail"),
            "call_conversion_validate_only": bool(result.get("validate_only")),
            "call_conversion_last_attempt": _now_iso(),
        }})
        logger.info("Auto call conversion for %s: %s", call.get("id"), result.get("status"))
    except Exception as e:
        logger.warning("Auto call conversion failed for %s: %s", call.get("id"), e)



@api_router.post("/calls/webhook")
async def calls_webhook(request: Request, token: str = ""):
    """Receive a completed-call payload pushed by CallTrackingMetrics. Accepts JSON
    or form-urlencoded. Protected by a shared-secret ?token=. Stores a normalized
    call record shown in the Admin 'Calls' tab."""
    if not CALLS_WEBHOOK_TOKEN or token != CALLS_WEBHOOK_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    ctype = request.headers.get("content-type", "")
    if "application/json" in ctype:
        try:
            data = await request.json()
        except Exception:
            data = {}
    else:
        form = await request.form()
        data = dict(form)
    if not isinstance(data, dict):
        data = {}

    def g(*keys):
        for k in keys:
            v = data.get(k)
            if v not in (None, ""):
                return str(v)
        return ""

    try:
        duration = int(float(g("duration", "talk_time", "call_duration") or 0))
    except Exception:
        duration = 0

    now = _now_iso()
    _caller = g("caller_number", "caller_id", "from", "caller")
    rec = {
        "id": str(uuid.uuid4()),
        "caller_number": _caller,
        "caller_name": g("caller_name", "name"),
        "caller_digits": _re.sub(r"\D", "", _caller),
        "tracking_number": g("tracking_number", "called_number", "dialed_number", "to"),
        "duration": duration,
        "source": g("source"),
        "keyword": g("keyword"),
        "campaign": g("campaign", "campaign_name"),
        "gclid": g("gclid"),
        "session_id": g("session_id", "session", "sid"),
        "city": g("city"),
        "state": g("state"),
        "recording_url": g("recording_url", "recording"),
        "call_type": g("call_type", "direction", "type") or "inbound",
        "called_at": g("called_at", "timestamp", "date", "call_date") or now,
        "raw": data,
        "created_at": now,
    }
    await db.calls.insert_one({**rec})
    logger.info("Call webhook stored: %s (%ss) from %s", rec["caller_number"], duration, rec["source"])
    asyncio.create_task(_auto_upload_call_conversion(rec))
    return {"success": True, "id": rec["id"]}


async def _enrich_calls_with_hooks(items: list) -> list:
    """For each call, determine whether the caller saw the landing page and which
    hook variant they saw, by joining the call's gclid (or session_id) to a
    recorded click. Adds: saw_landing_page (bool), hook_label, hook1, hook2,
    matched_rule_id. Calls with no matching click are flagged as a direct
    'click-to-call on the ad' (no page visit)."""
    if not items:
        return items
    gclids = [c.get("gclid") for c in items if c.get("gclid")]
    sessions = [c.get("session_id") for c in items if c.get("session_id")]
    clicks_by_gclid, clicks_by_session = {}, {}
    if gclids or sessions:
        q = {"$or": []}
        if gclids:
            q["$or"].append({"gclid": {"$in": gclids}})
        if sessions:
            q["$or"].append({"session_id": {"$in": sessions}})
        async for ck in db.clicks.find(q, {"gclid": 1, "session_id": 1, "matched_rule_id": 1}):
            if ck.get("gclid"):
                clicks_by_gclid[ck["gclid"]] = ck
            if ck.get("session_id"):
                clicks_by_session[ck["session_id"]] = ck

    rules = await db.hook_rules.find({}, {"id": 1, "label": 1, "hook1": 1, "hook2": 1}).to_list(length=500)
    rule_map = {r.get("id"): r for r in rules}
    cfg = await get_or_create_config()
    default_hook = {"label": "Default hook", "hook1": cfg.get("hook1", ""), "hook2": cfg.get("hook2", "")}

    for c in items:
        ck = None
        if c.get("gclid") and c["gclid"] in clicks_by_gclid:
            ck = clicks_by_gclid[c["gclid"]]
        elif c.get("session_id") and c["session_id"] in clicks_by_session:
            ck = clicks_by_session[c["session_id"]]
        if ck is None:
            c["saw_landing_page"] = False
            c["hook_label"] = None
            c["hook1"] = None
            c["hook2"] = None
            c["matched_rule_id"] = None
        else:
            rid = ck.get("matched_rule_id")
            hook = rule_map.get(rid) if rid else default_hook
            if not hook:
                hook = default_hook
            c["saw_landing_page"] = True
            c["hook_label"] = hook.get("label") or "Default hook"
            c["hook1"] = hook.get("hook1")
            c["hook2"] = hook.get("hook2")
            c["matched_rule_id"] = rid
    return items


@api_router.get("/admin/calls")
async def admin_get_calls(start: str = "", end: str = "", search: str = Query(""), _: dict = Depends(require_admin)):
    search = (search or "").strip()
    if search:
        # Search by caller name / number across ALL calls (ignore date range).
        rx = _re.escape(search)
        digits = _re.sub(r"\D", "", search)
        ors = [
            {"caller_name": {"$regex": rx, "$options": "i"}},
            {"caller_number": {"$regex": rx, "$options": "i"}},
        ]
        if digits:
            ors.append({"caller_digits": {"$regex": _re.escape(digits)}})
        q = {"$or": ors}
    else:
        s_iso, e_iso, _d = _date_range(start, end)
        q = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    docs = await db.calls.find(q).sort("created_at", -1).to_list(2000)
    items = [{k: v for k, v in c.items() if k != "_id"} for c in docs]
    items = await _enrich_calls_with_hooks(items)
    return {"calls": items, "total": len(items)}


@api_router.delete("/admin/calls/{call_id}")
async def delete_call(call_id: str, _: dict = Depends(require_editor)):
    res = await db.calls.delete_one({"id": call_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"success": True}


@api_router.post("/admin/calls/test")
async def create_test_call(_: dict = Depends(require_editor)):
    """Create a realistic sample inbound call (with a sample GCLID) so the team can
    practice the revenue-passback flow without dialing the tracking number."""
    rng = random.Random()
    name = rng.choice(["Alex Johnson", "Jordan Smith", "Sam Garcia", "Taylor Lee", "Casey Brown"])
    geo = rng.choice([("Los Angeles", "CA"), ("Phoenix", "AZ"), ("Houston", "TX"), ("Miami", "FL")])
    now = _now_iso()
    _num = f"(555) {rng.randint(100,999)}-{rng.randint(1000,9999)}"
    rec = {
        "id": str(uuid.uuid4()),
        "caller_number": _num,
        "caller_name": name,
        "caller_digits": _re.sub(r"\D", "", _num),
        "tracking_number": "(844) 335-8911",
        "duration": rng.randint(45, 320),
        "source": "google",
        "keyword": "lemon law attorney",
        "campaign": "Lemon Law LA",
        "gclid": f"TestCallGclid{rng.randint(100000,999999)}",
        "city": geo[0], "state": geo[1],
        "recording_url": "",
        "call_type": "inbound",
        "called_at": now,
        "is_test": True,
        "raw": {"test": True},
        "created_at": now,
    }
    await db.calls.insert_one({**rec})
    return {"success": True, "call": {k: v for k, v in rec.items() if k != "_id"}}



async def _upload_call_conversion(call: dict, sale: SaleBody) -> dict:
    """Pass a closed phone call back to Google Ads as an offline conversion.
    Matches on the call's gclid (from CTM / call-from-ads) and the caller's
    phone number for enhanced matching."""
    lead_like = {
        "id": call.get("id"),
        "email": "",
        "phone": call.get("caller_number", ""),
        "gclid": call.get("gclid", ""),
    }
    return await asyncio.to_thread(
        dm.upload_offline_conversion,
        lead=lead_like, value=sale.value, currency=(sale.currency or "USD"),
        sale_datetime=sale.sale_datetime, order_id=call.get("id"), enhanced=True,
    )


@api_router.post("/admin/calls/{call_id}/sold")
async def mark_call_sold(call_id: str, body: SaleBody, _: dict = Depends(require_editor)):
    """Mark a phone call as sold with a revenue value, then upload an offline
    conversion (revenue passback) to Google Ads."""
    call = await db.calls.find_one({"id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    sale_dt = body.sale_datetime or call.get("called_at") or _now_iso()
    body.sale_datetime = sale_dt
    result = await _upload_call_conversion(call, body)
    sale_fields = {
        "sale_status": "sold",
        "sale_value": float(body.value),
        "sale_currency": (body.currency or "USD").upper(),
        "sale_datetime": sale_dt,
        "sold_at": _now_iso(),
        "conversion_uploaded": bool(result.get("ok") and not result.get("validate_only")),
        "conversion_status": result.get("status"),
        "conversion_detail": result.get("detail"),
        "conversion_validate_only": bool(result.get("validate_only")),
        "conversion_last_attempt": _now_iso(),
    }
    await db.calls.update_one({"id": call_id}, {"$set": sale_fields})
    return {"success": True, "call_id": call_id, "conversion": result, **sale_fields}


@api_router.post("/admin/calls/{call_id}/conversion/retry")
async def retry_call_conversion(call_id: str, _: dict = Depends(require_editor)):
    call = await db.calls.find_one({"id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.get("sale_status") != "sold" or call.get("sale_value") is None:
        raise HTTPException(status_code=400, detail="Call is not marked as sold.")
    body = SaleBody(value=float(call.get("sale_value")), currency=call.get("sale_currency", "USD"),
                    sale_datetime=call.get("sale_datetime"))
    result = await _upload_call_conversion(call, body)
    await db.calls.update_one({"id": call_id}, {"$set": {
        "conversion_uploaded": bool(result.get("ok") and not result.get("validate_only")),
        "conversion_status": result.get("status"),
        "conversion_detail": result.get("detail"),
        "conversion_validate_only": bool(result.get("validate_only")),
        "conversion_last_attempt": _now_iso(),
    }})
    return {"success": True, "call_id": call_id, "conversion": result}


class AdLabelBody(BaseModel):
    type: str  # "campaign" | "adgroup" | "ad"
    id: str
    name: str = ""


@api_router.post("/admin/ad-labels/sync-google")
async def sync_google_ad_labels(force: bool = False, _: dict = Depends(require_editor)):
    """Pull real campaign / ad-group / ad names from the Google Ads API and store
    them as labels. Cached for 6h unless force=true. Names from Google take
    precedence; any manual labels for IDs not in Google are preserved."""
    if not gnames.is_configured():
        return {"success": False, "configured": False, "error": "Google Ads API not configured"}
    cfg = await get_or_create_config()
    last = cfg.get("ad_labels_synced_at")
    if not force and last:
        try:
            last_dt = datetime.fromisoformat(last)
            if (datetime.now(timezone.utc) - last_dt).total_seconds() < 6 * 3600:
                return {"success": True, "skipped": True, "ad_labels": cfg.get("ad_labels") or {}}
        except Exception:
            pass
    try:
        fetched = await asyncio.to_thread(gnames.fetch_names)
    except Exception as e:
        logger.warning("Google Ads name sync failed: %s", e)
        return {"success": False, "configured": True, "error": str(e)[:300]}
    labels = cfg.get("ad_labels") or {}
    for t in ("campaign", "adgroup", "ad", "sitelink"):
        merged = dict(labels.get(t) or {})
        merged.update({k: v for k, v in (fetched.get(t) or {}).items() if v})
        labels[t] = merged
    await db.site_config.update_one(
        {"_id": "singleton"},
        {"$set": {"ad_labels": labels,
                  "campaign_types": fetched.get("campaign_type") or {},
                  "live_campaigns": fetched.get("live_campaigns") or [],
                  "live_adgroups": fetched.get("live_adgroups") or [],
                  "ad_labels_synced_at": _now_iso()}},
        upsert=True,
    )
    counts = {t: len(fetched.get(t) or {}) for t in ("campaign", "adgroup", "ad", "sitelink")}
    return {"success": True, "counts": counts, "ad_labels": labels}


@api_router.post("/admin/ad-labels")
async def set_ad_label(body: AdLabelBody, _: dict = Depends(require_editor)):
    """Set (or clear) a friendly name for a campaign / ad group / ad ID, used to
    display names instead of raw numeric IDs in the analytics dashboard."""
    if body.type not in ("campaign", "adgroup", "ad"):
        raise HTTPException(status_code=400, detail="type must be campaign, adgroup or ad")
    cfg = await get_or_create_config()
    labels = cfg.get("ad_labels") or {}
    sub = dict(labels.get(body.type) or {})
    name = (body.name or "").strip()
    if name:
        sub[str(body.id)] = name
    else:
        sub.pop(str(body.id), None)
    labels[body.type] = sub
    await db.site_config.update_one({"_id": "singleton"}, {"$set": {"ad_labels": labels}}, upsert=True)
    return {"success": True, "ad_labels": labels}


async def _upload_lead_conversion(lead: dict, sale: SaleBody) -> dict:
    return await asyncio.to_thread(
        dm.upload_offline_conversion,
        lead=lead, value=sale.value, currency=(sale.currency or "USD"),
        sale_datetime=sale.sale_datetime, order_id=lead.get("id"), enhanced=True,
    )


@api_router.get("/admin/google-ads/status")
async def google_ads_status(_: dict = Depends(require_admin)):
    return dm.status()


_ga_health_cache = {"at": None, "val": None}


@api_router.get("/admin/google-ads/health")
async def google_ads_health(force: bool = False, _: dict = Depends(require_admin)):
    """Lightweight check that the Google Ads OAuth refresh token still works, so
    the dashboard can warn early if it disconnected. Cached 5 min to avoid
    hammering the token endpoint on each banner poll."""
    now = datetime.now(timezone.utc)
    cached = _ga_health_cache["val"]
    if (not force and cached is not None and _ga_health_cache["at"]
            and (now - _ga_health_cache["at"]).total_seconds() < 300):
        return cached
    val = await asyncio.to_thread(gnames.check_connection)
    _ga_health_cache["at"] = now
    _ga_health_cache["val"] = val
    return val


@api_router.get("/admin/google-ads/sitelinks")
async def google_ads_sitelinks(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    """Real sitelink performance pulled live from Google Ads for the date range."""
    s_iso, e_iso, _d = _date_range(start, end)
    if not gnames.is_configured():
        return {"connected": False, "sitelinks": []}
    try:
        cfg = await get_or_create_config()
        live = cfg.get("live_campaigns") or []
        rows = await asyncio.to_thread(gnames.fetch_sitelink_metrics, s_iso[:10], e_iso[:10], live)
        return {"connected": True, "sitelinks": rows, "scoped_campaigns": len(live)}
    except Exception as e:
        logger.warning("Sitelink metrics fetch failed: %s", e)
        return {"connected": True, "sitelinks": [], "error": str(e)[:300]}


@api_router.post("/admin/leads/{lead_id}/sold")
async def mark_lead_sold(lead_id: str, body: SaleBody, _: dict = Depends(require_editor)):
    """Mark a lead as sold with a revenue value, then upload an offline
    conversion (revenue passback) to Google Ads."""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    sale_dt = body.sale_datetime or _now_iso()
    sale_fields = {
        "sale_status": "sold",
        "sale_value": float(body.value),
        "sale_currency": (body.currency or "USD").upper(),
        "sale_datetime": sale_dt,
        "sold_at": _now_iso(),
    }
    body.sale_datetime = sale_dt
    result = await _upload_lead_conversion(lead, body)
    sale_fields["conversion_uploaded"] = bool(result.get("ok") and not result.get("validate_only"))
    sale_fields["conversion_status"] = result.get("status")
    sale_fields["conversion_detail"] = result.get("detail")
    sale_fields["conversion_validate_only"] = bool(result.get("validate_only"))
    sale_fields["conversion_last_attempt"] = _now_iso()
    await db.leads.update_one({"id": lead_id}, {"$set": sale_fields})
    return {"success": True, "lead_id": lead_id, "conversion": result, **sale_fields}


@api_router.post("/admin/leads/{lead_id}/conversion/retry")
async def retry_lead_conversion(lead_id: str, _: dict = Depends(require_editor)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.get("sale_status") != "sold" or lead.get("sale_value") is None:
        raise HTTPException(status_code=400, detail="Lead is not marked as sold.")
    body = SaleBody(value=float(lead.get("sale_value")), currency=lead.get("sale_currency", "USD"),
                    sale_datetime=lead.get("sale_datetime"))
    result = await _upload_lead_conversion(lead, body)
    await db.leads.update_one({"id": lead_id}, {"$set": {
        "conversion_uploaded": bool(result.get("ok") and not result.get("validate_only")),
        "conversion_status": result.get("status"),
        "conversion_detail": result.get("detail"),
        "conversion_validate_only": bool(result.get("validate_only")),
        "conversion_last_attempt": _now_iso(),
    }})
    return {"success": True, "lead_id": lead_id, "conversion": result}


@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    await _auto_clean_bot_clicks()
    s_iso, e_iso, _days = _date_range(start, end)
    q = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    total = await db.leads.count_documents(q)
    total_clicks = await db.clicks.count_documents({"first_seen": {"$gte": s_iso, "$lte": e_iso}})
    total_calls = await db.calls.count_documents({"created_at": {"$gte": s_iso, "$lte": e_iso}})
    conv = round((total / total_clicks * 100), 1) if total_clicks else 0.0
    return {"total_leads": total, "total_clicks": total_clicks,
            "total_calls": total_calls, "conversion_rate": conv}


# ----------------------------- Hooks (targeting merged in) -----------------------------
async def _hook_traffic(s_iso: str, e_iso: str) -> dict:
    """Per-hook clicks/leads/sold/revenue keyed by matched_rule_id (None = default)."""
    out = {}
    async for row in db.clicks.aggregate([
        {"$match": {"first_seen": {"$gte": s_iso, "$lte": e_iso}}},
        {"$group": {"_id": "$matched_rule_id", "clicks": {"$sum": 1}}},
    ]):
        out.setdefault(row["_id"], {})["clicks"] = row["clicks"]
    async for row in db.leads.aggregate([
        {"$match": {"created_at": {"$gte": s_iso, "$lte": e_iso}}},
        {"$group": {"_id": "$matched_rule_id", "leads": {"$sum": 1},
                    "sold": {"$sum": {"$cond": [{"$eq": ["$sale_status", "sold"]}, 1, 0]}},
                    "revenue": {"$sum": {"$ifNull": ["$sale_value", 0]}}}},
    ]):
        d = out.setdefault(row["_id"], {})
        d["leads"] = row["leads"]
        d["sold"] = row["sold"]
        d["revenue"] = round(row["revenue"], 2)
    return out


@api_router.get("/admin/hook-rules")
async def list_hook_rules(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query(""), lang: str = Query("en")):
    lang = "es" if (lang or "en") == "es" else "en"
    s_iso, e_iso, _days = _date_range(start, end)
    all_rules = await db.hook_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    all_rules = [r for r in all_rules if (r.get("lang") or "en") == lang]
    traffic = await _hook_traffic(s_iso, e_iso)

    def _attach(r, key):
        t = traffic.get(key, {})
        r["weight"] = r.get("weight", 50)
        r["clicks"] = t.get("clicks", 0)
        r["leads"] = t.get("leads", 0)
        r["sold"] = t.get("sold", 0)
        r["revenue"] = t.get("revenue", 0.0)
        r["conversion_rate"] = round((r["leads"] / r["clicks"] * 100), 1) if r["clicks"] else 0.0
        return r

    for r in all_rules:
        _attach(r, r.get("id"))

    # Active variants vs the "Changed / paused history" (archived/superseded).
    rules = [r for r in all_rules if not r.get("archived")]
    history = [r for r in all_rules if r.get("archived")]
    history.sort(key=lambda r: r.get("superseded_at", ""), reverse=True)

    cfg = await get_or_create_config()
    default_hook = _attach({
        "id": None, "label": "Home Page (default / catch-all)", "is_default": True,
        "hook1": cfg.get("hook1_es", "") if lang == "es" else cfg.get("hook1", ""),
        "hook2": cfg.get("hook2_es", "") if lang == "es" else cfg.get("hook2", ""),
        "match_campaign": "", "match_adgroup": "", "match_ad": "", "enabled": True, "lang": lang,
    }, None)

    return {"rules": rules, "history": history, "default": default_hook,
            "range": {"start": s_iso, "end": e_iso}}


@api_router.post("/admin/hook-rules")
async def create_hook_rule(body: HookRuleBody, _: dict = Depends(require_editor)):
    rule = body.model_dump()
    rule["lang"] = "es" if (rule.get("lang") or "en") == "es" else "en"
    rule["archived"] = False
    rule["id"] = str(uuid.uuid4())
    rule["created_at"] = _now_iso()
    rule["updated_at"] = rule["created_at"]
    await db.hook_rules.insert_one({**rule})
    return serialize_doc(rule)


@api_router.post("/admin/hook-rules/{rule_id}/revise")
async def revise_hook_rule(rule_id: str, body: HookRuleBody, _: dict = Depends(require_editor)):
    """Versioned edit: archive + pause the old variant (stats preserved) and launch
    a brand-new active variant in the same place with the updated copy."""
    old = await db.hook_rules.find_one({"id": rule_id})
    if not old:
        raise HTTPException(status_code=404, detail="Rule not found")
    new = body.model_dump()
    new["lang"] = old.get("lang") or "en"
    new["enabled"] = True
    new["archived"] = False
    new["id"] = str(uuid.uuid4())
    new["created_at"] = _now_iso()
    new["updated_at"] = new["created_at"]
    new["revised_from"] = rule_id
    await db.hook_rules.insert_one({**new})
    await db.hook_rules.update_one(
        {"id": rule_id},
        {"$set": {"enabled": False, "archived": True, "superseded_at": _now_iso(), "superseded_by": new["id"]}},
    )
    return serialize_doc(new)


@api_router.post("/admin/hook-rules/{rule_id}/reactivate")
async def reactivate_hook_rule(rule_id: str, _: dict = Depends(require_editor)):
    """Bring a paused/archived (historical) variant back to active serving."""
    res = await db.hook_rules.update_one(
        {"id": rule_id},
        {"$set": {"enabled": True, "archived": False, "updated_at": _now_iso()},
         "$unset": {"superseded_at": "", "superseded_by": ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True}


@api_router.put("/admin/hook-rules/{rule_id}")
async def update_hook_rule(rule_id: str, body: HookRuleBody, _: dict = Depends(require_editor)):
    update = body.model_dump()
    update.pop("lang", None)  # language is immutable after creation
    update["updated_at"] = _now_iso()
    res = await db.hook_rules.update_one({"id": rule_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    doc = await db.hook_rules.find_one({"id": rule_id}, {"_id": 0})
    return doc


@api_router.delete("/admin/hook-rules/{rule_id}")
async def delete_hook_rule(rule_id: str, _: dict = Depends(require_editor)):
    res = await db.hook_rules.delete_one({"id": rule_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True}


@api_router.get("/admin/ad-entities")
async def ad_entities(_: dict = Depends(require_admin)):
    """Distinct campaigns / ad groups / ads captured from incoming traffic & leads,
    enriched with friendly names so the hooks UI can show names instead of IDs."""
    campaigns, adgroups, ads = {}, {}, {}
    for coll in (db.clicks, db.leads):
        async for row in coll.aggregate([
            {"$group": {"_id": {"c": "$campaign_id", "a": "$adgroup_id", "d": "$ad_id"}}}
        ]):
            c = (row["_id"].get("c") or "").strip()
            a = (row["_id"].get("a") or "").strip()
            d = (row["_id"].get("d") or "").strip()
            if c:
                campaigns[c] = True
            if a:
                adgroups[(c, a)] = True
            if a and d:
                ads[(c, a, d)] = True
    labels = (await get_or_create_config()).get("ad_labels") or {}
    cfg = await get_or_create_config()
    live_campaigns = set(cfg.get("live_campaigns") or [])
    live_adgroups = set(cfg.get("live_adgroups") or [])
    cl = labels.get("campaign") or {}
    al = labels.get("adgroup") or {}
    dl = labels.get("ad") or {}

    # When a live-campaign list has been synced from Google Ads, hide paused/removed
    # campaigns (and their ad groups/ads). If not yet synced, show everything.
    def camp_ok(c):
        return (not live_campaigns) or (c in live_campaigns)

    def ag_ok(c, a):
        if not camp_ok(c):
            return False
        return (not live_adgroups) or (a in live_adgroups)

    return {
        "campaigns": [{"campaign_id": c, "campaign_name": cl.get(c, "")} for c in sorted(campaigns) if camp_ok(c)],
        "adgroups": [{"campaign_id": c, "adgroup_id": a,
                      "campaign_name": cl.get(c, ""), "adgroup_name": al.get(a, "")}
                     for (c, a) in sorted(adgroups) if ag_ok(c, a)],
        "ads": [{"campaign_id": c, "adgroup_id": a, "ad_id": d,
                 "campaign_name": cl.get(c, ""), "adgroup_name": al.get(a, ""), "ad_name": dl.get(d, "")}
                for (c, a, d) in sorted(ads) if ag_ok(c, a)],
    }


# ----------------------------- Analytics -----------------------------
async def _agg_count(collection, group_fields: list, date_field: str, s_iso: str, e_iso: str) -> dict:
    group_id = {f: f"${f}" for f in group_fields}
    pipeline = [
        {"$match": {date_field: {"$gte": s_iso, "$lte": e_iso}}},
        {"$group": {"_id": group_id, "count": {"$sum": 1}}},
    ]
    out = {}
    async for row in collection.aggregate(pipeline):
        key = tuple((row["_id"].get(f) or "") for f in group_fields)
        out[key] = row["count"]
    return out


# A bounce = a landing visit where the visitor never engaged with the funnel,
# never converted into a lead, and only had a single page view.
BOUNCE_EXPR = {"$cond": [{"$and": [
    {"$ne": ["$engaged", True]},
    {"$ne": ["$converted", True]},
    {"$lte": [{"$ifNull": ["$visits", 1]}, 1]},
]}, 1, 0]}



async def _agg_clicks(group_fields: list, s_iso: str, e_iso: str) -> dict:
    """Clicks + bounced per group, from the clicks collection. A bounce is a
    landing visit where the visitor never engaged (did not enter the funnel),
    never converted, and had a single page view."""
    group_id = {f: f"${f}" for f in group_fields}
    pipeline = [
        {"$match": {"first_seen": {"$gte": s_iso, "$lte": e_iso}}},
        {"$group": {
            "_id": group_id,
            "clicks": {"$sum": 1},
            "bounced": {"$sum": BOUNCE_EXPR},
        }},
    ]
    out = {}
    async for row in db.clicks.aggregate(pipeline):
        key = tuple((row["_id"].get(f) or "") for f in group_fields)
        out[key] = {"clicks": row["clicks"], "bounced": row["bounced"]}
    return out


@api_router.get("/admin/analytics")
async def admin_analytics(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    await _auto_clean_bot_clicks()
    s_iso, e_iso, _days = _date_range(start, end)

    cfg = await get_or_create_config()
    # Live (ENABLED) campaign / ad-group IDs synced from Google Ads. When present,
    # analytics tables only show live campaigns and hide paused/removed ones.
    live_campaigns = set(cfg.get("live_campaigns") or [])
    live_adgroups = set(cfg.get("live_adgroups") or [])

    async def breakdown(fields: list):
        clicks = await _agg_clicks(fields, s_iso, e_iso)
        leads = await _agg_count(db.leads, fields, "created_at", s_iso, e_iso)
        keys = set(clicks) | set(leads)
        rows = []
        for k in keys:
            entry = {fields[i]: k[i] for i in range(len(fields))}
            # Hide non-live campaigns (numeric IDs from paused/removed campaigns).
            # Keep direct/untracked rows (empty campaign_id) and keep everything if
            # we don't yet have a synced live-campaign list.
            cid = entry.get("campaign_id")
            if live_campaigns and cid and cid not in live_campaigns:
                continue
            cinfo = clicks.get(k, {})
            c = cinfo.get("clicks", 0)
            bounced = cinfo.get("bounced", 0)
            lc = leads.get(k, 0)
            # A click that produced a lead is by definition not a bounce. Cap the
            # flagged-bounce count so a group with leads is never shown as a 100%
            # bounce (covers leads whose click predates the engage-tracking fix,
            # falls outside the date range, or has no stored click record).
            bounced = max(0, min(bounced, c - lc))
            entry["clicks"] = c
            entry["leads"] = lc
            entry["bounced"] = bounced
            entry["conversion_rate"] = round((lc / c * 100), 1) if c else (100.0 if lc else 0.0)
            entry["bounce_rate"] = round((bounced / c * 100), 1) if c else 0.0
            rows.append(entry)
        rows.sort(key=lambda r: (r["leads"], r["clicks"]), reverse=True)
        return rows

    # Split the untracked/direct campaign row into "Organic" (no Google click id)
    # vs "Google Ads (untracked)" (has gclid/wbraid/gbraid but no campaign id), so
    # we only call traffic "Organic" when it truly is.
    has_gid = {"$or": [
        {"$ne": [{"$ifNull": ["$gclid", ""]}, ""]},
        {"$ne": [{"$ifNull": ["$wbraid", ""]}, ""]},
        {"$ne": [{"$ifNull": ["$gbraid", ""]}, ""]},
    ]}

    async def _untracked_split():
        out = {"organic": {"clicks": 0, "bounced": 0, "leads": 0},
               "paid": {"clicks": 0, "bounced": 0, "leads": 0}}
        async for row in db.clicks.aggregate([
            {"$match": {"first_seen": {"$gte": s_iso, "$lte": e_iso}, "campaign_id": {"$in": ["", None]}}},
            {"$group": {"_id": {"$cond": [has_gid, "paid", "organic"]},
                        "clicks": {"$sum": 1},
                        "bounced": {"$sum": BOUNCE_EXPR}}},
        ]):
            b = out.get(row["_id"]) or out["organic"]
            b["clicks"] = row["clicks"]; b["bounced"] = row["bounced"]
        async for row in db.leads.aggregate([
            {"$match": {"created_at": {"$gte": s_iso, "$lte": e_iso}, "campaign_id": {"$in": ["", None]}}},
            {"$group": {"_id": {"$cond": [has_gid, "paid", "organic"]}, "leads": {"$sum": 1}}},
        ]):
            (out.get(row["_id"]) or out["organic"])["leads"] = row["leads"]
        return out

    by_campaign = await breakdown(["campaign_id"])
    split = await _untracked_split()

    def _split_row(kind, display):
        b = split[kind]
        c, lc, bounced = b["clicks"], b["leads"], b["bounced"]
        bounced = max(0, min(bounced, c - lc))
        return {"campaign_id": "", "kind": kind, "display": display,
                "clicks": c, "leads": lc, "bounced": bounced,
                "conversion_rate": round((lc / c * 100), 1) if c else (100.0 if lc else 0.0),
                "bounce_rate": round((bounced / c * 100), 1) if c else 0.0}

    by_campaign = [r for r in by_campaign if (r.get("campaign_id") or "") != ""]
    for kind, display in (("organic", "Organic"), ("paid", "Google Ads (untracked)")):
        if split[kind]["clicks"] or split[kind]["leads"]:
            by_campaign.append(_split_row(kind, display))
    by_campaign.sort(key=lambda r: (r["leads"], r["clicks"]), reverse=True)

    return {
        "by_campaign": by_campaign,
        "by_adgroup": await breakdown(["campaign_id", "adgroup_id"]),
        "by_ad": await breakdown(["campaign_id", "adgroup_id", "ad_id"]),
        "by_keyword": await breakdown(["campaign_id", "adgroup_id", "ad_id", "keyword"]),
        "by_sitelink": await breakdown(["sitelink_id"]),
        "ad_labels": cfg.get("ad_labels") or {},
        "campaign_types": cfg.get("campaign_types") or {},
        "google_ads_connected": gnames.is_configured(),
        "range": {"start": s_iso, "end": e_iso},
    }


@api_router.get("/admin/metrics")
async def admin_metrics(
    _: dict = Depends(require_admin),
    date: str = Query("", description="(legacy) single ISO date"),
    start: str = Query(""),
    end: str = Query(""),
):
    """Media-buying dashboard (Google Ads only). MOCK data seeded by the range,
    wired to fold REAL leads/revenue in once campaigns launch."""
    if date and not start and not end:
        start = end = date
    s_iso, e_iso, days = _date_range(start, end)
    date_str = (start or datetime.now(timezone.utc).date().isoformat())

    cfg = await get_or_create_config()
    rules = await db.hook_rules.find({}, {"_id": 0}).to_list(length=500)
    hook_variants = []

    def _csid(seed: str) -> str:
        return str(100000 + (abs(hash(seed)) % 900000))

    for r in rules:
        match = []
        if r.get("match_campaign"):
            match.append(f"Camp {r['match_campaign']}")
        if r.get("match_adgroup"):
            match.append(f"AdGrp {r['match_adgroup']}")
        if r.get("match_ad"):
            match.append(f"Ad {r['match_ad']}")
        hook_variants.append({
            "csid": _csid(r.get("id", r.get("label", "rule"))),
            "punch1": r.get("hook1", ""), "punch2": r.get("hook2", ""),
            "source": r.get("label") or (" · ".join(match) if match else "Rule"),
        })
    hook_variants.append({
        "csid": _csid("default-config"), "punch1": cfg.get("hook1", ""),
        "punch2": cfg.get("hook2", ""), "source": "Default (catch-all)",
    })

    # Real leads-by-(state,city) folded into GEO.
    real_geo = {}
    async for row in db.leads.aggregate([
        {"$match": {"created_at": {"$gte": s_iso, "$lte": e_iso}}},
        {"$group": {"_id": {"state": "$state", "city": "$city"}, "count": {"$sum": 1}}},
    ]):
        st = (row["_id"].get("state") or "").strip()
        ct = (row["_id"].get("city") or "").strip()
        if st and ct:
            real_geo[(st, ct)] = row["count"]

    # Real Google Ads source totals (leads + sold revenue) folded into SOURCE.
    real_dims = {}
    src_agg = await db.leads.aggregate([
        {"$match": {"created_at": {"$gte": s_iso, "$lte": e_iso}}},
        {"$group": {"_id": None, "actions": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$sale_value", 0]}}}},
    ]).to_list(1)
    if src_agg:
        real_dims["source"] = {"Google Ads": {"actions": src_agg[0]["actions"],
                                              "revenue": round(src_agg[0]["revenue"], 2)}}

    # Real leads grouped by hour-of-day (UTC) folded into the TIME breakdown.
    real_hourly: dict = {}
    async for ld in db.leads.find(
        {"created_at": {"$gte": s_iso, "$lte": e_iso}}, {"_id": 0, "created_at": 1}
    ):
        try:
            hr = datetime.fromisoformat(ld["created_at"]).hour
            real_hourly[hr] = real_hourly.get(hr, 0) + 1
        except Exception:
            continue

    return build_metrics(date_str, hook_variants, real_geo, real_dims, days=days,
                         real_hourly=real_hourly)


# Include the router in the main app
app.include_router(api_router)


@app.middleware("http")
async def no_store_admin(request: Request, call_next):
    """Force admin API responses to never be cached (browser or CDN), so the
    dashboard always reflects the latest hooks/variants/edits immediately."""
    # Capture the client's timezone offset for local-day date filtering.
    try:
        _request_tz_offset.set(int(request.query_params.get("tz_offset", 0)))
    except (TypeError, ValueError):
        _request_tz_offset.set(0)
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/admin"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        # Change history: log successful mutating admin actions (skip login + owner self-creds is logged too).
        if (request.method in ("POST", "PUT", "DELETE", "PATCH")
                and response.status_code < 400
                and not path.endswith("/admin/login")):
            uname = _username_from_request(request)
            if uname:
                await _record_activity(uname, "change", _change_label(request.method, path),
                                       request, detail=f"{request.method} {path.replace('/api', '')}")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await get_or_create_config()
    # One-time backfill: normalize caller digits on existing calls so phone
    # search + lead de-duplication also match calls captured before this field.
    try:
        async for c in db.calls.find({"caller_digits": {"$exists": False}}, {"caller_number": 1}):
            await db.calls.update_one(
                {"_id": c["_id"]},
                {"$set": {"caller_digits": _re.sub(r"\D", "", c.get("caller_number") or "")}},
            )
    except Exception as e:
        logger.error("caller_digits backfill failed: %s", e)
    # One-time backfill: give every experiment its own split entry slug
    # (split, split2, …), preferring the running one for the bare "/split".
    try:
        missing = await db.experiments.find(
            {"slug": {"$exists": False}}, {"id": 1, "created_at": 1, "status": 1}).to_list(length=1000)
        if missing:
            used = set()
            async for e in db.experiments.find({"slug": {"$exists": True}}, {"slug": 1}):
                if e.get("slug"):
                    used.add(e["slug"])

            def _gen():
                if "split" not in used:
                    used.add("split"); return "split"
                n = 2
                while f"split{n}" in used:
                    n += 1
                used.add(f"split{n}"); return f"split{n}"

            missing.sort(key=lambda d: (d.get("status") != "running", d.get("created_at") or ""))
            for d in missing:
                await db.experiments.update_one({"id": d["id"]}, {"$set": {"slug": _gen()}})
    except Exception as e:
        logger.error("experiment slug backfill failed: %s", e)
    logger.info("Lemon Pros API started")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
