import React from 'react';
import { Chrome, Facebook, Instagram, Newspaper } from 'lucide-react';

// Traffic-source networks (ad platforms). BACKEND-READY: every lead/call will
// eventually carry a `network` key derived from utm_source / utm_medium plus the
// click IDs it arrived with (gclid → google, fbclid → facebook/instagram,
// ttclid → tiktok, etc.).
//
// MOCKUP NOTE: network attribution is NOT live yet. Existing records have no
// `network` field, so `getNetwork()` defaults everything to `google`.
export const NETWORKS = [
  { key: 'google', label: 'Google', Icon: Chrome, color: '#4285F4', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { key: 'facebook', label: 'Facebook', Icon: Facebook, color: '#1877F2', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  { key: 'instagram', label: 'Instagram', Icon: Instagram, color: '#E4405F', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  { key: 'native', label: 'Native', Icon: Newspaper, color: '#F59E0B', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
];

export const NETWORK_MAP = NETWORKS.reduce((m, n) => { m[n.key] = n; return m; }, {});

// Existing records aren't tagged yet — treat them as Google for the mockup.
export const getNetwork = (item) => (item && item.network) || 'google';

// Reusable network filter chip row for the Calls / Leads tabs.
export function NetworkChips({ items = [], value = 'all', onChange, testidPrefix = 'network' }) {
  const counts = { all: items.length };
  NETWORKS.forEach((n) => { counts[n.key] = items.filter((i) => getNetwork(i) === n.key).length; });

  const Chip = ({ chipKey, label, Icon }) => {
    const active = value === chipKey;
    return (
      <button
        onClick={() => onChange && onChange(chipKey)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${active ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
        data-testid={`${testidPrefix}-chip-${chipKey}`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{counts[chipKey] ?? 0}</span>
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid={`${testidPrefix}-filter`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-0.5">Network</span>
      <Chip chipKey="all" label="All" />
      {NETWORKS.map((n) => <Chip key={n.key} chipKey={n.key} label={n.label} Icon={n.Icon} />)}
      <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5" title="Network attribution isn't live yet — this is a preview. Everything currently counts as Google.">Preview</span>
    </div>
  );
}
