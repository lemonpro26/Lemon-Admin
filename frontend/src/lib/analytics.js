// Google Analytics 4 (gtag.js) helpers for the Lemon Pros SPA.
// The base Google tag is loaded once in public/index.html with:
//   - GA4 G-PBB3G61CXB   (send_page_view:false — page views are sent manually here)
//   - Google Ads AW-318021992 (auto-tagging / GCLID + the form-submit conversion below)
const GA4_ID = 'G-PBB3G61CXB';
// Google Ads "Lead Form Submit" conversion label (Event snippet send_to value).
const ADS_LEAD_CONVERSION = 'AW-318021992/QndSCIqez8EcEOjC0pcB';
// Google Ads "Click to call" conversion label (fires when a phone link is tapped).
const ADS_CALL_CONVERSION = 'AW-318021992/I_x1CMbE2cEcEOjC0pcB';

function gtagSafe(...args) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag(...args);
}

// Manual SPA page view — scoped to GA4 so it never reaches the Ads tag.
export function trackPageView(path) {
  gtagSafe('event', 'page_view', {
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
    page_path: path,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
    send_to: GA4_ID,
  });
}

// GA4 lead conversion (no PII). Fired on the Thank-You page after a real submit.
// Guarded against rapid duplicate fires (e.g. React StrictMode double-mount in dev)
// so a single completed lead is never counted twice.
let _lastLeadAt = 0;
export function trackGenerateLead(params = {}) {
  const now = Date.now();
  if (now - _lastLeadAt < 3000) return;
  _lastLeadAt = now;
  gtagSafe('event', 'generate_lead', { ...params, send_to: GA4_ID });
}

// Google Ads conversion — fired on the Thank-You page after a real submit.
// Tells Google Ads "this ad click converted" (uses the GCLID from auto-tagging).
// Guarded against duplicate fires (React StrictMode double-mount / re-render).
let _lastAdsConvAt = 0;
export function trackAdsConversion({ value, currency = 'USD', transactionId } = {}) {
  const now = Date.now();
  if (now - _lastAdsConvAt < 3000) return;
  _lastAdsConvAt = now;
  const payload = { send_to: ADS_LEAD_CONVERSION };
  if (typeof value === 'number') payload.value = value;
  if (currency) payload.currency = currency;
  if (transactionId) payload.transaction_id = transactionId;
  gtagSafe('event', 'conversion', payload);
}

// Google Ads "Click to call" conversion — fired when a visitor taps a phone link.
// Uses Google's recommended event_callback pattern: we hold the tel: navigation
// until the conversion ping is sent, then hand off to the dialer. Without this,
// the mobile dialer backgrounds the page and cancels the in-flight ping, so the
// call conversion silently under-reports / "doesn't fire".
let _lastCallConvAt = 0;
export function trackPhoneCallConversion(e) {
  const now = Date.now();
  if (now - _lastCallConvAt < 1500) return; // let default tel: navigation proceed
  _lastCallConvAt = now;

  // gtag unavailable → don't block the call, just let the link work.
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

  const anchor = e && e.currentTarget && e.currentTarget.getAttribute ? e.currentTarget : null;
  const url = anchor ? anchor.getAttribute('href') : null;

  if (url) {
    e.preventDefault(); // must be synchronous
    let navigated = false;
    const go = () => { if (!navigated) { navigated = true; window.location = url; } };
    setTimeout(go, 700); // fallback if event_callback never fires
    window.gtag('event', 'conversion', {
      send_to: ADS_CALL_CONVERSION,
      value: 1.0,
      currency: 'USD',
      event_callback: go,
    });
  } else {
    window.gtag('event', 'conversion', { send_to: ADS_CALL_CONVERSION, value: 1.0, currency: 'USD' });
  }
}
