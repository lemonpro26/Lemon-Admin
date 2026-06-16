"""SMTP email sending (SSL:465) + HTML templates for Lemon Pros.

Notifies the team when a new lead arrives and sends the lead a thank-you
confirmation. Sending is synchronous via smtplib but invoked from a FastAPI
BackgroundTask so it never blocks the API response.
"""
import os
import ssl
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

logger = logging.getLogger(__name__)

BRAND_YELLOW = "#FACC15"


def _smtp_cfg():
    """Read SMTP settings at call time (env populated by load_dotenv after import)."""
    user = os.environ.get("SMTP_USER", "")
    return {
        "host": os.environ.get("SMTP_HOST", ""),
        "port": int(os.environ.get("SMTP_PORT", "465")),
        "user": user,
        "pwd": os.environ.get("SMTP_PASS", ""),
        "sender_email": os.environ.get("SENDER_EMAIL", user),
        "sender_name": os.environ.get("SENDER_NAME", "Lemon Pros"),
    }


def send_email(to_emails, subject: str, html: str, reply_to: str | None = None) -> dict:
    """Send one HTML email to one or more recipients. Returns {ok, error}."""
    cfg = _smtp_cfg()
    if isinstance(to_emails, str):
        to_emails = [to_emails]
    to_emails = [e.strip() for e in to_emails if e and e.strip()]
    if not to_emails:
        return {"ok": False, "error": "no recipients"}
    if not (cfg["host"] and cfg["user"] and cfg["pwd"]):
        return {"ok": False, "error": "SMTP not configured"}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg["sender_name"], cfg["sender_email"]))
    msg["To"] = ", ".join(to_emails)
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText("This email requires an HTML-capable client.", "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ctx, timeout=20) as server:
            server.login(cfg["user"], cfg["pwd"])
            server.sendmail(cfg["sender_email"], to_emails, msg.as_string())
        return {"ok": True, "error": None}
    except Exception as e:
        logger.error("SMTP send failed: %s: %s", type(e).__name__, e)
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def _shell(inner: str) -> str:
    return f"""\
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:18px 24px;color:#fff;">
      <span style="font-size:22px;font-weight:800;color:#fff;">Lemon<span style="color:{BRAND_YELLOW};">Pros</span></span>
      <span style="font-size:11px;font-weight:700;letter-spacing:2px;color:#94a3b8;text-transform:uppercase;display:block;">Lemon Law Help</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px 24px;color:#0f172a;">
      {inner}
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
      Lemon Pros · Sent automatically from your lead funnel · Attorney advertising
    </p>
  </div>
</body></html>"""


def _row(label: str, value: str) -> str:
    if not value:
        value = "—"
    return (f'<tr><td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;">{label}</td>'
            f'<td style="padding:7px 0;color:#0f172a;font-size:14px;font-weight:600;">{value}</td></tr>')


def _vehicle_str(lead: dict) -> str:
    parts = [lead.get("car_year", ""), lead.get("car_make", ""), lead.get("car_model", "")]
    return " ".join(p for p in parts if p).strip()


def build_internal_notification_html(lead: dict) -> str:
    attribution = ""
    if any(lead.get(k) for k in ("campaign_id", "adgroup_id", "ad_id", "keyword", "gclid")):
        attribution = (
            '<h3 style="margin:22px 0 6px;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Attribution</h3>'
            '<table style="width:100%;border-collapse:collapse;">'
            + _row("Campaign ID", lead.get("campaign_id", ""))
            + _row("Ad Group ID", lead.get("adgroup_id", ""))
            + _row("Ad ID", lead.get("ad_id", ""))
            + _row("Keyword", lead.get("keyword", ""))
            + _row("GCLID", lead.get("gclid", ""))
            + "</table>"
        )
    inner = f"""
      <h2 style="margin:0 0 4px;font-size:22px;color:#0f172a;">🍋 New Lemon Law Lead</h2>
      <p style="margin:0 0 18px;color:#64748b;font-size:14px;">A customer just completed the qualification funnel.</p>
      <table style="width:100%;border-collapse:collapse;">
        {_row("Vehicle", _vehicle_str(lead))}
        {_row("Name", lead.get("full_name", ""))}
        {_row("Phone", lead.get("phone", ""))}
        {_row("Email", lead.get("email", ""))}
        {_row("Address", lead.get("address", ""))}
        {_row("Location", f"{lead.get('city','')}, {lead.get('state','')}".strip(', '))}
        {_row("Zip", lead.get("zip", ""))}
      </table>
      {attribution}
      <div style="margin-top:22px;text-align:center;">
        <a href="tel:{lead.get('phone','')}" style="display:inline-block;background:#EF4444;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:10px;">Call {lead.get('first_name','the lead')} now</a>
      </div>
    """
    return _shell(inner)


def render_template(template: str, lead: dict) -> str:
    """Fill {first_name}/{last_name}/{vehicle}/{car_year}/{car_make}/{car_model}/
    {address}/{city}/{state} tokens in an admin-editable email template."""
    name = lead.get("first_name") or "there"
    mapping = {
        "first_name": name,
        "last_name": lead.get("last_name", ""),
        "name": lead.get("full_name") or name,
        "vehicle": _vehicle_str(lead) or "your vehicle",
        "car_year": lead.get("car_year", ""),
        "car_make": lead.get("car_make", ""),
        "car_model": lead.get("car_model", ""),
        "address": lead.get("address", ""),
        "city": lead.get("city", ""),
        "state": lead.get("state", ""),
    }
    out = template or ""
    for k, v in mapping.items():
        out = out.replace("{" + k + "}", str(v))
    return out


# Default editable thank-you body (plain text with {tokens}; \n => paragraphs).
DEFAULT_THANK_YOU_BODY = (
    "Thank you, {first_name}!\n\n"
    "We've received your request and a Lemon Pros case specialist will reach out shortly to review "
    "your vehicle and explain your options. Your consultation is 100% free and there's no obligation.\n\n"
    "Your vehicle: {vehicle}\n\n"
    "Need to reach us sooner? Just reply to this email and we'll get right back to you.\n\n"
    "— The Lemon Pros Team"
)


def build_thank_you_html(lead: dict, message: str = None) -> str:
    name = lead.get("first_name") or "there"
    if message and message.strip():
        body_text = render_template(message, lead)
        paragraphs = "".join(
            f'<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.6;">{p.strip()}</p>'
            for p in body_text.split("\n") if p.strip()
        )
        inner = f"""
      <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Thank you, {name}! 🍋</h2>
      {paragraphs}
    """
        return _shell(inner)

    inner = f"""
      <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Thank you, {name}! 🍋</h2>
      <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.6;">
        We've received your request and a Lemon Pros case specialist will reach out shortly to review your
        vehicle and explain your options. Your consultation is 100% free and there's no obligation.
      </p>
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:16px 18px;margin:18px 0;">
        <p style="margin:0 0 6px;color:#64748b;font-size:13px;">Your vehicle</p>
        <p style="margin:0;color:#0f172a;font-size:15px;font-weight:600;">{_vehicle_str(lead) or 'Your vehicle'}</p>
      </div>
      <p style="margin:0 0 6px;color:#334155;font-size:15px;">Need to reach us sooner? Just reply to this email and we'll get right back to you.</p>
      <p style="margin:18px 0 0;color:#0f172a;font-size:15px;font-weight:700;">— The Lemon Pros Team</p>
    """
    return _shell(inner)


def build_contact_html(name: str, email: str, phone: str, message: str) -> str:
    safe_msg = (message or "").replace("\n", "<br>")
    inner = f"""
      <h2 style="margin:0 0 4px;font-size:22px;color:#0f172a;">📨 New Contact Message</h2>
      <p style="margin:0 0 18px;color:#64748b;font-size:14px;">Submitted from the website Contact page.</p>
      <table style="width:100%;border-collapse:collapse;">
        {_row("Name", name)}
        {_row("Email", email)}
        {_row("Phone", phone)}
      </table>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:18px 0;">
        <p style="margin:0 0 6px;color:#64748b;font-size:13px;">Message</p>
        <p style="margin:0;color:#0f172a;font-size:15px;line-height:1.6;">{safe_msg}</p>
      </div>
      <p style="margin:0;color:#64748b;font-size:13px;">Reply directly to this email to respond to {name or 'the sender'}.</p>
    """
    return _shell(inner)
