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

const EMPTY = { campaign_id: '', adgroup_id: '', ad_id: '', keyword: '', gclid: '', gbraid: '', wbraid: '', referrer: '', feeditemid: '', extensionid: '', params: {} };

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
    params: {},
  };
  PASSTHROUGH.forEach((k) => {
    const v = p.get(k);
    if (v) data.params[k] = v;
  });

  const hasTracking =
    data.campaign_id || data.adgroup_id || data.ad_id || data.keyword ||
    data.gclid || data.gbraid || data.wbraid || data.referrer ||
    data.feeditemid || data.extensionid ||
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
