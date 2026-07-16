from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, Query, BackgroundTasks, UploadFile, File, Form, Header
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import copy
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
import quickbase_service as qb
import object_storage as objstore
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
        "A UCLA graduate with a Juris Doctorate from Loyola Law School, fighting to secure the "
        "maximum refund, replacement, or cash settlement for "
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
        "The Lemon Pros has helped countless consumers hold manufacturers accountable. If you "
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


# Spanish advertorial (/spa) — same field shape as DEFAULT_PA_CONTENT, translated.
DEFAULT_SPA_CONTENT = {
    "attorney_eyebrow": "Conozca a Su Abogado",
    "attorney_name": "Michael Saeedian, Esq.",
    "attorney_title": "Abogado Fundador · The Lemon Pros · Colegio de Abogados de CA #265470",
    "attorney_award": "National Trial Lawyers — Top 40 Menores de 40",
    "attorney_bio": (
        "Michael Saeedian es un abogado de la Ley Limón de California a quien los fabricantes de "
        "autos temen. Graduado de UCLA con un Doctorado en Derecho de Loyola Law School, "
        "luchando para conseguir el máximo reembolso, reemplazo o "
        "acuerdo en efectivo para los conductores atrapados con vehículos defectuosos. Cuando envía "
        "su caso, trabaja directamente con un abogado licenciado y galardonado, no con un centro de llamadas."
    ),
    "attorney_badges": ["Top 100 Abogados Litigantes", "Calificación 5 Estrellas en Yelp", "Lead Counsel Rated", "Si No Gana, No Paga"],
    "attorney_school": "UCLA · Doctorado en Derecho, Loyola Law School, Los Ángeles",
    "settlements_eyebrow": "Acuerdos Recientes",
    "settlements": [
        {"amount": "$107,500", "label": "Mercedes GLE"},
        {"amount": "$98,000", "label": "Tesla Model Y"},
        {"amount": "$94,500", "label": "Ford F-150"},
        {"amount": "$89,000", "label": "Jeep Grand Cherokee"},
        {"amount": "$85,200", "label": "Chevy Silverado"},
        {"amount": "$79,800", "label": "Hyundai Tucson"},
        {"amount": "$76,500", "label": "Kia Sorento"},
    ],
    "settlements_disclaimer": "Los resultados anteriores no garantizan un resultado similar.",
    "settlements_cta": "Vea Si Mi Auto Califica",
    "headline": "¿Atrapado con un Vehículo Defectuoso? Podría Tener Derecho a un Reembolso, un Auto Nuevo o Dinero en Efectivo.",
    "subhead": (
        "Miles de conductores siguen pagando autos que pasan más tiempo en el taller que en la "
        "carretera. Así es como las Leyes Limón de hoy pueden obligar al fabricante a pagarle — sin "
        "ningún costo para usted."
    ),
    "body": [
        "Si su vehículo ha estado en el taller una y otra vez por el mismo problema — y todavía está "
        "bajo la garantía del fabricante — las Leyes Limón federales y estatales podrían darle derecho "
        "a un reembolso completo, un vehículo de reemplazo o un acuerdo en efectivo considerable.",
        "La mayoría de los consumidores no tienen idea de que estas protecciones existen. Los "
        "fabricantes están obligados por ley a responder por sus vehículos, y cuando no pueden reparar "
        "un defecto recurrente en un número razonable de intentos, la responsabilidad recae sobre ellos "
        "— no sobre usted. Eso puede significar recuperar todo lo que ha pagado, incluyendo su pago "
        "inicial y sus mensualidades.",
        "Recomendamos encarecidamente a cualquier conductor con problemas persistentes de motor, "
        "transmisión, sistema eléctrico, frenos o seguridad que verifique si califica. No hay costo ni "
        "obligación para averiguarlo, y todo el proceso toma menos de 60 segundos para empezar.",
    ],
    "callout_quote": (
        "Si su auto sigue fallando bajo garantía, el fabricante podría estar legalmente obligado a "
        "recomprarlo — y usted podría tener derecho a miles de dólares."
    ),
    "callout_cta": "Vea Si Mi Auto Califica",
    "qualify_heading": "¿Cómo Califico?",
    "qualify_intro": (
        "The Lemon Pros ha ayudado a innumerables consumidores a responsabilizar a los "
        "fabricantes. Si puede responder sí a cualquiera de las siguientes, debería verificar su caso hoy:"
    ),
    "qualify_items": [
        "Mi vehículo ha sido reparado varias veces por el mismo problema",
        "El problema comenzó mientras todavía estaba bajo la garantía del fabricante",
        "Mi auto ha pasado semanas en el taller o no es seguro para conducir",
        "Sigo pagando un vehículo en el que no puedo confiar",
    ],
    "step1_label": "Seleccione la Marca de Su Vehículo",
    "step2_label": "Responda unas preguntas rápidas",
    "step2_text": (
        "Averigüe en menos de 60 segundos si califica para un reembolso, reemplazo o compensación en "
        "efectivo. Es gratis y no hay ninguna obligación."
    ),
    "final_cta": "Verifique Si Su Auto Califica",
}


def _merged_spa_content(cfg: dict) -> dict:
    stored = (cfg or {}).get("spa_content") or {}
    return {**DEFAULT_SPA_CONTENT, **stored}


# Demand Gen advertorial pages (/dg English, /dgs Spanish) — same field shape,
# start as copies of the PA / Spanish-PA defaults; independently editable in CMS.
DEFAULT_DG_CONTENT = copy.deepcopy(DEFAULT_PA_CONTENT)
DEFAULT_DGS_CONTENT = copy.deepcopy(DEFAULT_SPA_CONTENT)

# All advertorial-style pages share the same editing shape.
AD_CONTENT_DEFAULTS = {
    "pa": DEFAULT_PA_CONTENT,
    "spa": DEFAULT_SPA_CONTENT,
    "dg": DEFAULT_DG_CONTENT,
    "dgs": DEFAULT_DGS_CONTENT,
}


def _merged_ad_content(cfg: dict, page: str) -> dict:
    stored = (cfg or {}).get(f"{page}_content") or {}
    return {**AD_CONTENT_DEFAULTS[page], **stored}


def _sanitize_ad_content(page: str, body: dict) -> dict:
    """Only known fields persisted; lists sanitized (matches PA/SPA save logic)."""
    allowed = set(AD_CONTENT_DEFAULTS[page].keys())
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
    return update


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
# Editable copy for the team landing pages (internally "Team Attorneys"; /tm overlay, /tm2 split).
DEFAULT_TM_CONTENT = {
    "headline_line1": "We Fight",
    "headline_line2": "For You",
    "subhead": "California's dedicated Lemon Law team — no fees unless we win.",
    "cta": "See If You Qualify",
}
DEFAULT_TM2_CONTENT = {
    "headline_line1": "We Fight",
    "headline_line2": "For You",
    "subhead": "Meet the attorney team taking on the automakers for California drivers.",
    "cta": "Check Your Vehicle",
}
PAGE_CONTENT_DEFAULTS = {
    "home": DEFAULT_HOME_CONTENT,
    "sp": DEFAULT_SP_CONTENT,
    "tm": DEFAULT_TM_CONTENT,
    "tm2": DEFAULT_TM2_CONTENT,
}


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


class CreatorRegister(BaseModel):
    name: str
    email: str
    password: str


class CreatorLogin(BaseModel):
    email: str
    password: str


class CreativeStatusBody(BaseModel):
    status: str  # approved | rejected | pending


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


class RetainedBody(BaseModel):
    """Marks a lead/call as a retained client (shows in the Retained tab)."""
    retained: bool = True
    retained_at: Optional[str] = None  # optional override date (ISO or YYYY-MM-DD)


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


