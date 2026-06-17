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

# Where the website Contact form is forwarded.
CONTACT_FORWARD_EMAIL = os.environ.get('CONTACT_FORWARD_EMAIL', 'info@lemonpros.com')

# Optional CRM webhook — leads are POSTed here as JSON when a URL is configured.
CRM_WEBHOOK_URL = os.environ.get('CRM_WEBHOOK_URL', '')

# Defaults for the site config (seeded on first run).
# NOTE: no default city/state — when a visitor's location is unknown the
# {!city}/{!state} macros are stripped cleanly instead of showing a fallback.
DEFAULT_CONFIG = {
    "hook1": "Stuck With a Lemon? You May Be Owed Money.",
    "hook2": "Find out in 60 seconds if your defective vehicle qualifies for a refund, replacement, or cash compensation under {!state} Lemon Law — at no cost to you.",
    # Email notification settings
    "notification_emails": ["info@lemonpros.com"],
    "notify_team": True,
    "send_thank_you": True,
    # Editable customer thank-you email
    "thank_you_subject": "Thanks for your request — Lemon Pros",
    "thank_you_body": DEFAULT_THANK_YOU_BODY,
}

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
    params: Optional[dict] = None


class ClickTrack(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    campaign_id: Optional[str] = ""
    adgroup_id: Optional[str] = ""
    ad_id: Optional[str] = ""
    keyword: Optional[str] = ""
    gclid: Optional[str] = ""
    landing_path: Optional[str] = ""
    params: Optional[dict] = None


class HookRuleBody(BaseModel):
    label: str
    match_campaign: Optional[str] = ""
    match_adgroup: Optional[str] = ""
    match_ad: Optional[str] = ""
    hook1: str
    hook2: str
    weight: int = 50
    enabled: bool = True


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
    """Return (start_iso, end_iso, days) covering full UTC days. Defaults to today."""
    today = datetime.now(timezone.utc).date()
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
    start_dt = datetime(s.year, s.month, s.day, tzinfo=timezone.utc)
    end_dt = datetime(e.year, e.month, e.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
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


async def resolve_hooks(cfg: dict, campaign: str, adgroup: str, ad: str, seed: str = "") -> dict:
    """A/B-aware hook resolution. Among the enabled rules that match the incoming
    campaign / ad group / ad, take the most specific bucket and choose one variant
    weighted by its serving %. Falls back to the default site config."""
    rules = await db.hook_rules.find({"enabled": True}).to_list(length=500)
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
    return {
        "hook1": cfg["hook1"],
        "hook2": cfg["hook2"],
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
):
    """Return hooks with {!city}/{!state} resolved from visitor IP geolocation.
    When location is unknown the macros are stripped. The serving hook is chosen
    by weighted A/B among matching variants, seeded by the session id."""
    cfg = await get_or_create_config()
    ip = resolve_client_ip(request.headers)
    geo = lookup_geo(ip, "", "")
    resolved = await resolve_hooks(cfg, campaign, adgroup, ad, seed=session)
    return {
        "hook1": render_tokens(resolved["hook1"], geo["city"], geo["state"]),
        "hook2": render_tokens(resolved["hook2"], geo["city"], geo["state"]),
        "city": geo["city"],
        "state": geo["state"],
        "geo_source": geo["source"],
        "matched_rule": resolved["matched_rule"],
        "matched_rule_label": resolved["matched_rule_label"],
    }


@api_router.post("/track/click")
async def track_click(body: ClickTrack, request: Request):
    """Record a click/visit, de-duplicated per session_id. Captures full Google
    Ads attribution and the hook rule that matched (for per-hook traffic)."""
    cfg = await get_or_create_config()
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
    doc["id"] = str(uuid.uuid4())
    doc["first_seen"] = now
    doc["last_seen"] = now
    doc["visits"] = 1
    doc["converted"] = False
    await db.clicks.insert_one(doc)
    return {"success": True, "deduped": False}


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
    drop = {"campaign_id", "adgroup_id", "ad_id", "keyword", "gclid", "params", "matched_rule_id"}
    payload = {k: v for k, v in lead.items() if k not in drop}
    payload["source"] = "google ppc form"
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
    cfg = await get_or_create_config()
    ip = resolve_client_ip(request.headers)
    geo = lookup_geo(ip, "", "")
    resolved = await resolve_hooks(cfg, payload.campaign_id, payload.adgroup_id, payload.ad_id, seed=payload.session_id)

    lead = payload.model_dump()
    lead["id"] = str(uuid.uuid4())
    lead["full_name"] = f"{payload.first_name} {payload.last_name}".strip()
    lead["city"] = payload.city or geo["city"]
    lead["state"] = payload.state or geo["state"]
    lead["ip"] = ip or ""
    lead["user_agent"] = request.headers.get("user-agent", "")
    lead["matched_rule_id"] = resolved["matched_rule"]
    lead["created_at"] = _now_iso()

    await db.leads.insert_one({**lead})

    if payload.session_id:
        await db.clicks.update_one(
            {"session_id": payload.session_id},
            {"$set": {"converted": True, "converted_at": lead["created_at"]}},
        )

    background_tasks.add_task(_dispatch_lead_emails, cfg, {k: v for k, v in lead.items() if k != "_id"})
    background_tasks.add_task(_post_lead_to_crm, {k: v for k, v in lead.items() if k != "_id"})
    return {"success": True, "id": lead["id"]}


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
async def admin_login(body: LoginRequest):
    uname = (body.username or "").strip()
    # Owner master password (works with blank or 'owner' username).
    if body.password == ADMIN_PASSWORD and uname.lower() in ("", "owner"):
        return {"token": create_token("owner", "owner"), "username": "owner", "role": "owner"}
    user = await db.admin_users.find_one({"username": uname})
    if user and _verify_pw(body.password, user.get("password_hash", "")):
        return {"token": create_token(uname, user["role"]), "username": uname, "role": user["role"]}
    raise HTTPException(status_code=401, detail="Incorrect username or password")


@api_router.get("/admin/me")
async def admin_me(user: dict = Depends(require_admin)):
    return {"username": user["username"], "role": user["role"]}


@api_router.get("/admin/users")
async def list_users(user: dict = Depends(require_admin)):
    users = await db.admin_users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(200)
    owner = {"username": "owner", "role": "owner", "is_owner": True}
    return {"users": [owner] + users, "current": user}


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
):
    s_iso, e_iso, _days = _date_range(start, end)
    q = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    total = await db.leads.count_documents(q)
    cursor = db.leads.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    leads = await cursor.to_list(length=limit)
    return {"total": total, "leads": leads, "range": {"start": s_iso, "end": e_iso}}


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


async def _upload_lead_conversion(lead: dict, sale: SaleBody) -> dict:
    return gads.upload_offline_conversion(
        lead=lead, value=sale.value, currency=(sale.currency or "USD"),
        sale_datetime=sale.sale_datetime, order_id=lead.get("id"), enhanced=True,
    )


@api_router.get("/admin/google-ads/status")
async def google_ads_status(_: dict = Depends(require_admin)):
    return gads.status()


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
    s_iso, e_iso, _days = _date_range(start, end)
    q = {"created_at": {"$gte": s_iso, "$lte": e_iso}}
    total = await db.leads.count_documents(q)
    total_clicks = await db.clicks.count_documents({"first_seen": {"$gte": s_iso, "$lte": e_iso}})
    conv = round((total / total_clicks * 100), 1) if total_clicks else 0.0
    return {"total_leads": total, "total_clicks": total_clicks, "conversion_rate": conv}


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
async def list_hook_rules(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    s_iso, e_iso, _days = _date_range(start, end)
    rules = await db.hook_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
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

    for r in rules:
        _attach(r, r.get("id"))

    cfg = await get_or_create_config()
    default_hook = _attach({
        "id": None, "label": "Home Page (default / catch-all)", "is_default": True,
        "hook1": cfg.get("hook1", ""), "hook2": cfg.get("hook2", ""),
        "match_campaign": "", "match_adgroup": "", "match_ad": "", "enabled": True,
    }, None)

    return {"rules": rules, "default": default_hook,
            "range": {"start": s_iso, "end": e_iso}}


@api_router.post("/admin/hook-rules")
async def create_hook_rule(body: HookRuleBody, _: dict = Depends(require_editor)):
    rule = body.model_dump()
    rule["id"] = str(uuid.uuid4())
    rule["created_at"] = _now_iso()
    rule["updated_at"] = rule["created_at"]
    await db.hook_rules.insert_one({**rule})
    return serialize_doc(rule)


@api_router.put("/admin/hook-rules/{rule_id}")
async def update_hook_rule(rule_id: str, body: HookRuleBody, _: dict = Depends(require_editor)):
    update = body.model_dump()
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
    """Distinct campaigns + ad groups captured from incoming traffic & leads."""
    campaigns = set()
    adgroups = {}
    for coll in (db.clicks, db.leads):
        async for row in coll.aggregate([
            {"$group": {"_id": {"c": "$campaign_id", "a": "$adgroup_id"}}}
        ]):
            c = (row["_id"].get("c") or "").strip()
            a = (row["_id"].get("a") or "").strip()
            if c:
                campaigns.add(c)
            if a:
                adgroups[(c, a)] = True
    return {
        "campaigns": sorted(campaigns),
        "adgroups": [{"campaign_id": c, "adgroup_id": a} for (c, a) in sorted(adgroups)],
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


async def _agg_clicks(group_fields: list, s_iso: str, e_iso: str) -> dict:
    """Clicks + bounced (single-visit sessions) per group, from the clicks collection."""
    group_id = {f: f"${f}" for f in group_fields}
    pipeline = [
        {"$match": {"first_seen": {"$gte": s_iso, "$lte": e_iso}}},
        {"$group": {
            "_id": group_id,
            "clicks": {"$sum": 1},
            "bounced": {"$sum": {"$cond": [{"$lte": [{"$ifNull": ["$visits", 1]}, 1]}, 1, 0]}},
        }},
    ]
    out = {}
    async for row in db.clicks.aggregate(pipeline):
        key = tuple((row["_id"].get(f) or "") for f in group_fields)
        out[key] = {"clicks": row["clicks"], "bounced": row["bounced"]}
    return out


@api_router.get("/admin/analytics")
async def admin_analytics(_: dict = Depends(require_admin), start: str = Query(""), end: str = Query("")):
    s_iso, e_iso, _days = _date_range(start, end)

    async def breakdown(fields: list):
        clicks = await _agg_clicks(fields, s_iso, e_iso)
        leads = await _agg_count(db.leads, fields, "created_at", s_iso, e_iso)
        keys = set(clicks) | set(leads)
        rows = []
        for k in keys:
            cinfo = clicks.get(k, {})
            c = cinfo.get("clicks", 0)
            bounced = cinfo.get("bounced", 0)
            lc = leads.get(k, 0)
            entry = {fields[i]: k[i] for i in range(len(fields))}
            entry["clicks"] = c
            entry["leads"] = lc
            entry["conversion_rate"] = round((lc / c * 100), 1) if c else (100.0 if lc else 0.0)
            entry["bounce_rate"] = round((bounced / c * 100), 1) if c else 0.0
            rows.append(entry)
        rows.sort(key=lambda r: (r["leads"], r["clicks"]), reverse=True)
        return rows

    return {
        "by_campaign": await breakdown(["campaign_id"]),
        "by_adgroup": await breakdown(["campaign_id", "adgroup_id"]),
        "by_ad": await breakdown(["campaign_id", "adgroup_id", "ad_id"]),
        "by_keyword": await breakdown(["keyword"]),
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
    if len(hook_variants) < 4:
        demo = [
            ("{!city} Garage Door Repair — Same Day", "Licensed pros in {!state}. Free quote in 2 minutes."),
            ("Emergency {!city} Garage Door Service", "24/7 broken spring & off-track repair across {!state}."),
            ("{!state} Homeowners: Garage Door Tune-Up Special", "Book today and see if you qualify."),
        ]
        for p1, p2 in demo[: 4 - len(hook_variants)]:
            hook_variants.append({"csid": _csid(p1), "punch1": p1, "punch2": p2, "source": "Demo variant"})

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
    logger.info("Lemon Pros API started")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
