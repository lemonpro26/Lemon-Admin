import React, { useEffect, useState, useCallback } from 'react';
import { BarChart3, RefreshCw, Pencil, ChevronRight, Home, Phone, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSortable, SortLabel } from '@/lib/useSortable';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

const NONE = '(untracked / direct)';

// Friendly names for the internal source_page codes (landing-page analytics).
const PAGE_LABELS = {
  '': 'Home / Direct', home: 'Home', lapa: 'PA (/pa)', laspa: 'Spanish PA (/spa)',
  sp: 'Spanish (/sp)', ladg: 'Demand Gen (/dg)', ladgs: 'Spanish Demand Gen (/dgs)',
  latm: 'Team Overlay (/tm)', latm2: 'Team Split (/tm2)',
  dg: 'Demand Gen (/dg)', dgs: 'Spanish Demand Gen (/dgs)', tm: 'Team Overlay (/tm)', tm2: 'Team Split (/tm2)',
};
const pageLabel = (sp) => PAGE_LABELS[sp] ?? (sp || 'Home / Direct');

const PRETTY_TYPE = {
  SEARCH: 'Search', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Demand Gen',
  DISPLAY: 'Display', VIDEO: 'Video', SHOPPING: 'Shopping', MULTI_CHANNEL: 'Demand Gen',
  DISCOVERY: 'Demand Gen', LOCAL: 'Local', SMART: 'Smart',
};
const prettyType = (t) => {
  if (!t) return '';
  return PRETTY_TYPE[t] || t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const convCell = (r) => (
  <span className={`font-semibold ${r.conversion_rate >= 20 ? 'text-emerald-600' : r.conversion_rate > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
    {r.conversion_rate}%
  </span>
);
const money = (v) => (v == null ? <span className="text-slate-400">—</span>
  : <span className="font-medium text-slate-900">${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>);
const roasCell = (r) => (r.roas == null ? <span className="text-slate-400">—</span>
  : <span className={`font-semibold ${r.roas >= 1 ? 'text-emerald-600' : 'text-rose-600'}`}>{r.roas}x</span>);
const FIN_COLS = [
  { key: 'spend', label: 'Spend', num: true, render: (r) => money(r.spend) },
  { key: 'revenue', label: 'Revenue', num: true, render: (r) => money(r.revenue) },
  { key: 'roas', label: 'ROAS', num: true, render: roasCell },
  { key: 'cpl', label: 'CPL', num: true, render: (r) => money(r.cpl) },
  { key: 'cpa', label: 'CPA', num: true, render: (r) => money(r.cpa) },
];

const bounceCell = (r) => {
  const clicks = r.clicks || 0;
  const converted = r.leads || 0;
  const bounced = r.bounced != null ? r.bounced : Math.round((r.bounce_rate || 0) / 100 * clicks);
  const engaged = Math.max(0, clicks - converted - bounced); // entered funnel, didn't finish
  const pct = (n) => (clicks ? Math.round((n / clicks) * 1000) / 10 : 0);
  const Row = ({ color, label, n }) => (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-2 text-slate-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}
      </span>
      <span className="font-semibold text-slate-900 tabular-nums">{n} <span className="text-slate-400 font-normal">({pct(n)}%)</span></span>
    </div>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`font-semibold underline decoration-dotted underline-offset-4 hover:opacity-80 ${r.bounce_rate >= 70 ? 'text-red-500' : r.bounce_rate >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}
          data-testid="bounce-breakdown-trigger"
        >
          {r.bounce_rate}%
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4 z-[200]" onClick={(e) => e.stopPropagation()} data-testid="bounce-breakdown-popover">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Engagement breakdown</div>
        <div className="text-[11px] text-slate-400 mb-3">{clicks} clicks total</div>
        {/* Stacked bar */}
        <div className="flex h-2.5 w-full rounded-full overflow-hidden mb-3 bg-slate-100">
          <div style={{ width: `${pct(converted)}%`, background: '#10b981' }} />
          <div style={{ width: `${pct(engaged)}%`, background: '#f59e0b' }} />
          <div style={{ width: `${pct(bounced)}%`, background: '#ef4444' }} />
        </div>
        <div className="space-y-1.5">
          <Row color="#10b981" label="Converted (lead)" n={converted} />
          <Row color="#f59e0b" label="Engaged, no lead" n={engaged} />
          <Row color="#ef4444" label="Bounced" n={bounced} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-snug">Bounced = landed but never entered the funnel. Engaged = started the funnel but didn't submit.</p>
      </PopoverContent>
    </Popover>
  );
};

function DrillTable({ title, columns, rows, onRowClick, testid }) {
  // Default-sorted by most clicks from the top.
  const { sorted, sortKey, sortDir, toggle } = useSortable(rows, 'clicks', 'desc');
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" data-testid={testid}>
      {title && <div className="px-5 py-3 border-b border-slate-100 font-slab font-bold text-slate-900">{title}</div>}
      {rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No data yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.num ? 'text-right' : ''}>
                    <SortLabel label={c.label} k={c.key} sortKey={sortKey} sortDir={sortDir} onClick={toggle} align={c.num ? 'right' : 'left'} />
                  </TableHead>
                ))}
                {onRowClick && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => (
                <TableRow
                  key={i}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
                  data-testid={onRowClick ? `${testid}-row-${i}` : undefined}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.num ? 'text-right tabular-nums' : 'text-slate-700'}>
                      {c.render ? c.render(r) : (r[c.key] === '' || r[c.key] == null ? NONE : r[c.key])}
                    </TableCell>
                  ))}
                  {onRowClick && (
                    <TableCell className="text-slate-300"><ChevronRight className="h-4 w-4" /></TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Per-landing-page performance (visits, leads, calls, conv, bounce).
const LandingPageTable = ({ rows, directCalls }) => {
  const cols = [
    { key: 'source_page', label: 'Landing Page', render: (r) => <span className="font-medium text-slate-900">{pageLabel(r.source_page)}</span> },
    { key: 'clicks', label: 'Visits', num: true },
    { key: 'leads', label: 'Leads', num: true },
    { key: 'calls', label: 'Calls', num: true, render: (r) => (r.calls || 0) },
    { key: 'conversion_rate', label: 'Conv. Rate', num: true, render: convCell },
    ...FIN_COLS,
    { key: 'bounce_rate', label: 'Bounce Rate', num: true, render: bounceCell },
  ];
  return (
    <div data-testid="analytics-by-landing-page">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-500">
        <BarChart3 className="h-4 w-4" /> Performance by landing page
      </div>
      <DrillTable title="By Landing Page" columns={cols} rows={rows || []} testid="analytics-landing-table" />
      {directCalls > 0 && (
        <p className="mt-2 text-[11px] text-slate-400" data-testid="analytics-direct-calls-note">
          + {directCalls} call{directCalls === 1 ? '' : 's'} from untracked numbers (couldn&apos;t be tied to a specific landing page above).
        </p>
      )}
    </div>
  );
};


// Compact "calls + closed revenue per tracked number" strip for the top of Analytics.
const CallsByNumberStrip = ({ rows }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <div data-testid="analytics-calls-by-number">
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700">
        <Phone className="h-4 w-4 text-indigo-600" /> Calls by number
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.key} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`calls-by-number-${r.key}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-slab font-bold text-slate-900 tracking-tight" data-testid={`calls-by-number-display-${r.key}`}>{r.display}</span>
              <span className="text-[9px] font-bold uppercase tracking-wide rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 whitespace-nowrap">{r.label}</span>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-2xl font-extrabold text-slate-900 leading-none" data-testid={`calls-by-number-calls-${r.key}`}>{r.calls}</div>
                <div className="text-[11px] text-slate-400 mt-1">calls</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-emerald-700 leading-none" data-testid={`calls-by-number-revenue-${r.key}`}>${Number(r.revenue || 0).toLocaleString()}</div>
                <div className="text-[11px] text-slate-400 mt-1">{r.sold} sold</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// Calls & leads bucketed by hour of day (Pacific). A call/lead at 8:xx → 8am.
const HourlyBreakdown = ({ data, loading }) => {
  const hours = (data?.hours || []).filter((h) => h.calls > 0 || h.leads > 0);
  const max = Math.max(1, ...(data?.hours || []).map((h) => Math.max(h.calls, h.leads)));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" data-testid="analytics-by-hour">
      <div className="px-5 py-3 border-b border-slate-100 font-slab font-bold text-slate-900 flex items-center gap-2 flex-wrap">
        <Clock className="h-4 w-4 text-indigo-600" /> Calls &amp; Leads by hour of day
        <span className="text-[11px] font-sans font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">Pacific time</span>
        <div className="ml-auto flex items-center gap-3 text-xs font-sans font-medium">
          <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Calls {data?.total_calls ?? 0}</span>
          <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Leads {data?.total_leads ?? 0}</span>
        </div>
      </div>
      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">Loading hourly breakdown…</div>
      ) : hours.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm" data-testid="analytics-by-hour-empty">No calls or leads in this date range.</div>
      ) : (
        <div className="p-4 sm:p-5 space-y-2.5">
          {hours.map((h) => (
            <div key={h.hour} className="grid grid-cols-[52px_1fr] items-center gap-3" data-testid={`hour-row-${h.hour}`}>
              <div className="text-sm font-semibold text-slate-600 text-right tabular-nums">{h.label}</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-4 rounded-full bg-slate-50 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(h.calls / max) * 100}%` }} />
                  </div>
                  <span className="w-16 text-xs text-slate-500 tabular-nums" data-testid={`hour-calls-${h.hour}`}>{h.calls} call{h.calls === 1 ? '' : 's'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-4 rounded-full bg-slate-50 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(h.leads / max) * 100}%` }} />
                  </div>
                  <span className="w-16 text-xs text-slate-500 tabular-nums" data-testid={`hour-leads-${h.hour}`}>{h.leads} lead{h.leads === 1 ? '' : 's'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


export const AdminAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(todayRange());
  const [syncing, setSyncing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [drill, setDrill] = useState({ campaign: null, adgroup: null, ad: null });
  const [sitelinks, setSitelinks] = useState(null); // {connected, sitelinks, error}
  const [slLoading, setSlLoading] = useState(true);
  const [hourly, setHourly] = useState(null);
  const [hourlyLoading, setHourlyLoading] = useState(true);
  const editable = canEditFn();
  const autoSynced = React.useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/analytics', { params: { start: range.start, end: range.end } });
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  const loadSitelinks = useCallback(async () => {
    setSlLoading(true);
    try {
      const res = await api.get('/admin/google-ads/sitelinks', { params: { start: range.start, end: range.end } });
      setSitelinks(res.data);
    } catch (e) {
      setSitelinks({ connected: true, sitelinks: [], error: 'Could not load sitelink data.' });
    } finally {
      setSlLoading(false);
    }
  }, [range]);

  const loadHourly = useCallback(async () => {
    setHourlyLoading(true);
    try {
      const res = await api.get('/admin/analytics/hourly', { params: { start: range.start, end: range.end } });
      setHourly(res.data);
    } catch (e) {
      setHourly({ hours: [], total_calls: 0, total_leads: 0 });
    } finally {
      setHourlyLoading(false);
    }
  }, [range]);

  const editLabel = async (type, id, e) => {
    if (e) e.stopPropagation();
    const current = (data?.ad_labels?.[type] || {})[String(id)] || '';
    const name = window.prompt(`Friendly name for this ${type} (ID ${id}):`, current);
    if (name === null) return;
    try {
      await api.post('/admin/ad-labels', { type, id: String(id), name });
      toast.success(name.trim() ? 'Name saved.' : 'Name cleared.');
      load();
    } catch (e2) {
      toast.error('Could not save name.');
    }
  };

  const syncGoogle = useCallback(async (force) => {
    setSyncing(true);
    try {
      const res = await api.post(`/admin/ad-labels/sync-google${force ? '?force=true' : ''}`);
      if (res.data?.success) {
        if (!res.data.skipped) {
          const c = res.data.counts;
          if (c) toast.success(`Synced ${c.campaign} live campaigns & ${c.adgroup} ad groups from Google Ads.`);
          load();
        } else if (force) {
          toast.success('Campaign names are already up to date.');
        }
      } else if (res.data?.error) {
        // Stay silent — the dashboard's Google Ads disconnect banner surfaces this.
        console.warn('Google sync skipped:', res.data.error);
      }
    } catch (e) {
      // Silent: a disconnected token shows a graceful banner, not a red error popup.
      console.warn('Google sync failed:', e?.message);
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSitelinks(); }, [loadSitelinks]);
  useEffect(() => { loadHourly(); }, [loadHourly]);

  useEffect(() => {
    if (data?.google_ads_connected && !autoSynced.current) {
      autoSynced.current = true;
      syncGoogle(false);
    }
  }, [data, syncGoogle]);

  const header = (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <p className="text-sm text-slate-500 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" /> Live campaigns — drill in: Campaign → Ad Group → Ad → Keyword.
      </p>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <DateRangeFilter value={range} onChange={setRange} />
        {data?.google_ads_connected && editable && (
          <Button variant="outline" size="sm" onClick={() => syncGoogle(true)} disabled={syncing} className="rounded-xl border-slate-200" data-testid="analytics-sync-google">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync names'}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={load} className="rounded-xl border-slate-200" data-testid="analytics-refresh">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>
    </div>
  );

  if (loading || !data) {
    return (
      <div className="grid gap-6" data-testid="admin-analytics">
        {header}
        <div className="py-10 text-center text-slate-500">Loading analytics…</div>
      </div>
    );
  }

  const labels = data.ad_labels || {};
  const campaignTypes = data.campaign_types || {};
  const labelFor = (type, id) => (labels[type] || {})[String(id)] || '';

  // Editable name cell — clicking the pencil renames; row click handles drill.
  const nameCell = (type, idKey) => (r) => {
    // Synthetic Organic / Google-Ads-untracked rows carry a display label.
    if (type === 'campaign' && r.display) {
      return (
        <span className={`font-medium ${r.kind === 'organic' ? 'text-emerald-700' : 'text-slate-700'}`}>
          {r.display}
        </span>
      );
    }
    const id = r[idKey];
    if (id === '' || id == null) return NONE;
    const name = labelFor(type, id);
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={name ? 'font-medium text-slate-900' : 'text-slate-700'}>{name || id}</span>
        {name && <span className="text-[10px] text-slate-400">#{id}</span>}
        {editable && (
          <button
            type="button"
            onClick={(e) => editLabel(type, id, e)}
            className="text-slate-300 hover:text-slate-600 transition-colors"
            title="Set a friendly name"
            data-testid={`label-edit-${type}-${id}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  };

  const typeCell = (r) => {
    const t = prettyType(campaignTypes[String(r.campaign_id)]);
    return t ? <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span> : NONE;
  };

  const metricCols = [
    { key: 'clicks', label: 'Clicks', num: true },
    { key: 'leads', label: 'Leads', num: true },
    { key: 'calls', label: 'Calls', num: true, render: (r) => (r.calls || 0) },
    { key: 'conversion_rate', label: 'Conv. Rate', num: true, render: convCell },
    ...FIN_COLS,
    { key: 'bounce_rate', label: 'Bounce Rate', num: true, render: bounceCell },
  ];

  // Available campaign types for the filter.
  const availableTypes = Array.from(new Set(
    (data.by_campaign || []).map((r) => prettyType(campaignTypes[String(r.campaign_id)])).filter(Boolean)
  )).sort();

  // ---- Drill-down level resolution ----
  let level = 'campaign';
  if (drill.campaign != null && drill.adgroup == null) level = 'adgroup';
  else if (drill.adgroup != null && drill.ad == null) level = 'ad';
  else if (drill.ad != null) level = 'keyword';

  let rows = [];
  let columns = [];
  let onRowClick = null;
  let levelTestid = '';

  if (level === 'campaign') {
    rows = (data.by_campaign || []).filter((r) =>
      typeFilter === 'all' || prettyType(campaignTypes[String(r.campaign_id)]) === typeFilter);
    columns = [
      { key: 'campaign_id', label: 'Campaign', render: nameCell('campaign', 'campaign_id') },
      { key: 'type', label: 'Type', render: typeCell },
      ...metricCols,
    ];
    onRowClick = (r) => { if (r.kind) return; setDrill({ campaign: r.campaign_id, adgroup: null, ad: null }); };
    levelTestid = 'analytics-level-campaign';
  } else if (level === 'adgroup') {
    rows = (data.by_adgroup || []).filter((r) => r.campaign_id === drill.campaign);
    columns = [
      { key: 'adgroup_id', label: 'Ad Group', render: nameCell('adgroup', 'adgroup_id') },
      ...metricCols,
    ];
    onRowClick = (r) => setDrill({ campaign: drill.campaign, adgroup: r.adgroup_id, ad: null });
    levelTestid = 'analytics-level-adgroup';
  } else if (level === 'ad') {
    rows = (data.by_ad || []).filter((r) => r.campaign_id === drill.campaign && r.adgroup_id === drill.adgroup);
    columns = [
      { key: 'ad_id', label: 'Ad / Creative', render: nameCell('ad', 'ad_id') },
      ...metricCols,
    ];
    onRowClick = (r) => setDrill({ campaign: drill.campaign, adgroup: drill.adgroup, ad: r.ad_id });
    levelTestid = 'analytics-level-ad';
  } else {
    rows = (data.by_keyword || []).filter((r) =>
      r.campaign_id === drill.campaign && r.adgroup_id === drill.adgroup && r.ad_id === drill.ad);
    columns = [
      { key: 'keyword', label: 'Keyword' },
      ...metricCols,
    ];
    levelTestid = 'analytics-level-keyword';
  }

  const crumbName = (type, id) => labelFor(type, id) || (id === '' ? NONE : id);
  const Crumb = ({ onClick, active, children, testid }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={`inline-flex items-center gap-1 ${active ? 'text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
      data-testid={testid}
    >
      {children}
    </button>
  );

  const levelTitle = {
    campaign: 'By Campaign', adgroup: 'Ad Groups', ad: 'Ads / Creatives', keyword: 'Keywords',
  }[level];

  return (
    <div className="grid gap-6" data-testid="admin-analytics">
      {header}

      <CallsByNumberStrip rows={data.calls_by_number || []} />

      <HourlyBreakdown data={hourly} loading={hourlyLoading} />

      <LandingPageTable rows={data.by_landing_page || []} directCalls={data.direct_calls || 0} />

      {/* Breadcrumb + (campaign-level) type filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 text-sm flex-wrap" data-testid="analytics-breadcrumb">
          <Crumb onClick={() => setDrill({ campaign: null, adgroup: null, ad: null })} active={level === 'campaign'} testid="crumb-campaigns">
            <Home className="h-3.5 w-3.5" /> All Campaigns
          </Crumb>
          {drill.campaign != null && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <Crumb onClick={() => setDrill({ campaign: drill.campaign, adgroup: null, ad: null })} active={level === 'adgroup'} testid="crumb-campaign">
                {crumbName('campaign', drill.campaign)}
              </Crumb>
            </>
          )}
          {drill.adgroup != null && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <Crumb onClick={() => setDrill({ campaign: drill.campaign, adgroup: drill.adgroup, ad: null })} active={level === 'ad'} testid="crumb-adgroup">
                {crumbName('adgroup', drill.adgroup)}
              </Crumb>
            </>
          )}
          {drill.ad != null && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <Crumb active testid="crumb-ad">{crumbName('ad', drill.ad)}</Crumb>
            </>
          )}
        </div>

        {level === 'campaign' && availableTypes.length > 0 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[200px] rounded-xl border-slate-200" data-testid="analytics-type-filter">
              <SelectValue placeholder="All campaign types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaign types</SelectItem>
              {availableTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <DrillTable title={levelTitle} columns={columns} rows={rows} onRowClick={onRowClick} testid={levelTestid} />

      {/* Sitelinks — pulled LIVE from Google Ads (independent of first-party capture). */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" data-testid="analytics-by-sitelink">
        <div className="px-5 py-3 border-b border-slate-100 font-slab font-bold text-slate-900 flex items-center gap-2">
          By Sitelink
          <span className="text-[11px] font-sans font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">Live from Google Ads</span>
        </div>
        {slLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading sitelink data from Google Ads…</div>
        ) : sitelinks && sitelinks.connected === false ? (
          <div className="p-8 text-center text-slate-500 text-sm">Connect Google Ads to see sitelink performance.</div>
        ) : sitelinks && sitelinks.error ? (
          <div className="p-8 text-center text-amber-700 text-sm">Google Ads sitelink data unavailable: {sitelinks.error}</div>
        ) : !sitelinks || (sitelinks.sitelinks || []).length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No sitelink clicks in this date range.</div>
        ) : (
          <SitelinkTable rows={sitelinks.sitelinks} />
        )}
      </div>
    </div>
  );
};

function SitelinkTable({ rows }) {
  const withCtr = rows.map((r) => ({
    ...r,
    ctr: r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 10 : 0,
    conv: Math.round((r.conversions || 0) * 10) / 10,
  }));
  const { sorted, sortKey, sortDir, toggle } = useSortable(withCtr, 'clicks', 'desc');
  const cols = [
    { key: 'link_text', label: 'Sitelink' },
    { key: 'impressions', label: 'Impressions', num: true },
    { key: 'clicks', label: 'Clicks', num: true },
    { key: 'ctr', label: 'CTR', num: true, render: (r) => `${r.ctr}%` },
    { key: 'conv', label: 'Conversions', num: true },
  ];
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c.key} className={c.num ? 'text-right' : ''}>
                <SortLabel label={c.label} k={c.key} sortKey={sortKey} sortDir={sortDir} onClick={toggle} align={c.num ? 'right' : 'left'} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r, i) => (
            <TableRow key={i} data-testid={`sitelink-row-${i}`}>
              {cols.map((c) => (
                <TableCell key={c.key} className={c.num ? 'text-right tabular-nums text-slate-700' : 'font-medium text-slate-900'}>
                  {c.render ? c.render(r) : (c.num ? (r[c.key] ?? 0).toLocaleString() : r[c.key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
