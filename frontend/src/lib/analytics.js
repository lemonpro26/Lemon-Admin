// Google Analytics 4 (gtag.js) helpers for the Lemon Pros SPA.
// The base Google tag is loaded once in public/index.html with:
//   - GA4 G-PBB3G61CXB   (send_page_view:false — page views are sent manually here)
//   - Google Ads AW-318021992 (loaded for auto-tagging / GCLID only; conversions
//     are uploaded server-to-server, so NO client-side Ads conversion is fired)
const GA4_ID = 'G-PBB3G61CXB';

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
