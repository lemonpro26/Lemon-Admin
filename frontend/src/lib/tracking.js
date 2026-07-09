// Google Ads / campaign attribution tracking.
// Parses the URL params from the campaign tracking template, persists them for
// the whole funnel, and manages a stable session id used to de-dupe clicks and
// link a click to the lead it produced.

const SESSION_KEY = 'osgd_session_id';
const TRACK_KEY = 'osgd_tracking';

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSessionId() {
  let s = localStorage.getItem(SESSION_KEY);
  if (!s) {
    s = uuid();
    localStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

// Extra params we store but don't use as primary dimensions.
const PASSTHROUGH = [
  'feeditemid', 'targetid', 'loc_interest_ms', 'loc_physical_ms', 'matchtype',
  'network', 'device', 'devicemodel', 'placement', 'adposition', 'target',
];

// Google Ads ValueTrack suffix appended to every landing-page link copied from
// the admin, so campaign/ad-group/keyword/creative attribution is captured.
// tg_ref=campaign, adgroup_id, keyword, sub2=creative(ad), + passthrough params.
export const AD_TRACKING_QS = 'tg_ref={campaignid}&adgroup_id={adgroupid}&keyword={keyword}&sub2={creative}&feeditemid={feeditemid}&targetid={targetid}&loc_interest_ms={loc_interest_ms}&loc_physical_ms={loc_physical_ms}&matchtype={matchtype}&network={network}&device={device}&devicemodel={devicemodel}&placement={placement}&adposition={adposition}&target={target}';

// Append the tracking suffix to a base URL, e.g. https://x.com/split2/?tg_ref=...
export const withAdTracking = (base) => `${String(base).replace(/\/+$/, '')}/?${AD_TRACKING_QS}`;


const EMPTY = { campaign_id: '', adgroup_id: '', ad_id: '', keyword: '', gclid: '', gbraid: '', wbraid: '', referrer: '', feeditemid: '', extensionid: '', split_experiment_id: '', split_variant: '', params: {} };

// Map the current landing-page path -> its internal source_page code, so a phone
// tap is attributed to the exact page even when the number is shared across pages.
const PATH_TO_SOURCE = {
  '/': 'home', '/sp': 'sp', '/pa': 'lapa', '/spa': 'laspa',
  '/tm': 'latm', '/tm2': 'latm2', '/dg': 'ladg', '/dgs': 'ladgs',
};
function currentSourcePage() {
  try {
    const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    return PATH_TO_SOURCE[path] || '';
  } catch (e) { return ''; }
}

// Log a phone-number TAP (source_page + dialed number) so the resulting inbound
// call can be tied back to the exact landing page. Uses sendBeacon so it fires
// even as the tel: navigation begins. telHref example: "tel:+18443358911".
export function recordCallClick(telHref) {
  try {
    const number = String(telHref || '').replace(/\D/g, '').slice(-10);
    if (!number) return;
    const t = getTracking();
    const body = JSON.stringify({
      session_id: getSessionId(),
      source_page: currentSourcePage(),
      number,
      gclid: t.gclid || '',
      campaign_id: t.campaign_id || '',
      adgroup_id: t.adgroup_id || '',
      ad_id: t.ad_id || '',
      keyword: t.keyword || '',
    });
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/track/call-click`;
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch (e) { /* never block the call */ }
}

export function getTracking() {
  try {
    const raw = localStorage.getItem(TRACK_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch (e) {
    return { ...EMPTY };
  }
}

// Read tracking params from the current URL. If present, persist & return them.
// Otherwise return whatever was previously stored (so attribution survives the
// funnel and refreshes without losing the original source).
export function captureTracking(search) {
  const p = new URLSearchParams(search || '');
  const existing = getTracking();
  const data = {
    campaign_id: p.get('tg_ref') || '',
    adgroup_id: p.get('adgroup_id') || '',
    keyword: p.get('keyword') || '',
    ad_id: p.get('sub2') || '',
    gclid: p.get('gclid') || '',
    gbraid: p.get('gbraid') || '',
    wbraid: p.get('wbraid') || '',
    referrer: (typeof document !== 'undefined' ? document.referrer : '') || '',
    feeditemid: p.get('feeditemid') || '',
    extensionid: p.get('extensionid') || '',
    // Split-test attribution (stamped by the /split entry redirect). Sticky across
    // the funnel so the lead carries the experiment + variant it was routed to.
    split_experiment_id: p.get('se') || existing.split_experiment_id || '',
    split_variant: p.get('sv') || existing.split_variant || '',
    params: {},
  };
  PASSTHROUGH.forEach((k) => {
    const v = p.get(k);
    if (v) data.params[k] = v;
  });

  const hasTracking =
    data.campaign_id || data.adgroup_id || data.ad_id || data.keyword ||
    data.gclid || data.gbraid || data.wbraid || data.referrer ||
    data.feeditemid || data.extensionid || p.get('se') ||
    Object.keys(data.params).length > 0;

  if (hasTracking) {
    try {
      localStorage.setItem(TRACK_KEY, JSON.stringify(data));
    } catch (e) {
      /* ignore */
    }
    return data;
  }
  return getTracking();
}