# ----------------------------- Creator auth -----------------------------
def create_creator_token(creator_id: str, email: str) -> str:
    payload = {
        "sub": creator_id,
        "email": email,
        "role": "creator",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def require_creator(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = _decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") != "creator":
        raise HTTPException(status_code=403, detail="Creator access required.")
    return {"id": payload.get("sub"), "email": payload.get("email")}


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
    ("PUT", r"/admin/spa-content$", "Edited Spanish PA page content"),
    ("PUT", r"/admin/dg-content$", "Edited Demand Gen page content"),
    ("PUT", r"/admin/dgs-content$", "Edited Spanish Demand Gen page content"),
    ("POST", r"/admin/leads/[^/]+/retained$", "Updated lead retained status"),
    ("POST", r"/admin/calls/[^/]+/retained$", "Updated call retained status"),
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


@api_router.get("/spa-content")
async def get_spa_content_public():
    """Public: editable copy for the /spa Spanish advertorial page."""
    cfg = await get_or_create_config()
    return _merged_spa_content(cfg)


@api_router.get("/admin/spa-content")
async def get_spa_content_admin(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    return _merged_spa_content(cfg)


@api_router.put("/admin/spa-content")
async def update_spa_content(body: dict, _: dict = Depends(require_editor)):
    """Save Spanish-advertorial copy. Only known fields persisted; lists sanitized."""
    allowed = set(DEFAULT_SPA_CONTENT.keys())
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
        {"$set": {"spa_content": {**DEFAULT_SPA_CONTENT, **update}, "updated_at": _now_iso()}},
        upsert=True,
    )
    cfg = await get_or_create_config()
    return _merged_spa_content(cfg)


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


# ---- Demand Gen page content (/dg English, /dgs Spanish) ----
@api_router.get("/dg-content")
async def get_dg_content_public():
    cfg = await get_or_create_config()
    return _merged_ad_content(cfg, "dg")


@api_router.get("/dgs-content")
async def get_dgs_content_public():
    cfg = await get_or_create_config()
    return _merged_ad_content(cfg, "dgs")


@api_router.get("/admin/dg-content")
async def get_dg_content_admin(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    return _merged_ad_content(cfg, "dg")


@api_router.put("/admin/dg-content")
async def update_dg_content(body: dict, _: dict = Depends(require_editor)):
    update = _sanitize_ad_content("dg", body)
    await db.site_config.update_one(
        {"_id": "singleton"},
        {"$set": {"dg_content": {**DEFAULT_DG_CONTENT, **update}, "updated_at": _now_iso()}},
        upsert=True,
    )
    cfg = await get_or_create_config()
    return _merged_ad_content(cfg, "dg")


@api_router.get("/admin/dgs-content")
async def get_dgs_content_admin(_: dict = Depends(require_admin)):
    cfg = await get_or_create_config()
    return _merged_ad_content(cfg, "dgs")


@api_router.put("/admin/dgs-content")
async def update_dgs_content(body: dict, _: dict = Depends(require_editor)):
    update = _sanitize_ad_content("dgs", body)
    await db.site_config.update_one(
        {"_id": "singleton"},
        {"$set": {"dgs_content": {**DEFAULT_DGS_CONTENT, **update}, "updated_at": _now_iso()}},
        upsert=True,
    )
    cfg = await get_or_create_config()
    return _merged_ad_content(cfg, "dgs")


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


class CallClickIn(BaseModel):
    session_id: Optional[str] = ""
    source_page: Optional[str] = ""
    number: Optional[str] = ""
    gclid: Optional[str] = ""
    campaign_id: Optional[str] = ""
    adgroup_id: Optional[str] = ""
    ad_id: Optional[str] = ""
    keyword: Optional[str] = ""


@api_router.post("/track/call-click")
async def track_call_click(payload: CallClickIn, request: Request):
    """Record a phone-number TAP on a landing page (source_page + dialed number).
    Lets us attribute the resulting inbound call to the exact page even when the
    same number appears on multiple pages. Fired via sendBeacon on tel: taps."""
    if is_bot_ua(request.headers.get("user-agent", "")):
        return {"ok": True, "bot": True}
    doc = {
        "id": str(uuid.uuid4()),
        "session_id": payload.session_id or "",
        "source_page": (payload.source_page or "").lower(),
        "number": _digits10(payload.number or ""),
        "gclid": payload.gclid or "",
        "campaign_id": payload.campaign_id or "",
        "adgroup_id": payload.adgroup_id or "",
        "ad_id": payload.ad_id or "",
        "keyword": payload.keyword or "",
        "created_at": _now_iso(),
    }
    await db.call_clicks.insert_one(doc)
    return {"ok": True}



# Ordered funnel steps (must match frontend STEP_IDS).
FUNNEL_STEPS = ["year", "make", "model", "name", "phone", "email"]


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


# Maps a lead's internal source_page code to its real public landing path so the
# CRM/Zapier receives the exact URL the visitor came from (empty => site root).
CRM_SOURCE_PAGE_PATHS = {
    "home": "",       # apply.thelemonpros.com
    "sp": "sp",       # /sp  (Spanish landing)
    "lapa": "pa",     # /pa  (English PA advertorial)
    "laspa": "spa",   # /spa (Spanish PA advertorial)
    "ladg": "dg",     # /dg  (English Demand Gen)
    "ladgs": "dgs",   # /dgs (Spanish Demand Gen)
    "latm": "tm",     # /tm  (We Fight For You — overlay)
    "latm2": "tm2",   # /tm2 (We Fight For You — split)
    # Legacy codes (pre-rename) kept so any stragglers still resolve correctly.
    "dg": "dg",
    "dgs": "dgs",
    "tm": "tm",
    "tm2": "tm2",
}


def _crm_landing_page(source_page: str) -> str:
    base = "apply.thelemonpros.com"
    sp = (source_page or "home").lower()
    # Known code -> its path; unknown/custom codes fall back to the raw value.
    path = CRM_SOURCE_PAGE_PATHS.get(sp, sp)
    return f"{base}/{path}" if path else base


def _post_lead_to_crm(lead: dict):
    """Runs in a BackgroundTask. Forwards the lead to an external CRM/Zapier
    webhook when CRM_WEBHOOK_URL is configured. No-op (logged) when not set.
    Strips internal marketing-tracking fields and tags the lead source."""
    if not CRM_WEBHOOK_URL:
        return
    drop = {"campaign_id", "adgroup_id", "ad_id", "keyword", "gclid", "gbraid", "wbraid", "params", "matched_rule_id"}
    payload = {k: v for k, v in lead.items() if k not in drop}
    payload["source"] = "google ppc form"
    # Tag the exact landing page URL so the CRM/Zapier knows which funnel the lead came from.
    payload["landing_page"] = _crm_landing_page(lead.get("source_page"))
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
    resolved = await resolve_hooks(cfg, payload.campaign_id, payload.adgroup_id, payload.ad_id, seed=payload.session_id)

    lead = payload.model_dump()
    lead["id"] = str(uuid.uuid4())
    lead["source_page"] = (payload.source_page or "home").lower()
    lead["phone_digits"] = _re.sub(r"\D", "", payload.phone or "")
    lead["full_name"] = f"{payload.first_name} {payload.last_name}".strip()
    lead["city"] = payload.city or ""
    lead["state"] = payload.state or ""
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
    sources = await _experiment_sources(click_match, lead_match)
    return {"variants": variants, "winner": winner, "sources": sources}


async def _experiment_sources(click_match: dict, lead_match: dict) -> list:
    """Which campaigns / traffic sources are feeding this split test — groups the
    routed clicks (and their leads) by campaign, resolving campaign ids to names.
    Clicks with no campaign are bucketed as 'Direct / Untracked'."""
    DIRECT = "Direct / Untracked"
    cfg = await get_or_create_config()
    camp_map = {str(k): v for k, v in ((cfg.get("ad_labels") or {}).get("campaign") or {}).items() if v}

    def _label(cid):
        cid = str(cid or "").strip()
        return camp_map.get(cid, cid) if cid else DIRECT

    clicks, leads = {}, {}
    async for c in db.clicks.aggregate([
        {"$match": click_match},
        {"$group": {"_id": {"$ifNull": ["$campaign_id", ""]}, "n": {"$sum": 1}}},
    ]):
        clicks[_label(c["_id"])] = clicks.get(_label(c["_id"]), 0) + c["n"]
    async for l in db.leads.aggregate([
        {"$match": lead_match},
        {"$group": {"_id": {"$ifNull": ["$campaign_id", ""]}, "n": {"$sum": 1}}},
    ]):
        leads[_label(l["_id"])] = leads.get(_label(l["_id"]), 0) + l["n"]
    names = set(clicks) | set(leads)
    rows = [{"campaign": n, "clicks": clicks.get(n, 0), "leads": leads.get(n, 0)} for n in names]
    # Real campaigns first (by clicks), Direct/Untracked last.
    rows.sort(key=lambda r: (r["campaign"] == DIRECT, -r["clicks"], -r["leads"]))
    return rows


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


@api_router.get("/admin/experiments/{exp_id}/stats")
async def experiment_stats(exp_id: str, _: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    exp = await db.experiments.find_one({"id": exp_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    s_iso, e_iso = ("", "")
    if start or end:
        s_iso, e_iso, _d = _date_range(start, end)
    return {"stats": await _experiment_stats(exp, s_iso, e_iso)}


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

    FUNNEL_PAGES = ["home", "lapa", "laspa", "sp", "dg", "dgs", "tm", "tm2"]

    def _page(sp):
        key = _canon_page(sp) or "home"
        return key if key in FUNNEL_PAGES else "home"

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

    labels = {"home": "Home", "lapa": "PA Page", "laspa": "PA (Spanish)", "sp": "Spanish",
              "dg": "Demand Gen", "dgs": "Demand Gen (Spanish)",
              "tm": "Team Overlay", "tm2": "Team Split"}
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
    # Dedupe repeat callers by phone number (unique callers), matching the Calls
    # tab, so the funnel's phone-call volume doesn't double-count the same person.
    _call_match = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    _numbered = await db.calls.distinct("caller_number", {**_call_match, "caller_number": {"$nin": [None, ""]}})
    _unnumbered = await db.calls.count_documents({**_call_match, "$or": [{"caller_number": None}, {"caller_number": ""}, {"caller_number": {"$exists": False}}]})
    total_calls = len(_numbered) + _unnumbered

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
    click_match = {"first_seen": {"$gte": s_iso, "$lte": e_iso}}
    lead_match = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    if page != "overall":
        aliases = _CANON_TO_ALIASES.get(_canon_page(page), [page])
        click_match["source_page"] = {"$in": aliases}
        lead_match["source_page"] = {"$in": aliases}

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
    campaign_labels = ad_labels.get("campaign") or {}
    rows = []
    for cid in set(clicks) | set(leads):
        c, lc = clicks.get(cid, 0), leads.get(cid, 0)
        name = campaign_labels.get(str(cid)) or campaign_labels.get(cid) or (cid if cid else "Direct / Untracked")
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
            {"qb_name": {"$regex": rx, "$options": "i"}},
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
    cfg = await get_or_create_config()
    leads = _resolve_ad_names(leads, cfg.get("ad_labels") or {})
    return {"total": total, "leads": leads, "range": {"start": start, "end": end}}


@api_router.get("/admin/leads/origin-audit")
async def admin_leads_origin_audit(_: dict = Depends(require_admin)):
    """Read-only audit: classify every lead by whether it actually came through a
    landing page / ad click. The app never imports leads from Quickbase — leads
    are only created by the landing-page form (`POST /leads`) or the manual
    'Submit Test Lead' button — so this surfaces any legacy/anomalous records that
    have NO landing-page origin signal at all. Deletes nothing."""
    leads = await db.leads.find({}, {"_id": 0}).to_list(length=100000)
    # Sessions that have a recorded click (i.e. the visitor hit a landing page).
    sessions = [l.get("session_id") for l in leads if l.get("session_id")]
    clicked = set()
    if sessions:
        async for c in db.clicks.find({"session_id": {"$in": sessions}}, {"session_id": 1, "_id": 0}):
            if c.get("session_id"):
                clicked.add(c["session_id"])

    def classify(l):
        if l.get("is_test"):
            return "test"
        if (l.get("session_id") in clicked) or l.get("gclid") or l.get("session_id") \
                or l.get("user_agent") or l.get("ip"):
            return "landing_page"
        return "no_origin"

    summary = {"landing_page": 0, "test": 0, "no_origin": 0}
    no_origin = []
    for l in leads:
        cls = classify(l)
        summary[cls] += 1
        if cls == "no_origin":
            no_origin.append({
                "id": l.get("id"),
                "name": l.get("qb_name") or l.get("full_name") or l.get("first_name") or "—",
                "phone": l.get("phone"), "email": l.get("email"),
                "source_page": l.get("source_page"), "created_at": l.get("created_at"),
            })
    return {"total": len(leads), "summary": summary, "no_origin": no_origin}


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
    _tracking = g("tracking_number", "called_number", "dialed_number", "to")
    # Only accept calls that came through one of OUR landing-page tracking numbers.
    # Calls dialed to any other number (office lines, numbers surfaced by Quickbase,
    # etc.) are ignored so they never pollute the Calls tab or analytics.
    _grp = _call_number_group(_tracking)["number_group"]
    if _grp == "other":
        logger.info("Call webhook IGNORED (untracked number %r): not a landing-page number", _tracking)
        return {"success": True, "ignored": True}
    rec = {
        "id": str(uuid.uuid4()),
        "caller_number": _caller,
        "caller_name": g("caller_name", "name"),
        "caller_digits": _re.sub(r"\D", "", _caller),
        "tracking_number": _tracking,
        "number_group": _grp,
        "duration": duration,
        "source": g("source"),
        "keyword": g("keyword", "utm_term"),
        "campaign": g("campaign", "campaign_name", "utm_campaign", "adwords_campaign", "google_campaign", "ad_campaign"),
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
    # Resolve the campaign NAME that CTM sends (report-editor data) into the numeric
    # campaign_id that attribution keys off of, so the call isn't left "unattributed".
    if not rec.get("campaign"):
        rec["campaign"] = _deep_find_value(data, ["campaign"])
    if not rec.get("gclid"):
        rec["gclid"] = _deep_find_value(data, ["gclid"])
    try:
        _labels = (await get_or_create_config()).get("ad_labels") or {}
        _cid = _derive_campaign_id(rec, _campaign_name_to_id(_labels))
        if _cid:
            rec["campaign_id"] = _cid
            _cname = (_labels.get("campaign") or {}).get(_cid)
            if _cname and not rec.get("campaign"):
                rec["campaign"] = _cname
    except Exception as e:
        logger.warning("Call campaign_id resolve failed: %s", e)
    await db.calls.insert_one({**rec})
    logger.info("Call webhook stored: %s (%ss) from %s", rec["caller_number"], duration, rec["source"])
    asyncio.create_task(_auto_upload_call_conversion(rec))
    # Best-effort: try to attach Google Ads call type + campaign right away
    # (Google reporting lags, so the periodic loop is the reliable catch-up).
    asyncio.create_task(_enrich_calls_with_google(full=False))
    # Look up the caller's name + email in Quickbase immediately (by phone).
    asyncio.create_task(_enrich_from_quickbase(rec, db.calls))
    return {"success": True, "id": rec["id"]}


# Tracked phone numbers -> the landing pages that display them. Calls are grouped
# by the number that was DIALED (reliable for every call, unlike gclid/session
# matching which only works when the caller first visited a landing page).
CALL_NUMBER_GROUPS = [
    {"key": "home_pa", "label": "Home & PA", "display": "844-335-8911", "digits": "8443358911", "pages": ["Home (/)", "PA (/pa)"]},
    {"key": "spanish", "label": "Spanish & SPA", "display": "866-524-3722", "digits": "8665243722", "pages": ["Spanish (/sp)", "Spanish PA (/spa)"]},
    {"key": "dg", "label": "Demand Gen", "display": "833-240-9312", "digits": "8332409312", "pages": ["Demand Gen (/dg)"]},
    {"key": "dgs", "label": "Demand Gen Spanish", "display": "833-868-1802", "digits": "8338681802", "pages": ["Demand Gen Spanish (/dgs)"]},
]
_CALL_GROUP_BY_DIGITS = {g["digits"]: g for g in CALL_NUMBER_GROUPS}


def _digits10(s: str) -> str:
    d = _re.sub(r"\D", "", s or "")
    return d[-10:] if len(d) >= 10 else d


def _call_number_group(tracking_number: str) -> dict:
    g = _CALL_GROUP_BY_DIGITS.get(_digits10(tracking_number))
    if g:
        return {"number_group": g["key"], "number_group_label": g["label"], "tracked_number_display": g["display"]}
    return {"number_group": "other", "number_group_label": "Other", "tracked_number_display": (tracking_number or "")}


# Canonical landing-page codes. Over time the same page has been tagged with
# alias codes (e.g. /dg stored as both "dg" and "ladg", /pa as "pa" and "lapa"),
# which produced DUPLICATE rows in landing-page analytics. This collapses every
# alias to one canonical code so each page shows exactly one row.
_PAGE_ALIASES = {
    "pa": "lapa", "lapa": "lapa",
    "spa": "laspa", "laspa": "laspa",
    "dg": "dg", "ladg": "dg",
    "dgs": "dgs", "ladgs": "dgs",
    "tm": "tm", "latm": "tm",
    "tm2": "tm2", "latm2": "tm2",
    "sp": "sp", "home": "home",
}


def _canon_page(sp) -> str:
    sp = (sp or "").lower().strip()
    return _PAGE_ALIASES.get(sp, sp)


# Reverse map: canonical code -> every raw source_page alias that collapses to it
# (used to query clicks/leads which store the raw codes). Empty source_page is
# treated as Home.
_CANON_TO_ALIASES: dict[str, list[str]] = {}
for _raw, _canon in _PAGE_ALIASES.items():
    _CANON_TO_ALIASES.setdefault(_canon, []).append(_raw)
_CANON_TO_ALIASES.setdefault("home", []).append("")


# Landing pages that share the same tracked phone number are grouped into one row
# (calls to a shared number can't be tied to a single page). Each canonical page
# maps to its phone-number group; the group row aggregates stats and expands to
# show the per-page breakdown.
_PAGE_GROUP = {
    "home": "home_pa", "lapa": "home_pa", "tm": "home_pa", "tm2": "home_pa",
    "sp": "spanish", "laspa": "spanish",
    "dg": "dg", "dgs": "dgs",
}
_GROUP_META = {
    "home_pa": {"label": "Home, PA & Team", "number": "844-335-8911"},
    "spanish": {"label": "Spanish (/sp + /spa)", "number": "866-524-3722"},
    "dg": {"label": "Demand Gen (/dg)", "number": "833-240-9312"},
    "dgs": {"label": "Demand Gen Spanish (/dgs)", "number": "833-868-1802"},
    "direct": {"label": "Direct / Untracked", "number": ""},
}


def _page_group(cp) -> str:
    return _PAGE_GROUP.get(_canon_page(cp), "direct")


def _resolve_ad_names(items: list, ad_labels: dict) -> list:
    """Attach human-readable campaign / ad-group / ad names to each lead/call by
    looking up their numeric Google Ads IDs in the synced ad_labels map. Leaves
    the raw IDs intact (frontend falls back to the ID when no name is known)."""
    if not items:
        return items
    camp = {str(k): v for k, v in (ad_labels.get("campaign") or {}).items() if v}
    ag = {str(k): v for k, v in (ad_labels.get("adgroup") or {}).items() if v}
    ad = {str(k): v for k, v in (ad_labels.get("ad") or {}).items() if v}
    ad_size = {str(k): v for k, v in (ad_labels.get("ad_size") or {}).items() if v}
    for it in items:
        cid = str(it.get("campaign_id") or "").strip()
        agid = str(it.get("adgroup_id") or "").strip()
        adid = str(it.get("ad_id") or "").strip()
        if cid and camp.get(cid):
            it["campaign_name"] = camp[cid]
        if agid and ag.get(agid):
            it["adgroup_name"] = ag[agid]
        if adid and ad.get(adid):
            it["ad_name"] = ad[adid]
        # Display/image creatives carry a pixel size (e.g. "336x280"); surface it
        # so the UI can show Size instead of Keyword for Display leads.
        if adid and ad_size.get(adid):
            it["ad_size"] = ad_size[adid]
        # Calls store a free-text `campaign` field; resolve it when it's a numeric id.
        cval = str(it.get("campaign") or "").strip()
        if cval.isdigit() and camp.get(cval) and not it.get("campaign_name"):
            it["campaign_name"] = camp[cval]
    return items


def _campaign_name_to_id(ad_labels: dict) -> dict:
    """Reverse map: lowercased campaign NAME -> campaign id. Lets us turn the
    free-text campaign name that CallTrackingMetrics / Google send (e.g.
    "Lemon Law 2026") into the numeric id that attribution keys off of."""
    out = {}
    for cid, name in (ad_labels.get("campaign") or {}).items():
        if name:
            out[str(name).strip().lower()] = str(cid)
    return out


def _derive_campaign_id(doc: dict, name_to_id: dict) -> str:
    """Best campaign id for a call/lead: an explicit id first, then Google's
    matched id, then a reverse-lookup of the CTM/Google campaign NAME. As a final
    fallback, records that came in through a Demand Gen landing page/number are
    mapped to their Demand Gen campaign (those campaigns are paused but old
    records should still show the campaign they came from)."""
    cid = str(doc.get("campaign_id") or "").strip()
    if cid:
        return cid
    gid = str(doc.get("google_campaign_id") or "").strip()
    if gid:
        return gid
    for key in ("campaign", "google_campaign", "campaign_name"):
        name = str(doc.get(key) or "").strip().lower()
        if name and not name.isdigit() and name in name_to_id:
            return name_to_id[name]
    # Last resort: dig the campaign out of the raw CTM payload (field names vary,
    # and PMax calls never show up in Google's gclid/call_view data — the CTM
    # record is the only place the campaign lives).
    raw_name = _deep_find_value(doc.get("raw"), ["campaign"]).strip().lower()
    if raw_name:
        if raw_name.isdigit():
            return raw_name
        if raw_name in name_to_id:
            return name_to_id[raw_name]
    # Demand Gen source → Demand Gen campaign (paused, but authoritative for the
    # dedicated /dg and /dgs landing pages + their tracked numbers).
    dg_name = _demandgen_campaign_name(doc)
    if dg_name:
        return name_to_id.get(dg_name.lower(), "")
    return ""


# The dedicated Demand Gen landing pages / tracked numbers map 1:1 to their
# Google campaign (answer 1B: use the real campaign names).
_DEMANDGEN_CAMPAIGN_BY_SOURCE = {
    "dg": "Demand Gen 2026",
    "dgs": "Demand Gen 2026 Spanish",
}


def _demandgen_campaign_name(doc: dict) -> str:
    """Demand Gen campaign name for a call/lead sourced from a Demand Gen page,
    or "" if it didn't come from one. Calls carry `number_group` (dg/dgs); leads
    carry `source_page` (dg/ladg/dgs/ladgs, normalized via _canon_page)."""
    grp = str(doc.get("number_group") or "").lower()
    if grp in _DEMANDGEN_CAMPAIGN_BY_SOURCE:
        return _DEMANDGEN_CAMPAIGN_BY_SOURCE[grp]
    sp = _canon_page(doc.get("source_page"))
    if sp in _DEMANDGEN_CAMPAIGN_BY_SOURCE:
        return _DEMANDGEN_CAMPAIGN_BY_SOURCE[sp]
    return ""


def _deep_find_value(obj, key_substrings, _depth=0):
    """Recursively search a nested dict/list for the first scalar value whose KEY
    contains any of the given substrings (case-insensitive). Used to pull the
    campaign / gclid out of CTM's raw webhook payload regardless of exact naming.
    Skips id-like keys so we get the campaign NAME, not a numeric id."""
    if _depth > 6 or obj is None:
        return ""
    if isinstance(obj, dict):
        for k, v in obj.items():
            kl = str(k).lower()
            if any(s in kl for s in key_substrings) and "id" not in kl.replace("gclid", "") \
                    and isinstance(v, (str, int, float)) and str(v).strip():
                return str(v).strip()
        for v in obj.values():
            found = _deep_find_value(v, key_substrings, _depth + 1)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _deep_find_value(v, key_substrings, _depth + 1)
            if found:
                return found
    return ""


async def _backfill_attribution() -> dict:
    """Fill in missing campaign_id on past calls & leads using the campaign name
    CTM/Google already recorded (report-editor data, incl. the raw payload).
    Idempotent."""
    cfg = await get_or_create_config()
    name_to_id = _campaign_name_to_id(cfg.get("ad_labels") or {})
    if not name_to_id:
        return {"updated": 0, "reason": "no campaign labels synced yet"}
    updated = 0
    miss = {"$and": [
        {"$or": [{"campaign_id": {"$in": ["", None]}}, {"campaign_id": {"$exists": False}}]},
        {"campaign_cleared": {"$ne": True}},
    ]}
    for coll in (db.calls, db.leads):
        async for doc in coll.find(miss, {"id": 1, "campaign_id": 1, "campaign": 1,
                                          "campaign_name": 1, "google_campaign": 1,
                                          "google_campaign_id": 1, "raw": 1,
                                          "number_group": 1, "source_page": 1, "_id": 0}):
            cid = _derive_campaign_id(doc, name_to_id)
            if cid:
                await coll.update_one({"id": doc.get("id")}, {"$set": {"campaign_id": cid}})
                updated += 1
    logger.info("Attribution backfill: set campaign_id on %s calls/leads", updated)
    return {"updated": updated}


def _match_call_tap(taps_by_digits: dict, call: dict):
    """Match an inbound call to the most recent phone-number TAP on the same dialed
    number, within a time window before the call (tap → call latency). Returns the
    tap doc (with source_page) or None."""
    d = _digits10(call.get("tracking_number"))
    lst = taps_by_digits.get(d)
    if not lst:
        return None
    ct = _parse_dt_epoch(call.get("created_at") or call.get("called_at"))
    if ct is None:
        return None
    best = None
    for tp in lst:  # sorted ascending by time; keep the latest that qualifies
        tt = _parse_dt_epoch(tp.get("created_at"))
        if tt is None:
            continue
        # Tap should occur shortly BEFORE the call connects (allow 2 min of clock
        # skew after, up to 30 min before).
        if tt <= ct + 120 and (ct - tt) <= 1800:
            best = tp
    return best



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
        async for ck in db.clicks.find(q, {"gclid": 1, "session_id": 1, "matched_rule_id": 1, "source_page": 1,
                                            "campaign_id": 1, "adgroup_id": 1, "ad_id": 1, "keyword": 1,
                                            "landing_path": 1, "first_seen": 1, "last_seen": 1, "visits": 1}):
            if ck.get("gclid"):
                clicks_by_gclid[ck["gclid"]] = ck
            if ck.get("session_id"):
                clicks_by_session[ck["session_id"]] = ck

    rules = await db.hook_rules.find({}, {"id": 1, "label": 1, "hook1": 1, "hook2": 1}).to_list(length=500)
    rule_map = {r.get("id"): r for r in rules}
    cfg = await get_or_create_config()
    default_hook = {"label": "Default hook", "hook1": cfg.get("hook1", ""), "hook2": cfg.get("hook2", "")}

    # Fallback attribution: recorded phone-number TAPS (call_clicks) let us tie a
    # call to the exact landing page it was dialed from, even on shared numbers.
    call_digits = {_digits10(c.get("tracking_number")) for c in items if c.get("tracking_number")}
    call_digits.discard("")
    taps_by_digits = {}
    if call_digits:
        async for tp in db.call_clicks.find(
            {"number": {"$in": list(call_digits)}},
            {"number": 1, "source_page": 1, "created_at": 1, "campaign_id": 1, "adgroup_id": 1, "ad_id": 1, "keyword": 1},
        ):
            taps_by_digits.setdefault(tp["number"], []).append(tp)
        for lst in taps_by_digits.values():
            lst.sort(key=lambda x: x.get("created_at") or "")

    for c in items:
        c.update(_call_number_group(c.get("tracking_number")))
        ck = None
        if c.get("gclid") and c["gclid"] in clicks_by_gclid:
            ck = clicks_by_gclid[c["gclid"]]
        elif c.get("session_id") and c["session_id"] in clicks_by_session:
            ck = clicks_by_session[c["session_id"]]
        if ck is None:
            # No page-visit click record. Try a recorded phone TAP on a page
            # (exact source_page, even for shared numbers). Else it's a true
            # direct click-to-call from the ad.
            tap = _match_call_tap(taps_by_digits, c)
            if tap is not None:
                sp = (tap.get("source_page") or "").lower()
                c["saw_landing_page"] = False
                c["hook_label"] = None
                c["hook1"] = None
                c["hook2"] = None
                c["matched_rule_id"] = None
                c["source_page"] = sp
                c["is_spanish"] = sp in ("sp", "laspa")
                c["tapped_from_page"] = True
                if tap.get("campaign_id") and not c.get("campaign_id"):
                    c["campaign_id"] = tap["campaign_id"]
                if tap.get("adgroup_id") and not c.get("adgroup_id"):
                    c["adgroup_id"] = tap["adgroup_id"]
                if tap.get("ad_id") and not c.get("ad_id"):
                    c["ad_id"] = tap["ad_id"]
                if tap.get("keyword") and not c.get("keyword"):
                    c["keyword"] = tap["keyword"]
            else:
                c["saw_landing_page"] = False
                c["hook_label"] = None
                c["hook1"] = None
                c["hook2"] = None
                c["matched_rule_id"] = None
                c["source_page"] = None
                c["is_spanish"] = False
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
            sp = (ck.get("source_page") or "").lower()
            c["source_page"] = sp
            c["is_spanish"] = sp in ("sp", "laspa")
            # Carry the click's Google Ads attribution onto the call so click-to-call
            # calls show the campaign / ad group they came from (resolved to names later).
            if ck.get("campaign_id"):
                c["campaign_id"] = ck["campaign_id"]
            if ck.get("adgroup_id"):
                c["adgroup_id"] = ck["adgroup_id"]
            if ck.get("ad_id"):
                c["ad_id"] = ck["ad_id"]
            if ck.get("keyword") and not c.get("keyword"):
                c["keyword"] = ck["keyword"]
            # Landing page they were on + their last click/visit time before calling.
            c["landing_path"] = ck.get("landing_path") or ""
            c["first_click_at"] = ck.get("first_seen") or ""
            c["last_click_at"] = ck.get("last_seen") or ""
            c["click_visits"] = ck.get("visits") or 1
    return items


# ---- Google Ads call-detail matching -------------------------------------
# Google's call_view report only exposes the caller's AREA CODE + timestamp
# (never the full number), so we enrich our CTM calls by matching on
# area code + call start time (within a window) + duration. Matched calls get
# Google's real call type + campaign attached and a "Verified via Google Ads" flag.
_GCALL_TIME_WINDOW_S = 21600  # +/- 6h — Google truncates call_view start time (to the hour) and long calls drift; duration is the primary discriminator


def _parse_dt_epoch(value):
    """Parse an ISO/Google datetime string to a UTC epoch (float) or None."""
    if not value:
        return None
    s = str(value).strip().replace(" ", "T", 1)
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None


async def _enrich_calls_with_google(full: bool = False) -> dict:
    """Match Google Ads call_view records to stored CTM calls and attach Google's
    call type + campaign. Fuzzy match on area code + start time + duration.
    When full=False only the last 3 days of calls are (re)matched (fast, used on
    new-call ingestion + periodic loop); full=True re-scans from the first call."""
    if not gnames.is_configured():
        return {"success": False, "configured": False, "matched": 0}

    # Determine the CTM calls we want to enrich.
    if full:
        first = await db.calls.find_one({}, sort=[("created_at", 1)])
        if not first:
            return {"success": True, "matched": 0, "google_rows": 0}
        start_dt = datetime.fromisoformat(first["created_at"]) if first.get("created_at") else (datetime.now(timezone.utc) - timedelta(days=90))
    else:
        start_dt = datetime.now(timezone.utc) - timedelta(days=3)
    start_date = (start_dt.astimezone(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    end_date = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

    try:
        g_rows = await asyncio.to_thread(gnames.fetch_call_views, start_date, end_date)
    except Exception as e:
        logger.warning("Google call_view fetch failed: %s", e)
        return {"success": False, "configured": True, "matched": 0, "error": str(e)[:300]}

    # Pre-compute epoch for each google row.
    for r in g_rows:
        r["_epoch"] = _parse_dt_epoch(r.get("start_call_date_time"))

    # EXACT attribution first: map gclid -> campaign from Google's click data. Any
    # call carrying a gclid (Google "Ad / click-to-call") gets its true campaign
    # with no fuzzy matching.
    gclid_map = {}
    try:
        gclid_map = await asyncio.to_thread(gnames.fetch_gclid_campaigns, start_date, end_date)
    except Exception as e:
        logger.info("gclid->campaign fetch skipped: %s", e)

    q = {"is_test": {"$ne": True}, "created_at": {"$gte": start_dt.astimezone(timezone.utc).isoformat()}}
    calls = await db.calls.find(q).to_list(5000)
    matched = 0
    gclid_matched = 0
    used = set()  # google rows already claimed
    for c in calls:
        # 1) Exact gclid match.
        gclid = str(c.get("gclid") or "").strip()
        if gclid and gclid in gclid_map:
            gm = gclid_map[gclid]
            set_fields = {"google_campaign": gm["campaign_name"], "google_campaign_id": gm["campaign_id"],
                          "google_matched": True, "google_matched_at": _now_iso()}
            if not str(c.get("campaign_id") or "").strip():
                set_fields["campaign_id"] = gm["campaign_id"]
            await db.calls.update_one({"id": c["id"]}, {"$set": set_fields})
            matched += 1
            gclid_matched += 1
            continue
        area = _digits10(c.get("caller_number"))[:3]
        c_epoch = _parse_dt_epoch(c.get("called_at") or c.get("created_at"))
        if not area or c_epoch is None:
            continue
        best, best_key = None, None
        for i, r in enumerate(g_rows):
            if i in used or r.get("_epoch") is None:
                continue
            if r.get("caller_area_code") != area:
                continue
            gap = abs(r["_epoch"] - c_epoch)
            if gap > _GCALL_TIME_WINDOW_S:
                continue
            # Match key = area code (already filtered) + CLOSEST duration, then
            # closest time. Duration is the primary discriminator because it's a
            # near-unique fingerprint; time is only accurate to the hour (Google
            # truncates it) so it's the tiebreaker.
            dur_diff = abs(int(r.get("duration") or 0) - int(c.get("duration") or 0))
            key = (dur_diff, gap)
            if best_key is None or key < best_key:
                best, best_key, best_i = r, key, i
        if best is None:
            continue
        used.add(best_i)
        set_fields = {
            "google_matched": True,
            "google_call_type": best.get("type") or "",
            "google_call_status": best.get("status") or "",
            "google_campaign": best.get("campaign_name") or "",
            "google_campaign_id": best.get("campaign_id") or "",
            "google_matched_at": _now_iso(),
        }
        # Google's matched campaign becomes the attribution id when we don't already
        # have one, so the call stops showing as "unattributed".
        if not str(c.get("campaign_id") or "").strip() and best.get("campaign_id"):
            set_fields["campaign_id"] = str(best.get("campaign_id"))
        await db.calls.update_one({"id": c["id"]}, {"$set": set_fields})
        matched += 1
    if matched:
        logger.info("Google call match: enriched %s of %s calls (%s via gclid, %s google rows)", matched, len(calls), gclid_matched, len(g_rows))
    return {"success": True, "matched": matched, "gclid_matched": gclid_matched,
            "google_rows": len(g_rows), "gclids_seen": len(gclid_map), "scanned_calls": len(calls)}



@api_router.post("/admin/calls/sync-google")
async def admin_sync_google_calls(_: dict = Depends(require_editor)):
    """Force a full match of Google Ads call details onto stored CTM calls."""
    res = await _enrich_calls_with_google(full=True)
    if not res.get("configured", True):
        raise HTTPException(status_code=400, detail="Google Ads API is not configured")
    # Then resolve any campaign NAMES into attribution ids across calls & leads.
    backfill = await _backfill_attribution()
    res["attribution_backfilled"] = backfill.get("updated", 0)
    return res


@api_router.post("/admin/attribution/backfill")
async def admin_backfill_attribution(_: dict = Depends(require_editor)):
    """Fill missing campaign_id on past calls & leads from the campaign name that
    CTM/Google already recorded, so historical records stop showing 'unattributed'."""
    return await _backfill_attribution()


@api_router.get("/admin/campaigns")
async def admin_list_campaigns(_: dict = Depends(require_admin)):
    """List Google campaigns (id + name) for the manual campaign picker.
    Only currently ENABLED (live) campaigns are offered — paused/removed ones
    linger in the cumulative ad_labels map (kept for historical attribution) but
    should not be pickable. Also excludes [E]/[M] variants the owner doesn't use."""
    cfg = await get_or_create_config()
    camp = (cfg.get("ad_labels") or {}).get("campaign") or {}
    live = set(str(x) for x in (cfg.get("live_campaigns") or []))
    items = [{"id": str(k), "name": v} for k, v in camp.items()
             if v and not _re.search(r"\[(?:E|M)\]\s*$", v, _re.I)
             and (not live or str(k) in live)]
    items.sort(key=lambda x: (x["name"] or "").lower())
    return {"campaigns": items}


@api_router.post("/admin/{kind}/{item_id}/campaign")
async def admin_set_campaign(kind: str, item_id: str, body: dict, _: dict = Depends(require_editor)):
    """Manually assign / correct the campaign on a lead or call from its detail
    dialog. Accepts a campaign_id and/or a campaign_name (typed or picked)."""
    if kind not in ("leads", "calls"):
        raise HTTPException(status_code=404, detail="Unknown kind")
    coll = db.leads if kind == "leads" else db.calls
    cfg = await get_or_create_config()
    camp_map = {str(k): v for k, v in ((cfg.get("ad_labels") or {}).get("campaign") or {}).items()}
    name_to_id = _campaign_name_to_id(cfg.get("ad_labels") or {})
    cid = str(body.get("campaign_id") or "").strip()
    cname = str(body.get("campaign_name") or "").strip()
    # Clear/delete the campaign attribution entirely. `campaign_cleared` stops the
    # attribution backfill from silently re-filling it (incl. the Demand Gen rule).
    if body.get("clear"):
        clear_fields = {"campaign_id": "", "campaign_name": "", "campaign": "",
                        "google_campaign_id": "", "campaign_manual": False,
                        "campaign_cleared": True}
        res = await coll.update_one({"id": item_id}, {"$set": clear_fields})
        if not res.matched_count:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"success": True, "campaign_id": "", "campaign_name": ""}
    if not cid and cname:
        cid = name_to_id.get(cname.lower(), "")
    if cid and not cname:
        cname = camp_map.get(cid, "")
    if not cid and not cname:
        raise HTTPException(status_code=400, detail="Provide a campaign name or id")
    res = await coll.update_one({"id": item_id}, {"$set": {
        "campaign_id": cid, "campaign_name": cname, "campaign_manual": True,
        "campaign_cleared": False}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, "campaign_id": cid, "campaign_name": cname}


@api_router.get("/admin/calls")
async def admin_get_calls(start: str = "", end: str = "", search: str = Query(""), _: dict = Depends(require_admin)):
    search = (search or "").strip()
    if search:
        # Search by caller name / number across ALL calls (ignore date range).
        rx = _re.escape(search)
        digits = _re.sub(r"\D", "", search)
        ors = [
            {"caller_name": {"$regex": rx, "$options": "i"}},
            {"qb_name": {"$regex": rx, "$options": "i"}},
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
    # Defensive read-time guard: only surface calls dialed to one of our tracked
    # landing-page numbers. Ingestion already filters these out, but this hides any
    # legacy/untracked docs that predate the webhook filter.
    items = [c for c in items if (c.get("number_group") or "other") != "other"]
    cfg = await get_or_create_config()
    items = _resolve_ad_names(items, cfg.get("ad_labels") or {})
    return {"calls": items, "total": len(items)}


_HOURLY_TZ = "America/Los_Angeles"


def _hour_label(h: int) -> str:
    ampm = "am" if h < 12 else "pm"
    hr = h % 12
    if hr == 0:
        hr = 12
    return f"{hr}{ampm}"


def _to_pacific_hour(value: str):
    """Parse a timestamp (ISO, 'YYYY-MM-DD HH:MM:SS', US date, or unix epoch) and
    return its hour (0-23) in Pacific time, or None if it can't be parsed."""
    if value is None or value == "":
        return None
    from zoneinfo import ZoneInfo
    dt = None
    raw = str(value).strip()
    # Unix epoch (seconds or milliseconds)
    if raw.isdigit():
        try:
            ts = int(raw)
            if ts > 1e12:  # milliseconds
                ts = ts / 1000.0
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception:
            dt = None
    if dt is None:
        try:
            dt = datetime.fromisoformat(raw.replace(" ", "T", 1))
        except Exception:
            dt = None
    if dt is None:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%m/%d/%Y %I:%M:%S %p",
                    "%m/%d/%Y %I:%M %p", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M",
                    "%Y-%m-%d %H:%M", "%m/%d/%Y"):
            try:
                dt = datetime.strptime(raw, fmt)
                break
            except Exception:
                continue
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        return dt.astimezone(ZoneInfo(_HOURLY_TZ)).hour
    except Exception:
        return None


@api_router.get("/admin/analytics/hourly")
async def admin_analytics_hourly(start: str = "", end: str = "", _: dict = Depends(require_admin)):
    """Calls & leads bucketed by hour of day (Pacific time) within the date range.
    A call/lead at 8:xx is attributed to the 8am bucket. Calls use their actual
    call time (called_at); leads use submission time (created_at)."""
    s_iso, e_iso, _d = _date_range(start, end)
    calls_by_hour = [0] * 24
    leads_by_hour = [0] * 24

    calls = await db.calls.find(
        {"is_test": {"$ne": True}, "created_at": {"$gte": s_iso, "$lte": e_iso}},
        {"called_at": 1, "created_at": 1, "caller_number": 1},
    ).to_list(20000)
    # Dedupe repeat callers by phone number (unique callers), matching the Calls
    # tab. Each unique caller is bucketed by their MOST RECENT call. Calls with no
    # number count individually.
    latest, individuals = {}, []
    for c in calls:
        num = c.get("caller_number")
        if not num:
            individuals.append(c)
            continue
        t = c.get("created_at") or c.get("called_at") or ""
        prev = latest.get(num)
        if prev is None or t > (prev.get("created_at") or prev.get("called_at") or ""):
            latest[num] = c
    for c in list(latest.values()) + individuals:
        # Bucket by OUR own record of when the call arrived (created_at, reliable
        # UTC). Fall back to the CTM-provided called_at only if created_at is
        # somehow missing/unparseable.
        h = _to_pacific_hour(c.get("created_at"))
        if h is None:
            h = _to_pacific_hour(c.get("called_at"))
        if h is not None:
            calls_by_hour[h] += 1

    leads = await db.leads.find(
        {"created_at": {"$gte": s_iso, "$lte": e_iso}},
        {"created_at": 1},
    ).to_list(20000)
    for l in leads:
        h = _to_pacific_hour(l.get("created_at"))
        if h is not None:
            leads_by_hour[h] += 1

    hours = [
        {"hour": h, "label": _hour_label(h), "calls": calls_by_hour[h], "leads": leads_by_hour[h]}
        for h in range(24)
    ]
    return {
        "timezone": _HOURLY_TZ,
        "hours": hours,
        "total_calls": sum(calls_by_hour),
        "total_leads": sum(leads_by_hour),
    }


@api_router.get("/admin/analytics/vehicles")
async def admin_analytics_vehicles(start: str = "", end: str = "", _: dict = Depends(require_admin)):
    """Year × Make breakdown for leads whose intake form captured the vehicle.
    Calls from CallTrackingMetrics don't carry car_year/car_make, so this card is
    lead-form-driven. Quickbase is NOT queried here — this is 100% first-party
    data from our own leads collection."""
    s_iso, e_iso, _d = _date_range(start, end)
    leads = await db.leads.find(
        {"created_at": {"$gte": s_iso, "$lte": e_iso}},
        {"car_year": 1, "car_make": 1, "retained": 1},
    ).to_list(50000)

    def _norm_year(v):
        s = str(v or "").strip()
        # Accept 4-digit years 1980..2099. Anything else → blank.
        if len(s) == 4 and s.isdigit() and 1980 <= int(s) <= 2099:
            return s
        return ""

    def _norm_make(v):
        s = str(v or "").strip()
        if not s:
            return ""
        # Title-case so "toyota", "TOYOTA", "Toyota" merge.
        return s.title()

    by_year = {}  # year -> {leads, retained}
    by_make = {}  # make -> {leads, retained}
    matrix = {}   # (year, make) -> {leads, retained}
    total_leads = 0
    total_retained = 0
    with_vehicle = 0
    for l in leads:
        y = _norm_year(l.get("car_year"))
        m = _norm_make(l.get("car_make"))
        ret = bool(l.get("retained"))
        total_leads += 1
        if ret:
            total_retained += 1
        if not y and not m:
            continue
        with_vehicle += 1
        if y:
            b = by_year.setdefault(y, {"year": y, "leads": 0, "retained": 0})
            b["leads"] += 1
            if ret: b["retained"] += 1
        if m:
            b = by_make.setdefault(m, {"make": m, "leads": 0, "retained": 0})
            b["leads"] += 1
            if ret: b["retained"] += 1
        if y and m:
            b = matrix.setdefault((y, m), {"year": y, "make": m, "leads": 0, "retained": 0})
            b["leads"] += 1
            if ret: b["retained"] += 1

    return {
        "total_leads": total_leads,
        "total_retained": total_retained,
        "with_vehicle": with_vehicle,
        "by_year": sorted(by_year.values(), key=lambda r: r["year"]),
        "by_make": sorted(by_make.values(), key=lambda r: -r["leads"]),
        "matrix": list(matrix.values()),
    }


@api_router.get("/admin/phone-numbers")
async def admin_phone_numbers(_: dict = Depends(require_admin)):
    """The tracked phone numbers and which landing pages use each — shown in Settings."""
    return {"numbers": CALL_NUMBER_GROUPS}


@api_router.delete("/admin/calls/{call_id}")
async def delete_call(call_id: str, _: dict = Depends(require_editor)):
    res = await db.calls.delete_one({"id": call_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"success": True}


def _norm_iso(val):
    """Normalize a datetime string to ISO-with-tz; return None if unparseable/empty."""
    s = str(val or "").strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        return None


CALL_EDITABLE = {
    "caller_name", "qb_name", "caller_number", "tracked_number_display", "number_group",
    "duration", "city", "state", "keyword", "gclid", "adgroup_name", "ad_name", "called_at",
}
LEAD_EDITABLE = {
    "full_name", "qb_name", "phone", "email", "car_year", "car_make", "car_model",
    "source_page", "adgroup_name", "ad_name", "keyword", "ad_size", "gclid", "ip",
    "city", "state", "created_at",
}


@api_router.patch("/admin/calls/{call_id}")
async def update_call(call_id: str, body: dict, _: dict = Depends(require_editor)):
    if not await db.calls.find_one({"id": call_id}):
        raise HTTPException(status_code=404, detail="Call not found")
    updates = {}
    for k, v in (body or {}).items():
        if k in CALL_EDITABLE:
            updates[k] = v
    if "caller_number" in updates:
        digits = _re.sub(r"\D", "", str(updates["caller_number"] or ""))
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        if len(digits) == 10:
            updates["caller_number"] = f"({digits[0:3]}) {digits[3:6]}-{digits[6:]}"
            updates["caller_digits"] = digits
    if "number_group" in updates:
        grp = next((g for g in CALL_NUMBER_GROUPS if g["key"] == updates["number_group"]), None)
        if grp:
            updates["number_group_label"] = grp["label"]
            if not updates.get("tracked_number_display"):
                updates["tracked_number_display"] = grp["display"]
            updates["tracking_number"] = grp["display"]
        else:
            updates["number_group_label"] = "Other"
    if "duration" in updates:
        try:
            updates["duration"] = max(0, int(updates["duration"]))
        except Exception:
            updates.pop("duration", None)
    if "called_at" in updates:
        iso = _norm_iso(updates["called_at"])
        if iso:
            updates["called_at"] = iso
            updates["created_at"] = iso
        else:
            updates.pop("called_at", None)
    if updates:
        await db.calls.update_one({"id": call_id}, {"$set": updates})
    fresh = await db.calls.find_one({"id": call_id}, {"_id": 0})
    return {"success": True, "call": fresh}


@api_router.patch("/admin/leads/{lead_id}")
async def update_lead(lead_id: str, body: dict, _: dict = Depends(require_editor)):
    if not await db.leads.find_one({"id": lead_id}):
        raise HTTPException(status_code=404, detail="Lead not found")
    updates = {}
    for k, v in (body or {}).items():
        if k in LEAD_EDITABLE:
            updates[k] = v
    if "full_name" in updates:
        updates["name"] = updates["full_name"]
        parts = str(updates["full_name"] or "").split()
        updates["first_name"] = parts[0] if parts else ""
        updates["last_name"] = " ".join(parts[1:]) if len(parts) > 1 else ""
    if "created_at" in updates:
        iso = _norm_iso(updates["created_at"])
        if iso:
            updates["created_at"] = iso
        else:
            updates.pop("created_at", None)
    if updates:
        await db.leads.update_one({"id": lead_id}, {"$set": updates})
    fresh = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return {"success": True, "lead": fresh}


class TestCallBody(BaseModel):
    phone: Optional[str] = None
    name: Optional[str] = None
    tracking_number: Optional[str] = None


class ManualCallBody(BaseModel):
    """Manually add a real inbound call (e.g. a location/call-extension call that
    bypassed the tracking number) with correct campaign attribution."""
    phone: str
    name: Optional[str] = ""
    duration: Optional[int] = 0
    called_at: Optional[str] = None            # ISO or 'YYYY-MM-DDTHH:MM'
    campaign_id: Optional[str] = ""
    campaign_name: Optional[str] = ""
    number_group: Optional[str] = "home_pa"    # which tracked line it belongs to
    city: Optional[str] = ""
    state: Optional[str] = ""


@api_router.post("/admin/calls/test")
async def create_test_call(body: Optional[TestCallBody] = None, _: dict = Depends(require_editor)):
    """Create a sample inbound call so the team can practice the revenue-passback
    flow without dialing the tracking number. Optionally pass a specific phone
    number (and name) — useful to test the Quickbase name lookup."""
    rng = random.Random()
    name = (body.name or "").strip() if body else ""
    if not name:
        name = rng.choice(["Alex Johnson", "Jordan Smith", "Sam Garcia", "Taylor Lee", "Casey Brown"])
    geo = rng.choice([("Los Angeles", "CA"), ("Phoenix", "AZ"), ("Houston", "TX"), ("Miami", "FL")])
    now = _now_iso()
    custom_phone = (body.phone or "").strip() if body else ""
    if custom_phone:
        digits = _re.sub(r"\D", "", custom_phone)
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        _num = f"({digits[0:3]}) {digits[3:6]}-{digits[6:]}" if len(digits) == 10 else custom_phone
    else:
        _num = f"(555) {rng.randint(100,999)}-{rng.randint(1000,9999)}"
    _tracked = None
    if body and body.tracking_number:
        tn = _re.sub(r"\D", "", body.tracking_number)
        _tracked = next((g for g in CALL_NUMBER_GROUPS if g["digits"] == tn or g["display"] == body.tracking_number), None)
    if not _tracked:
        _tracked = rng.choice(CALL_NUMBER_GROUPS)
    rec = {
        "id": str(uuid.uuid4()),
        "caller_number": _num,
        "caller_name": name,
        "caller_digits": _re.sub(r"\D", "", _num),
        "tracking_number": _tracked["display"],
        "number_group": _tracked["key"],
        "number_group_label": _tracked["label"],
        "tracked_number_display": _tracked["display"],
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
    # If a specific phone was given, enrich from Quickbase right away so the
    # caller ID (name/email) shows — handy for testing the lookup.
    if custom_phone and qb.is_configured():
        await _enrich_from_quickbase(rec, db.calls)
    fresh = await db.calls.find_one({"id": rec["id"]}, {"_id": 0})
    return {"success": True, "call": fresh or {k: v for k, v in rec.items() if k != "_id"}}


@api_router.post("/admin/calls/manual")
async def create_manual_call(body: ManualCallBody, _: dict = Depends(require_editor)):
    """Add a REAL inbound call by hand with correct campaign attribution. Use this
    for calls that bypassed the tracking number (e.g. Google location/call
    extensions logged as 'Online Organic') so they show up attributed. Does NOT
    auto-upload a Google Ads conversion (avoids double-counting extension calls)."""
    digits = _re.sub(r"\D", "", body.phone or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit phone number.")
    num = f"({digits[0:3]}) {digits[3:6]}-{digits[6:]}"

    grp = next((g for g in CALL_NUMBER_GROUPS if g["key"] == (body.number_group or "home_pa")), CALL_NUMBER_GROUPS[0])

    cfg = await get_or_create_config()
    camp_map = {str(k): v for k, v in ((cfg.get("ad_labels") or {}).get("campaign") or {}).items()}
    name_to_id = _campaign_name_to_id(cfg.get("ad_labels") or {})
    cid = str(body.campaign_id or "").strip()
    cname = str(body.campaign_name or "").strip()
    if not cid and cname:
        cid = name_to_id.get(cname.lower(), "")
    if cid and not cname:
        cname = camp_map.get(cid, "")

    when = (body.called_at or "").strip() or _now_iso()
    try:
        # Normalize 'YYYY-MM-DDTHH:MM' (datetime-local) → ISO with tz.
        dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        when = dt.isoformat()
    except Exception:
        when = _now_iso()

    rec = {
        "id": str(uuid.uuid4()),
        "caller_number": num,
        "caller_name": (body.name or "").strip(),
        "caller_digits": digits,
        "tracking_number": grp["display"],
        "number_group": grp["key"],
        "number_group_label": grp["label"],
        "tracked_number_display": grp["display"],
        "duration": max(0, int(body.duration or 0)),
        "source": "google" if cname else "manual",
        "call_type": "inbound",
        "keyword": "",
        "gclid": "",
        "campaign_id": cid,
        "campaign_name": cname,
        "campaign": cname,
        "campaign_manual": True,
        "campaign_cleared": False,
        "google_matched": bool(cname),
        "google_campaign": cname,
        "city": (body.city or "").strip(),
        "state": (body.state or "").strip(),
        "recording_url": "",
        "called_at": when,
        "created_at": when,
        "is_test": False,
        "manual_entry": True,
    }
    await db.calls.insert_one({**rec})
    if qb.is_configured():
        try:
            await _enrich_from_quickbase(rec, db.calls)
        except Exception:
            pass
    fresh = await db.calls.find_one({"id": rec["id"]}, {"_id": 0})
    return {"success": True, "call": fresh or {k: v for k, v in rec.items() if k != "_id"}}



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
    """Manual trigger for the Google Ads name sync (also runs automatically 24/7)."""
    return await _sync_ad_labels_core(force=force)


async def _sync_ad_labels_core(force: bool = False) -> dict:
    """Pull real campaign / ad-group / ad names from the Google Ads API and store
    them as labels. Cached for 6h unless force=true. Names from Google take
    precedence; any manual labels for IDs not in Google are preserved.
    Used by both the manual endpoint and the 24/7 background sync loop."""
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
    for t in ("campaign", "adgroup", "ad", "sitelink", "ad_size"):
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


async def _ad_label_sync_loop():
    """Keeps Google Ads campaign/ad names in sync 24/7 (every 3h, force refresh)."""
    await asyncio.sleep(20)  # let the app finish booting first
    while True:
        try:
            if gnames.is_configured():
                res = await _sync_ad_labels_core(force=True)
                if res.get("success") and not res.get("skipped"):
                    logger.info("Auto-synced Google Ads names: %s", res.get("counts"))
        except Exception as e:
            logger.warning("Auto ad-label sync loop error: %s", e)
        await asyncio.sleep(3 * 3600)


async def _google_call_sync_loop():
    """Catch-up matcher for Google Ads call details. Google's call_view data lags
    behind the live call by up to a few hours, so we re-scan recent calls every
    20 minutes and attach call type + campaign as Google makes it available."""
    await asyncio.sleep(45)  # let the app finish booting first
    last_full = 0.0
    while True:
        try:
            if gnames.is_configured():
                # A full historical re-scan once a day (and on first boot) so every
                # past call gets attributed as Google's call_view data catches up;
                # a light 3-day pass every 20 min in between.
                import time as _t
                do_full = (_t.time() - last_full) > 24 * 3600
                res = await _enrich_calls_with_google(full=do_full)
                if do_full:
                    last_full = _t.time()
                if res.get("matched"):
                    logger.info("Google call sync loop matched %s calls (full=%s)", res.get("matched"), do_full)
                # Turn CTM/Google campaign names into attribution ids on any
                # call/lead still missing one (report-editor data -> admin).
                await _backfill_attribution()
        except Exception as e:
            logger.warning("Google call sync loop error: %s", e)
        await asyncio.sleep(20 * 60)


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


@api_router.get("/admin/google-ads/ad-lookup")
async def google_ads_ad_lookup(ad_id: str = Query(""), _: dict = Depends(require_admin)):
    """Resolve a single Google ad by its ID (any status), so you can see which ad
    an old/renamed lead came from. Returns current name, size, type, status,
    ad group and campaign."""
    if not gnames.is_configured():
        return {"connected": False, "found": False}
    res = await asyncio.to_thread(gnames.fetch_ad_by_id, ad_id)
    return {"connected": True, **(res or {})}



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


def _normalize_retained_at(value: Optional[str]) -> str:
    """Accept a full ISO datetime or a plain YYYY-MM-DD and return a stored ISO string."""
    if not value:
        return _now_iso()
    v = value.strip()
    if len(v) == 10:  # date only -> midday UTC (keeps range filters intuitive)
        return f"{v}T12:00:00+00:00"
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).isoformat()
    except Exception:
        return _now_iso()


async def _enrich_from_quickbase(doc: dict, collection) -> dict:
    """Look up the client's full name + email in Quickbase by phone and persist
    them onto the doc as qb_name/qb_email. Best-effort, read-only.

    IMPORTANT: only writes a name/email when Quickbase actually returns one. A
    failed / rate-limited / no-match lookup must NEVER overwrite a previously
    found name with a blank (that used to blank out good names on transient
    errors during the hourly sweep)."""
    if not qb.is_configured():
        return {}
    phone = doc.get("phone") or doc.get("caller_number") or ""
    res = await asyncio.to_thread(qb.lookup_by_phone, phone) if phone else None
    name = (res or {}).get("name", "").strip()
    fields = {"qb_lookup_at": _now_iso()}
    if name:
        fields["qb_name"] = name
        fields["qb_email"] = (res or {}).get("email", "")
        # Pull the client's real city/state from Quickbase when present so the
        # Retained "by city" view reflects the CRM address, not CTM geo/IP.
        qb_city = (res or {}).get("city", "").strip()
        qb_state = (res or {}).get("state", "").strip()
        if qb_city:
            fields["qb_city"] = qb_city
            fields["city"] = qb_city
        if qb_state:
            fields["qb_state"] = qb_state
            fields["state"] = qb_state
    # else: leave any existing qb_name/qb_email untouched (never clobber a good name)
    await collection.update_one({"id": doc["id"]}, {"$set": fields})
    doc.update(fields)
    return fields


async def _run_quickbase_sync() -> dict:
    """Re-look-up name + email from Quickbase for every lead and call (by phone).
    Returns counts. Shared by the hourly loop and the manual 'Sync now' button."""
    if not qb.is_configured():
        return {"success": False, "configured": False, "leads": 0, "calls": 0, "matched": 0}
    leads = await db.leads.find({}, {"id": 1, "phone": 1}).to_list(100000)
    calls = await db.calls.find({"is_test": {"$ne": True}}, {"id": 1, "caller_number": 1}).to_list(100000)
    docs = [(l, db.leads) for l in leads] + [(c, db.calls) for c in calls]
    matched = 0
    for i in range(0, len(docs), 8):
        batch = docs[i:i + 8]
        results = await asyncio.gather(*[_enrich_from_quickbase(d, coll) for d, coll in batch], return_exceptions=True)
        matched += sum(1 for r in results if isinstance(r, dict) and r.get("qb_name"))
    logger.info("Quickbase sync: %s leads + %s calls, %s matched to a name", len(leads), len(calls), matched)
    return {"success": True, "leads": len(leads), "calls": len(calls), "matched": matched}


async def _quickbase_sync_loop():
    """Every hour, refresh name + email from Quickbase for ALL leads and calls
    (matched by phone). Keeps the admin caller ID in sync with Quickbase edits.
    Retained items are also synced instantly at the moment they're marked."""
    await asyncio.sleep(90)  # let the app boot
    while True:
        try:
            await _run_quickbase_sync()
        except Exception as e:
            logger.warning("Quickbase sync loop error: %s", e)
        await asyncio.sleep(3600)


@api_router.post("/admin/quickbase/sync")
async def admin_quickbase_sync(_: dict = Depends(require_editor)):
    """Manually refresh name + email from Quickbase for all leads + calls now."""
    res = await _run_quickbase_sync()
    if not res.get("configured", True):
        raise HTTPException(status_code=400, detail="Quickbase is not configured")
    return res


@api_router.post("/admin/leads/{lead_id}/retained")
async def mark_lead_retained(lead_id: str, body: RetainedBody, _: dict = Depends(require_editor)):
    """Flag/unflag a lead as a retained client. Retained items appear in the Retained tab."""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    fields = {"retained": bool(body.retained),
              "retained_at": _normalize_retained_at(body.retained_at) if body.retained else None}
    await db.leads.update_one({"id": lead_id}, {"$set": fields})
    if body.retained:
        await _enrich_from_quickbase({**lead, **fields}, db.leads)
    return {"success": True, "lead_id": lead_id, **fields}


@api_router.post("/admin/calls/{call_id}/retained")
async def mark_call_retained(call_id: str, body: RetainedBody, _: dict = Depends(require_editor)):
    """Flag/unflag a call as a retained client. Retained items appear in the Retained tab."""
    call = await db.calls.find_one({"id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    fields = {"retained": bool(body.retained),
              "retained_at": _normalize_retained_at(body.retained_at) if body.retained else None}
    await db.calls.update_one({"id": call_id}, {"$set": fields})
    if body.retained:
        await _enrich_from_quickbase({**call, **fields}, db.calls)
    return {"success": True, "call_id": call_id, **fields}


@api_router.get("/admin/channels/summary")
async def admin_channels_summary(start: str = "", end: str = "", _: dict = Depends(require_admin)):
    """Per-network breakdown for the Channels tab. Google is REAL (spend from the
    Google Ads API by day; calls/leads/retained/revenue from our DB — all current
    traffic is Google). Facebook / Instagram / Native return zeros until network
    attribution goes live."""
    from datetime import date, timedelta
    if not end:
        end = date.today().isoformat()
    if not start:
        start = (date.today() - timedelta(days=29)).isoformat()
    s_iso, e_iso, _d = _date_range(start, end)

    leads_count = await db.leads.count_documents({"created_at": {"$gte": s_iso, "$lte": e_iso}})
    calls_count = await db.calls.count_documents({"is_test": {"$ne": True}, "created_at": {"$gte": s_iso, "$lte": e_iso}})
    retained_count = (await db.leads.count_documents({"retained": True, "retained_at": {"$gte": s_iso, "$lte": e_iso}})
                      + await db.calls.count_documents({"retained": True, "retained_at": {"$gte": s_iso, "$lte": e_iso}}))
    revenue = 0.0
    for coll in (db.leads, db.calls):
        async for d in coll.find({"sale_status": "sold", "created_at": {"$gte": s_iso, "$lte": e_iso}}, {"sale_value": 1, "_id": 0}):
            revenue += float(d.get("sale_value") or 0)

    spend = await asyncio.to_thread(gnames.fetch_spend_by_day, start, end)
    google = {
        "calls": calls_count, "leads": leads_count, "retained": retained_count,
        "revenue": round(revenue, 2), "spend": spend.get("total", 0.0),
        "spend_by_day": spend.get("by_day", []), "currency": spend.get("currency", "USD"),
        "live": True,
    }
    zero = {"calls": 0, "leads": 0, "retained": 0, "revenue": 0.0, "spend": 0.0, "spend_by_day": [], "live": False}
    return {"range": {"start": start, "end": end},
            "networks": {"google": google, "facebook": dict(zero), "instagram": dict(zero), "native": dict(zero)}}


@api_router.get("/admin/channels/campaigns")
async def admin_channels_campaigns(network: str = "google", start: str = "", end: str = "",
                                   _: dict = Depends(require_admin)):
    """Spend broken down by campaign for a given network (click-through from a
    Channels network card). Only Google has live spend today; other networks
    return an empty list until their attribution is switched on."""
    from datetime import date, timedelta
    if not end:
        end = date.today().isoformat()
    if not start:
        start = (date.today() - timedelta(days=29)).isoformat()
    if network != "google":
        return {"network": network, "campaigns": [], "total_spend": 0.0, "live": False}

    spend_by_campaign = await asyncio.to_thread(gnames.fetch_spend_by_campaign, start, end)
    cfg = await get_or_create_config()
    camp_names = {str(k): v for k, v in ((cfg.get("ad_labels") or {}).get("campaign") or {}).items() if v}
    campaigns = [
        {"campaign_id": str(cid), "campaign_name": camp_names.get(str(cid)) or str(cid),
         "spend": round(float(sp), 2)}
        for cid, sp in spend_by_campaign.items() if sp
    ]
    campaigns.sort(key=lambda r: r["spend"], reverse=True)
    return {"network": network, "campaigns": campaigns,
            "total_spend": round(sum(c["spend"] for c in campaigns), 2), "live": True}



@api_router.get("/admin/retained")
async def admin_get_retained(start: str = "", end: str = "", _: dict = Depends(require_admin)):
    """Combined list of every retained lead + call (your retained clients)."""
    if not start:
        start = "2000-01-01"  # default to all-time so nothing is hidden
    s_iso, e_iso, _d = _date_range(start, end)
    q = {"retained": True, "retained_at": {"$gte": s_iso, "$lte": e_iso}}
    leads = await db.leads.find(q, {"_id": 0}).sort("retained_at", -1).to_list(length=2000)
    calls = await db.calls.find(q, {"_id": 0}).sort("retained_at", -1).to_list(length=2000)
    calls = await _enrich_calls_with_hooks(calls)
    # A retained CALL often belongs to a person who ALSO submitted the lead form
    # (where the campaign/gclid attribution lives). Inherit that attribution by
    # matching phone numbers, so the Retained tab shows the real campaign.
    no_camp = [c for c in calls if not (c.get("campaign_id") or c.get("campaign_name")
                                        or c.get("campaign") or c.get("google_campaign"))]
    want = {_digits10(c.get("caller_number")) for c in no_camp if _digits10(c.get("caller_number"))}
    if want:
        lead_attr = {}
        proj = {"_id": 0, "phone": 1, "phone_digits": 1, "campaign_id": 1, "campaign_name": 1,
                "campaign": 1, "google_campaign": 1, "gclid": 1, "keyword": 1,
                "adgroup_id": 1, "adgroup_name": 1, "network": 1, "created_at": 1}
        attr_q = {"$or": [{"campaign_id": {"$nin": ["", None]}},
                          {"campaign_name": {"$nin": ["", None]}},
                          {"campaign": {"$nin": ["", None]}}]}
        async for l in db.leads.find(attr_q, proj):
            d = _digits10(l.get("phone_digits") or l.get("phone"))
            if d in want:
                cur = lead_attr.get(d)
                if not cur or (l.get("created_at") or "") > (cur.get("created_at") or ""):
                    lead_attr[d] = l
        for c in no_camp:
            l = lead_attr.get(_digits10(c.get("caller_number")))
            if l:
                for k in ("campaign_id", "campaign_name", "campaign", "google_campaign",
                          "gclid", "keyword", "adgroup_id", "adgroup_name", "network"):
                    if l.get(k) and not c.get(k):
                        c[k] = l[k]
                c["campaign_from_lead"] = True
    # Auto-fill name + email from Quickbase (by phone) for any retained item that
    # still has no name — so nameless clients (e.g. calls showing only a city)
    # get re-attempted every time the tab loads, and self-heal.
    if qb.is_configured():
        # Re-look-up any item with no name OR a junk/duplicate name (e.g.
        # "SANTA ROSA CA (Duplicate)") so stale bad names self-heal on load.
        # Also re-look-up items that have never had a Quickbase city pulled yet,
        # so the real CRM city/state backfills automatically on the Retained tab.
        def _needs_qb(x):
            n = (x.get("qb_name") or "").strip()
            no_qb_city = not (x.get("qb_city") or "").strip()
            return (not n) or ("duplicate" in n.lower()) or no_qb_city
        pending = ([(l, db.leads) for l in leads if _needs_qb(l)]
                   + [(c, db.calls) for c in calls if _needs_qb(c)])
        if pending:
            await asyncio.gather(*[_enrich_from_quickbase(doc, coll) for doc, coll in pending], return_exceptions=True)
    items = []
    for l in leads:
        items.append({
            "type": "lead", "id": l.get("id"),
            "name": l.get("qb_name") or l.get("full_name") or l.get("first_name") or "—",
            "phone": l.get("phone"), "email": l.get("email") or l.get("qb_email"),
            "qb_name": l.get("qb_name") or "", "qb_email": l.get("qb_email") or "",
            "vehicle": " ".join([str(x) for x in [l.get("car_year"), l.get("car_make"), l.get("car_model")] if x]),
            "source_page": l.get("source_page") or "home",
            "sale_status": l.get("sale_status"), "sale_value": l.get("sale_value"),
            "sale_currency": l.get("sale_currency") or "USD",
            "conversion_uploaded": bool(l.get("conversion_uploaded")),
            "conversion_status": l.get("conversion_status"),
            "conversion_validate_only": bool(l.get("conversion_validate_only")),
            "retained_at": l.get("retained_at"), "created_at": l.get("created_at"),
            "retained": True,
            # Vehicle parts + attribution for the rich detail popup
            "car_year": l.get("car_year"), "car_make": l.get("car_make"), "car_model": l.get("car_model"),
            "campaign_id": l.get("campaign_id"), "campaign_name": l.get("campaign_name"),
            "campaign": l.get("campaign"), "google_campaign": l.get("google_campaign"),
            "google_campaign_id": l.get("google_campaign_id"),
            "adgroup_id": l.get("adgroup_id"), "adgroup_name": l.get("adgroup_name"),
            "ad_id": l.get("ad_id"), "ad_name": l.get("ad_name"),
            "keyword": l.get("keyword"), "gclid": l.get("gclid"),
            "network": l.get("network"), "ip": l.get("ip"),
            "city": l.get("city"), "state": l.get("state"),
            "conversion_detail": l.get("conversion_detail"),
        })
    for c in calls:
        items.append({
            "type": "call", "id": c.get("id"),
            "name": c.get("qb_name") or c.get("caller_name") or "—",
            "phone": c.get("caller_number"), "email": c.get("qb_email"),
            "qb_name": c.get("qb_name") or "", "qb_email": c.get("qb_email") or "",
            "vehicle": "",
            "source_page": c.get("source_page") or "", "number_group_label": c.get("number_group_label"),
            "tracked_number_display": c.get("tracked_number_display"),
            "sale_status": c.get("sale_status"), "sale_value": c.get("sale_value"),
            "sale_currency": c.get("sale_currency") or "USD",
            "conversion_uploaded": bool(c.get("conversion_uploaded")),
            "conversion_status": c.get("conversion_status"),
            "conversion_validate_only": bool(c.get("conversion_validate_only")),
            "retained_at": c.get("retained_at"), "created_at": c.get("created_at"),
            "retained": True,
            # Attribution + hook/landing details for the rich detail popup
            "caller_number": c.get("caller_number"), "caller_name": c.get("caller_name"),
            "tracking_number": c.get("tracking_number"), "duration": c.get("duration"),
            "called_at": c.get("called_at"), "city": c.get("city"), "state": c.get("state"),
            "campaign_id": c.get("campaign_id"), "campaign_name": c.get("campaign_name"),
            "google_campaign": c.get("google_campaign"), "campaign": c.get("campaign"),
            "adgroup_id": c.get("adgroup_id"), "adgroup_name": c.get("adgroup_name"),
            "ad_id": c.get("ad_id"), "ad_name": c.get("ad_name"),
            "keyword": c.get("keyword"), "gclid": c.get("gclid"), "network": c.get("network"),
            "saw_landing_page": c.get("saw_landing_page"), "hook_label": c.get("hook_label"),
            "hook1": c.get("hook1"), "hook2": c.get("hook2"),
            "landing_path": c.get("landing_path"), "last_click_at": c.get("last_click_at"),
            "click_visits": c.get("click_visits"),
            "source_page": c.get("source_page"), "tapped_from_page": c.get("tapped_from_page"),
            "google_matched": c.get("google_matched"), "google_call_type": c.get("google_call_type"),
            "google_call_status": c.get("google_call_status"),
            "conversion_detail": c.get("conversion_detail"),
        })
    items.sort(key=lambda x: x.get("retained_at") or "", reverse=True)
    # Resolve numeric Google Ads IDs → campaign / ad group / ad names (same as the
    # Calls & Leads tabs) so the detail popup shows names, not raw numbers.
    cfg = await get_or_create_config()
    items = _resolve_ad_names(items, cfg.get("ad_labels") or {})
    total_revenue = round(sum(float(i.get("sale_value") or 0) for i in items if i.get("sale_status") == "sold"), 2)
    return {"items": items, "total": len(items), "lead_count": len(leads), "call_count": len(calls), "total_revenue": total_revenue}


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
    # Unique callers: repeat calls from the same number count once (matches the
    # deduped Calls tab). Calls with no caller number stay individual.
    numbered = await db.calls.distinct("caller_number", {"created_at": {"$gte": s_iso, "$lte": e_iso}, "caller_number": {"$nin": [None, ""]}})
    unnumbered = await db.calls.count_documents({"created_at": {"$gte": s_iso, "$lte": e_iso}, "$or": [{"caller_number": None}, {"caller_number": ""}, {"caller_number": {"$exists": False}}]})
    unique_callers = len(numbered) + unnumbered
    conv = round((total / total_clicks * 100), 1) if total_clicks else 0.0
    # Retained clients in range (leads + calls marked retained), matches Retained tab.
    retained_q = {"retained": True, "retained_at": {"$gte": s_iso, "$lte": e_iso}}
    retained_leads = await db.leads.count_documents(retained_q)
    retained_calls = await db.calls.count_documents(retained_q)
    return {"total_leads": total, "total_clicks": total_clicks,
            "total_calls": total_calls, "unique_callers": unique_callers, "conversion_rate": conv,
            "total_retained": retained_leads + retained_calls}


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


async def _calls_by_number(s_iso: str, e_iso: str) -> list:
    """Aggregate calls + closed revenue within a range, grouped by dialed number.
    Repeat callers are deduped by phone number (unique callers) — the most recent
    call decides the group — matching the Calls tab. Calls with no number count
    individually."""
    buckets = {g["key"]: {"key": g["key"], "label": g["label"], "display": g["display"],
                          "calls": 0, "sold": 0, "revenue": 0.0} for g in CALL_NUMBER_GROUPS}
    buckets["other"] = {"key": "other", "label": "Other", "display": "Other / untracked",
                        "calls": 0, "sold": 0, "revenue": 0.0}
    latest = {}       # caller_number -> most-recent call (representative)
    agg = {}          # caller_number -> {"sold": n, "revenue": x}
    individuals = []  # calls with no caller_number (each counts once)
    async for c in db.calls.find(
        {"created_at": {"$gte": s_iso, "$lte": e_iso}},
        {"tracking_number": 1, "sale_status": 1, "sale_value": 1, "caller_number": 1, "created_at": 1, "called_at": 1},
    ):
        sold = c.get("sale_status") == "sold"
        rev = float(c.get("sale_value") or 0) if sold else 0.0
        num = c.get("caller_number")
        if not num:
            individuals.append((c, sold, rev))
            continue
        a = agg.setdefault(num, {"sold": 0, "revenue": 0.0})
        if sold:
            a["sold"] += 1
            a["revenue"] += rev
        t = c.get("created_at") or c.get("called_at") or ""
        prev = latest.get(num)
        if prev is None or t > (prev.get("created_at") or prev.get("called_at") or ""):
            latest[num] = c

    def _add(rep, sold_count, revenue):
        grp = _call_number_group(rep.get("tracking_number"))["number_group"]
        b = buckets.get(grp) or buckets["other"]
        b["calls"] += 1
        b["sold"] += sold_count
        b["revenue"] += revenue

    for num, rep in latest.items():
        a = agg[num]
        _add(rep, 1 if a["sold"] > 0 else 0, a["revenue"])
    for c, sold, rev in individuals:
        _add(c, 1 if sold else 0, rev)
    order = [g["key"] for g in CALL_NUMBER_GROUPS] + ["other"]
    return [buckets[k] for k in order if k != "other" or buckets["other"]["calls"] > 0]


@api_router.get("/admin/analytics")
async def admin_analytics(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    await _auto_clean_bot_clicks()
    s_iso, e_iso, _days = _date_range(start, end)

    cfg = await get_or_create_config()
    # Live (ENABLED) campaign / ad-group IDs synced from Google Ads. When present,
    # analytics tables only show live campaigns and hide paused/removed ones.
    live_campaigns = set(cfg.get("live_campaigns") or [])
    live_adgroups = set(cfg.get("live_adgroups") or [])

    # Enrich all calls in range ONCE so attribution from click-matches AND phone
    # taps (campaign / ad group / ad / keyword / source_page) flows into every
    # breakdown below — not just the raw stored fields.
    _calls_in_range = await db.calls.find(
        {"created_at": {"$gte": s_iso, "$lte": e_iso}},
        {"_id": 0, "gclid": 1, "session_id": 1, "tracking_number": 1, "called_at": 1,
         "created_at": 1, "caller_number": 1, "campaign_id": 1, "adgroup_id": 1,
         "ad_id": 1, "keyword": 1, "sale_status": 1, "sale_value": 1, "retained": 1},
    ).to_list(length=20000)
    _enriched_calls = await _enrich_calls_with_hooks(_calls_in_range)

    def _agg_enriched_calls(fields):
        out = {}
        for c in _enriched_calls:
            key = tuple((c.get(f) or "") for f in fields)
            out[key] = out.get(key, 0) + 1
        return out

    async def breakdown(fields: list):
        clicks = await _agg_clicks(fields, s_iso, e_iso)
        leads = await _agg_count(db.leads, fields, "created_at", s_iso, e_iso)
        calls = _agg_enriched_calls(fields)
        keys = set(clicks) | set(leads) | set(calls)
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
            entry["calls"] = calls.get(k, 0)
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
                "clicks": c, "leads": lc, "calls": 0, "bounced": bounced,
                "conversion_rate": round((lc / c * 100), 1) if c else (100.0 if lc else 0.0),
                "bounce_rate": round((bounced / c * 100), 1) if c else 0.0}

    by_campaign = [r for r in by_campaign if (r.get("campaign_id") or "") != ""]
    for kind, display in (("organic", "Organic"), ("paid", "Google Ads (untracked)")):
        if split[kind]["clicks"] or split[kind]["leads"]:
            by_campaign.append(_split_row(kind, display))
    by_campaign.sort(key=lambda r: (r["leads"], r["clicks"]), reverse=True)

    # By landing page (source_page). Clicks + leads are stored per page. Calls are
    # attributed to a landing page by (1) the page the caller VISITED before calling
    # when known, else (2) the tracked phone NUMBER they dialed -> the primary
    # landing page that displays that number. Repeat callers count once (unique).
    # Only calls with no page and no matching tracked number are "direct calls".
    GROUP_PRIMARY_PAGE = {"home_pa": "lapa", "spanish": "laspa", "dg": "dg", "dgs": "dgs"}

    async def landing_breakdown():
        raw_clicks = await _agg_clicks(["source_page"], s_iso, e_iso)
        raw_leads = await _agg_count(db.leads, ["source_page"], "created_at", s_iso, e_iso)
        # Merge alias codes (dg/ladg, pa/lapa, ...) into one canonical row.
        clicks, leads = {}, {}
        for (sp,), info in raw_clicks.items():
            cp = _canon_page(sp)
            agg = clicks.setdefault(cp, {"clicks": 0, "bounced": 0})
            agg["clicks"] += info.get("clicks", 0)
            agg["bounced"] += info.get("bounced", 0)
        for (sp,), n in raw_leads.items():
            leads[_canon_page(sp)] = leads.get(_canon_page(sp), 0) + n
        call_docs = _enriched_calls  # already enriched (click + tap attribution)
        # Dedupe repeat callers by phone number (most recent call represents them).
        latest, individuals = {}, []
        for c in call_docs:
            num = c.get("caller_number")
            if not num:
                individuals.append(c)
                continue
            t = c.get("created_at") or c.get("called_at") or ""
            prev = latest.get(num)
            if prev is None or t > (prev.get("created_at") or prev.get("called_at") or ""):
                latest[num] = c

        def _call_page(c):
            sp = _canon_page(c.get("source_page"))
            if sp:
                return sp
            grp = _call_number_group(c.get("tracking_number"))["number_group"]
            return GROUP_PRIMARY_PAGE.get(grp)  # None if the number isn't tracked

        call_counts, direct_calls = {}, 0
        for c in list(latest.values()) + individuals:
            p = _call_page(c)
            if p:
                call_counts[p] = call_counts.get(p, 0) + 1
            else:
                direct_calls += 1
        keys = set(clicks) | set(leads) | set(call_counts)
        rows = []
        for sp in keys:
            cinfo = clicks.get(sp, {})
            c = cinfo.get("clicks", 0)
            lc = leads.get(sp, 0)
            cl = call_counts.get(sp, 0)
            bounced = max(0, min(cinfo.get("bounced", 0), c - lc))
            rows.append({
                "source_page": sp,
                "clicks": c, "leads": lc, "calls": cl, "bounced": bounced,
                "conversion_rate": round((lc / c * 100), 1) if c else (100.0 if lc else 0.0),
                "bounce_rate": round((bounced / c * 100), 1) if c else 0.0,
            })
        rows.sort(key=lambda r: (r["leads"], r["clicks"], r["calls"]), reverse=True)
        return rows, direct_calls

    by_landing_page, direct_calls = await landing_breakdown()

    # ---- Revenue / ROAS / CPL / CPA for campaigns + landing pages ----
    # Spend comes from Google (per campaign); landing-page spend is estimated by
    # allocating each campaign's spend across the pages its clicks landed on.
    spend_by_campaign = await asyncio.to_thread(gnames.fetch_spend_by_campaign, start, end)
    spend_by_adgroup = await asyncio.to_thread(gnames.fetch_spend_by_adgroup, start, end)
    lead_docs = await db.leads.find(
        {"created_at": {"$gte": s_iso, "$lte": e_iso}},
        {"_id": 0, "campaign_id": 1, "adgroup_id": 1, "ad_id": 1, "source_page": 1, "sale_status": 1, "sale_value": 1, "retained": 1},
    ).to_list(length=20000)

    def _page_of_call(c):
        sp = _canon_page(c.get("source_page"))
        if sp:
            return sp
        grp = _call_number_group(c.get("tracking_number"))["number_group"]
        return GROUP_PRIMARY_PAGE.get(grp) or ""

    rev_camp, ret_camp, rev_page, ret_page = {}, {}, {}, {}
    rev_ag, ret_ag = {}, {}  # keyed (campaign_id, adgroup_id)
    rev_ad3, ret_ad3 = {}, {}  # keyed (campaign_id, adgroup_id, ad_id)

    def _acc(d, k, v=1.0):
        if k:
            d[k] = d.get(k, 0) + v

    for l in lead_docs:
        cid, pg = l.get("campaign_id") or "", _canon_page(l.get("source_page"))
        if l.get("sale_status") == "sold":
            v = float(l.get("sale_value") or 0)
            _acc(rev_camp, cid, v); _acc(rev_page, pg, v)
            if cid:
                _acc(rev_ag, (cid, l.get("adgroup_id") or ""), v)
                _acc(rev_ad3, (cid, l.get("adgroup_id") or "", l.get("ad_id") or ""), v)
    for c in _enriched_calls:
        cid, pg = c.get("campaign_id") or "", _page_of_call(c)
        if c.get("sale_status") == "sold":
            v = float(c.get("sale_value") or 0)
            _acc(rev_camp, cid, v); _acc(rev_page, pg, v)
            if cid:
                _acc(rev_ag, (cid, c.get("adgroup_id") or ""), v)
                _acc(rev_ad3, (cid, c.get("adgroup_id") or "", c.get("ad_id") or ""), v)

    # Retained clients are counted by retained_at (exactly like the Retained tab) so
    # the "Retained" column reconciles with it. Attribute each to its campaign /
    # landing page (calls are enriched for click + tap attribution). Retained items
    # with no campaign roll into an "Unattributed / Direct" bucket.
    retained_q = {"retained": True, "retained_at": {"$gte": s_iso, "$lte": e_iso}}
    ret_lead_docs = await db.leads.find(
        retained_q, {"_id": 0, "campaign_id": 1, "adgroup_id": 1, "ad_id": 1, "source_page": 1}).to_list(length=20000)
    ret_call_docs = await _enrich_calls_with_hooks(await db.calls.find(
        retained_q,
        {"_id": 0, "gclid": 1, "session_id": 1, "tracking_number": 1, "called_at": 1,
         "created_at": 1, "caller_number": 1, "campaign_id": 1, "adgroup_id": 1,
         "ad_id": 1, "keyword": 1, "source_page": 1}).to_list(length=20000))
    ret_unattr = 0
    for r in ret_lead_docs:
        cid, pg = r.get("campaign_id") or "", _canon_page(r.get("source_page"))
        if cid:
            ret_camp[cid] = ret_camp.get(cid, 0) + 1
            k = (cid, r.get("adgroup_id") or "")
            ret_ag[k] = ret_ag.get(k, 0) + 1
            k3 = (cid, r.get("adgroup_id") or "", r.get("ad_id") or "")
            ret_ad3[k3] = ret_ad3.get(k3, 0) + 1
        else:
            ret_unattr += 1
        _acc(ret_page, pg)
    for r in ret_call_docs:
        cid, pg = r.get("campaign_id") or "", _page_of_call(r)
        if cid:
            ret_camp[cid] = ret_camp.get(cid, 0) + 1
            k = (cid, r.get("adgroup_id") or "")
            ret_ag[k] = ret_ag.get(k, 0) + 1
            k3 = (cid, r.get("adgroup_id") or "", r.get("ad_id") or "")
            ret_ad3[k3] = ret_ad3.get(k3, 0) + 1
        else:
            ret_unattr += 1
        _acc(ret_page, pg)

    # Allocate campaign spend across landing pages by click share.
    cp_clicks = await _agg_clicks(["campaign_id", "source_page"], s_iso, e_iso)
    camp_click_totals = {}
    for (cid, _sp), info in cp_clicks.items():
        camp_click_totals[cid] = camp_click_totals.get(cid, 0) + info.get("clicks", 0)
    spend_page = {}
    for (cid, sp), info in cp_clicks.items():
        tot, sp_spend = camp_click_totals.get(cid, 0), spend_by_campaign.get(cid, 0.0)
        if tot and sp_spend:
            cp = _canon_page(sp)
            spend_page[cp] = spend_page.get(cp, 0.0) + sp_spend * (info.get("clicks", 0) / tot)

    def _fin(spend, revenue, leads, retained):
        return {
            "spend": round(spend, 2),
            "revenue": round(revenue, 2),
            "roas": round(revenue / spend, 2) if spend > 0 else None,
            "cpl": round(spend / leads, 2) if (spend > 0 and leads > 0) else None,
            "cpa": round(spend / retained, 2) if (spend > 0 and retained > 0) else None,
            "retained": int(retained),
        }

    for r in by_campaign:
        cid = r.get("campaign_id") or ""
        contacts = r.get("leads", 0) + r.get("calls", 0)
        r.update(_fin(spend_by_campaign.get(cid, 0.0), rev_camp.get(cid, 0.0), contacts, ret_camp.get(cid, 0)))
    # Include campaigns that had Google spend but no tracked clicks/leads/calls in
    # this range (paused, PMax, or impression-only) so the Spend column reconciles
    # with the Channels total. Tagged `spend_only` so the UI can toggle them.
    live_ids = set(str(x) for x in (cfg.get("live_campaigns") or []))
    shown_now = {r.get("campaign_id") or "" for r in by_campaign}
    for cid, sp in spend_by_campaign.items():
        if cid and cid not in shown_now and sp:
            by_campaign.append({
                "campaign_id": cid, "clicks": 0, "leads": 0, "calls": 0, "bounced": 0,
                "conversion_rate": 0.0, "bounce_rate": 0.0,
                "spend_only": True, "paused": cid not in live_ids,
                **_fin(sp, rev_camp.get(cid, 0.0), 0, ret_camp.get(cid, 0)),
            })
    for r in by_landing_page:
        sp = r.get("source_page") or ""
        contacts = r.get("leads", 0) + r.get("calls", 0)
        r.update(_fin(spend_page.get(sp, 0.0), rev_page.get(sp, 0.0), contacts, ret_page.get(sp, 0)))

    # Group per-page rows by shared tracked phone number into one row each, with a
    # `pages` child list for the expandable per-page breakdown.
    def _group_landing(page_rows):
        groups = {}
        for r in page_rows:
            groups.setdefault(_page_group(r.get("source_page")), []).append(r)
        out = []
        for gkey, children in groups.items():
            meta = _GROUP_META.get(gkey, {"label": gkey, "number": ""})
            clicks = sum(c.get("clicks", 0) for c in children)
            leads = sum(c.get("leads", 0) for c in children)
            calls = sum(c.get("calls", 0) for c in children)
            bounced = sum(c.get("bounced", 0) for c in children)
            spend = sum(c.get("spend", 0) or 0 for c in children)
            revenue = sum(c.get("revenue", 0) or 0 for c in children)
            retained = sum(c.get("retained", 0) for c in children)
            out.append({
                "source_page": gkey, "label": meta["label"], "number": meta["number"],
                "clicks": clicks, "leads": leads, "calls": calls, "bounced": bounced,
                "conversion_rate": round((leads / clicks * 100), 1) if clicks else (100.0 if leads else 0.0),
                "bounce_rate": round((bounced / clicks * 100), 1) if clicks else 0.0,
                **_fin(spend, revenue, leads + calls, retained),
                "pages": sorted(children, key=lambda c: (c.get("leads", 0), c.get("clicks", 0), c.get("calls", 0)), reverse=True),
            })
        out.sort(key=lambda r: (r["leads"], r["clicks"], r["calls"]), reverse=True)
        return out

    by_landing_page = _group_landing(by_landing_page)

    # Any retained whose campaign has no row in this range (e.g. paused campaign
    # with no clicks) also can't be shown — fold it into the unattributed bucket.
    shown_camp_ids = {r.get("campaign_id") or "" for r in by_campaign}
    for cid, n in ret_camp.items():
        if cid not in shown_camp_ids:
            ret_unattr += n

    # Reconciliation row: retained clients with no campaign attribution (direct
    # calls / leads with no gclid) or whose campaign isn't shown. Ensures the
    # Retained column sums to the same total shown in the Retained tab.
    if ret_unattr:
        by_campaign.append({
            "campaign_id": "__unattributed__", "kind": "unattributed",
            "display": "Unattributed / Direct",
            "clicks": 0, "leads": 0, "calls": 0, "bounced": 0,
            "conversion_rate": 0.0, "bounce_rate": 0.0,
            **_fin(0.0, 0.0, 0, ret_unattr),
        })

    # ---- Per-ad-group financials (spend from Google, revenue/retained from DB) ----
    by_adgroup = await breakdown(["campaign_id", "adgroup_id"])
    for r in by_adgroup:
        key = (r.get("campaign_id") or "", r.get("adgroup_id") or "")
        contacts = r.get("leads", 0) + r.get("calls", 0)
        r.update(_fin(spend_by_adgroup.get(key, 0.0), rev_ag.get(key, 0.0), contacts, ret_ag.get(key, 0)))
    # Ad groups that had Google spend but no tracked clicks/leads/calls in range,
    # so per-ad-group spend reconciles with the campaign's total spend.
    shown_ag = {(r.get("campaign_id") or "", r.get("adgroup_id") or "") for r in by_adgroup}
    for (cid, agid), sp in spend_by_adgroup.items():
        if sp and (cid, agid) not in shown_ag and (not live_campaigns or cid in live_campaigns):
            by_adgroup.append({
                "campaign_id": cid, "adgroup_id": agid,
                "clicks": 0, "leads": 0, "calls": 0, "bounced": 0,
                "conversion_rate": 0.0, "bounce_rate": 0.0, "spend_only": True,
                **_fin(sp, rev_ag.get((cid, agid), 0.0), 0, ret_ag.get((cid, agid), 0)),
            })

    # ---- Per-ad Google stats (impressions / clicks / spend / video views) so
    # Display & Demand Gen campaigns show a real per-creative breakdown even
    # though their clicks rarely carry first-party tracking. ----
    ad_stats = await asyncio.to_thread(gnames.fetch_ad_stats, start, end)
    by_ad = await breakdown(["campaign_id", "adgroup_id", "ad_id"])
    for r in by_ad:
        k3 = (r.get("campaign_id") or "", r.get("adgroup_id") or "", r.get("ad_id") or "")
        st = ad_stats.get(k3, {})
        r["impressions"] = st.get("impressions", 0)
        r["google_clicks"] = st.get("google_clicks", 0)
        r["video_views"] = st.get("video_views", 0)
        contacts = r.get("leads", 0) + r.get("calls", 0)
        r.update(_fin(st.get("spend", 0.0), rev_ad3.get(k3, 0.0), contacts, ret_ad3.get(k3, 0)))
    shown_ads = {(r.get("campaign_id") or "", r.get("adgroup_id") or "", r.get("ad_id") or "") for r in by_ad}
    for k3, st in ad_stats.items():
        cid = k3[0]
        if k3 in shown_ads or not (st.get("impressions") or st.get("spend")):
            continue
        if live_campaigns and cid not in live_campaigns:
            continue
        by_ad.append({
            "campaign_id": cid, "adgroup_id": k3[1], "ad_id": k3[2],
            "clicks": 0, "leads": 0, "calls": 0, "bounced": 0,
            "conversion_rate": 0.0, "bounce_rate": 0.0, "spend_only": True,
            "impressions": st.get("impressions", 0), "google_clicks": st.get("google_clicks", 0),
            "video_views": st.get("video_views", 0),
            **_fin(st.get("spend", 0.0), rev_ad3.get(k3, 0.0), 0, ret_ad3.get(k3, 0)),
        })
    by_ad.sort(key=lambda r: (r.get("leads", 0), r.get("clicks", 0), r.get("impressions", 0)), reverse=True)

    return {
        "by_campaign": by_campaign,
        "by_landing_page": by_landing_page,
        "direct_calls": direct_calls,
        "by_adgroup": by_adgroup,
        "by_ad": by_ad,
        "by_video": await asyncio.to_thread(gnames.fetch_video_stats, start, end),
        "by_keyword": await breakdown(["campaign_id", "adgroup_id", "ad_id", "keyword"]),
        "by_sitelink": await breakdown(["sitelink_id"]),
        "calls_by_number": await _calls_by_number(s_iso, e_iso),
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


# ----------------------------- Creator Portal + Creatives -----------------------------
DISPLAY_SIZES = ["300x250", "728x90", "160x600", "300x600", "320x50", "970x250", "336x280"]
_VIDEO_EXTS = {"mp4", "mov", "webm", "avi", "m4v", "mpeg", "mpg"}
_IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "svg", "html", "zip"}
_CONTENT_TYPES = {
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm", "avi": "video/x-msvideo",
    "m4v": "video/x-m4v", "mpeg": "video/mpeg", "mpg": "video/mpeg",
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
    "webp": "image/webp", "svg": "image/svg+xml", "html": "text/html", "zip": "application/zip",
}


def _creative_public(doc: dict) -> dict:
    if not doc:
        return doc
    return {
        "id": doc.get("id"),
        "type": doc.get("type"),
        "title": doc.get("title"),
        "notes": doc.get("notes", ""),
        "size": doc.get("size", ""),
        "status": doc.get("status", "pending"),
        "creator_id": doc.get("creator_id"),
        "creator_name": doc.get("creator_name", ""),
        "original_filename": doc.get("original_filename", ""),
        "content_type": doc.get("content_type", ""),
        "created_at": doc.get("created_at"),
        "reviewed_at": doc.get("reviewed_at"),
    }


@api_router.post("/creator/register")
async def creator_register(body: CreatorRegister):
    email = (body.email or "").strip().lower()
    name = (body.name or "").strip()
    if not email or not name or not body.password:
        raise HTTPException(status_code=400, detail="Name, email and password are required.")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if await db.creators.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    creator = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "password_hash": _hash_pw(body.password),
        "created_at": _now_iso(),
    }
    await db.creators.insert_one(creator)
    token = create_creator_token(creator["id"], email)
    return {"token": token, "creator": {"id": creator["id"], "name": name, "email": email}}


@api_router.post("/creator/login")
async def creator_login(body: CreatorLogin):
    email = (body.email or "").strip().lower()
    creator = await db.creators.find_one({"email": email})
    if not creator or not _verify_pw(body.password, creator.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_creator_token(creator["id"], email)
    return {"token": token, "creator": {"id": creator["id"], "name": creator.get("name", ""), "email": email}}


@api_router.get("/creator/me")
async def creator_me(creator: dict = Depends(require_creator)):
    doc = await db.creators.find_one({"id": creator["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found.")
    return {"id": doc["id"], "name": doc.get("name", ""), "email": doc.get("email", "")}


@api_router.post("/creator/creatives")
async def creator_upload_creative(
    creator: dict = Depends(require_creator),
    file: UploadFile = File(...),
    type: str = Form(...),
    title: str = Form(...),
    notes: str = Form(""),
    size: str = Form(""),
):
    ctype = (type or "").strip().lower()
    if ctype not in ("video", "display"):
        raise HTTPException(status_code=400, detail="Type must be 'video' or 'display'.")
    if not (title or "").strip():
        raise HTTPException(status_code=400, detail="Title is required.")
    if ctype == "display" and size not in DISPLAY_SIZES:
        raise HTTPException(status_code=400, detail="A valid display ad size is required.")

    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin").lower()
    allowed = _VIDEO_EXTS if ctype == "video" else _IMAGE_EXTS
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type .{ext} for a {ctype} ad.")

    data = await file.read()
    content_type = file.content_type or _CONTENT_TYPES.get(ext, "application/octet-stream")
    path = f"{objstore.APP_NAME}/creatives/{creator['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = objstore.put_object(path, data, content_type)
    except Exception as e:
        logger.error("Creative upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Upload failed. Please try again.")

    acct = await db.creators.find_one({"id": creator["id"]}, {"name": 1})
    doc = {
        "id": str(uuid.uuid4()),
        "creator_id": creator["id"],
        "creator_name": (acct or {}).get("name", ""),
        "type": ctype,
        "title": title.strip(),
        "notes": (notes or "").strip(),
        "size": size if ctype == "display" else "",
        "status": "pending",
        "storage_path": result["path"],
        "original_filename": file.filename or "",
        "content_type": content_type,
        "size_bytes": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": _now_iso(),
        "reviewed_at": None,
    }
    await db.creatives.insert_one(doc)
    return _creative_public(doc)


@api_router.get("/creator/creatives")
async def creator_list_creatives(creator: dict = Depends(require_creator)):
    cur = db.creatives.find({"creator_id": creator["id"], "is_deleted": {"$ne": True}}).sort("created_at", -1)
    rows = await cur.to_list(500)
    return {"creatives": [_creative_public(r) for r in rows]}


@api_router.get("/admin/creatives")
async def admin_list_creatives(_: dict = Depends(require_admin), type: str = Query("")):
    q = {"is_deleted": {"$ne": True}}
    if type in ("video", "display"):
        q["type"] = type
    cur = db.creatives.find(q).sort("created_at", -1)
    rows = await cur.to_list(1000)
    return {"creatives": [_creative_public(r) for r in rows]}


@api_router.post("/admin/creatives/{creative_id}/status")
async def admin_set_creative_status(creative_id: str, body: CreativeStatusBody, _: dict = Depends(require_editor)):
    status = (body.status or "").strip().lower()
    if status not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="Invalid status.")
    res = await db.creatives.update_one(
        {"id": creative_id},
        {"$set": {"status": status, "reviewed_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Creative not found.")
    doc = await db.creatives.find_one({"id": creative_id})
    return _creative_public(doc)


@api_router.get("/creatives/{creative_id}/file")
async def creative_file(
    creative_id: str,
    authorization: Optional[str] = Header(None),
    auth: str = Query(""),
):
    """Serve a creative's file. Accepts a bearer token via header or ?auth= query
    (needed for <img>/<video> tags). Any valid admin or creator token is allowed."""
    token = auth or (authorization.split(" ", 1)[1] if authorization and authorization.lower().startswith("bearer ") else "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        _decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    doc = await db.creatives.find_one({"id": creative_id, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Creative not found.")
    try:
        data, content_type = objstore.get_object(doc["storage_path"])
    except Exception as e:
        logger.error("Creative fetch failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not load file.")
    return Response(content=data, media_type=doc.get("content_type") or content_type)



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
    # One-time cleanup: keep ONLY calls that came through our landing-page tracking
    # numbers. Delete calls dialed to any other number (office lines / Quickbase-
    # sourced numbers) and backfill number_group on the ones we keep, so the Calls
    # tab and all analytics reflect only real tracked-number calls.
    try:
        _to_delete = []
        # Only scan calls not yet tagged with a number_group (legacy rows). New
        # calls are tagged/rejected at ingestion, so this is a no-op after the
        # first run.
        async for c in db.calls.find({"number_group": {"$exists": False}}, {"tracking_number": 1}):
            grp = _call_number_group(c.get("tracking_number")).get("number_group")
            if grp == "other":
                _to_delete.append(c["_id"])
            else:
                await db.calls.update_one({"_id": c["_id"]}, {"$set": {"number_group": grp}})
        if _to_delete:
            res = await db.calls.delete_many({"_id": {"$in": _to_delete}})
            logger.info("Untracked-number call cleanup: removed %s calls", res.deleted_count)
    except Exception as e:
        logger.error("untracked-call cleanup failed: %s", e)
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
    # Keep Google Ads campaign/ad names fresh 24/7 (background loop).
    try:
        asyncio.create_task(_ad_label_sync_loop())
        asyncio.create_task(_google_call_sync_loop())
        asyncio.create_task(_quickbase_sync_loop())
    except Exception as e:
        logger.error("failed to start ad-label sync loop: %s", e)
    logger.info("Lemon Pros API started")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
