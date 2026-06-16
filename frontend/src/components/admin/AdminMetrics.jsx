import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, TrendingUp, Info, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';
import { useSortable } from '@/lib/useSortable';

const fmtNum = (n) => (n ?? 0).toLocaleString();
const fmtMoney = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n) => `${(n ?? 0).toFixed(2)}%`;

// Google Ads only — confirmed order: Source -> Campaign -> Ad Group -> Sites -> Group.
const DIMENSIONS = [
  { key: 'source', label: 'SOURCE' },
  { key: 'campaign', label: 'CAMPAIGN' },
  { key: 'adgroup', label: 'AD GROUP' },
  { key: 'sites', label: 'SITES' },
  { key: 'group', label: 'GROUP' },
];

// Network breakdown removed (Google Ads only). Device now shows operating systems;
// Referrer shows the domains the traffic comes from.
const BREAKDOWNS = [
  { key: 'time', label: 'TIME' },
  { key: 'geo', label: 'GEO' },
  { key: 'csid', label: 'CSID (HOOKS)' },
  { key: 'device', label: 'DEVICE (OS)' },
  { key: 'referrer', label: 'REFERRER' },
];

function MetricHeader({ cols, sortKey, sortDir, onSort }) {
  return (
    <thead>
      <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
        {cols.map((c) => (
          <th key={c.key} className={`py-2.5 px-3 font-semibold ${c.num ? 'text-right' : 'text-left'} ${c.w || ''}`}>
            <button
              type="button"
              onClick={() => onSort(c.key)}
              className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 transition-colors ${c.num ? 'flex-row-reverse' : ''}`}
              data-testid={`metric-sort-${c.key}`}
            >
              <span>{c.label}</span>
              {sortKey === c.key
                ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                : <ArrowUpDown className="h-3 w-3 opacity-40" />}
            </button>
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Cell({ col, row }) {
  const v = row[col.key];
  if (col.render) return <td className={`py-2.5 px-3 ${col.num ? 'text-right tabular-nums' : ''}`}>{col.render(row)}</td>;
  let content = v;
  if (col.money) content = fmtMoney(v);
  else if (col.pct) content = fmtPct(v);
  else if (col.num) content = fmtNum(v);
  return (
    <td className={`py-2.5 px-3 ${col.num ? 'text-right tabular-nums text-slate-700' : 'text-slate-800'} ${col.strong ? 'font-medium' : ''}`}>
      {content}
    </td>
  );
}

function MetricTable({ cols, rows, totals, testid }) {
  const { sorted, sortKey, sortDir, toggle } = useSortable(rows, null, 'desc');
  return (
    <div className="overflow-x-auto" data-testid={testid}>
      <table className="w-full text-sm">
        <MetricHeader cols={cols} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/70">
              {cols.map((c) => <Cell key={c.key} col={c} row={r} />)}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={cols.length} className="py-8 text-center text-slate-400">No data.</td></tr>
          )}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              {cols.map((c, idx) => {
                if (idx === 0) return <td key={c.key} className="py-2.5 px-3">Total</td>;
                const v = totals[c.key];
                let content = '';
                if (v != null) {
                  if (c.money) content = fmtMoney(v);
                  else if (c.pct) content = fmtPct(v);
                  else if (c.num) content = fmtNum(v);
                }
                return <td key={c.key} className={`py-2.5 px-3 ${c.num ? 'text-right tabular-nums' : ''}`}>{content}</td>;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Revenue color cell
const revCell = (r) => (
  <span className={`font-medium ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtMoney(r.revenue)}</span>
);
const roasCell = (r) => (
  <span className={`font-semibold ${r.roas >= 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{(r.roas ?? 0).toFixed(2)}x</span>
);

const DIM_COLS = [
  { key: 'name', label: 'Name', strong: true },
  { key: 'imp', label: 'IMP', num: true },
  { key: 'actions', label: 'Actions', num: true },
  { key: 'conv', label: 'Conv', num: true, pct: true },
  { key: 'cpc', label: 'CPC', num: true, money: true },
  { key: 'cpa', label: 'CPA', num: true, money: true },
  { key: 'revenue', label: 'Revenue', num: true, render: revCell },
  { key: 'roas', label: 'ROAS', num: true, render: roasCell },
  { key: 'bounce', label: 'Bounce', num: true, pct: true },
];

export const AdminMetrics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dim, setDim] = useState('source');
  const [bd, setBd] = useState('csid');
  const [geoMode, setGeoMode] = useState('state');
  const [range, setRange] = useState(todayRange());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/metrics', { params: { start: range.start, end: range.end } });
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load metrics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="grid gap-5" data-testid="admin-metrics">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Media-buying overview — Google Ads only.
          </p>
          <div className="flex items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <Button variant="outline" size="sm" onClick={load} className="rounded-xl border-slate-200" data-testid="metrics-refresh">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>
        <div className="py-10 text-center text-slate-500">Loading metrics...</div>
      </div>
    );
  }

  const t = data.totals;
  const dimRows = data.dimensions[dim] || [];

  const geoCols = [
    { key: 'name', label: geoMode === 'state' ? 'State' : 'City', strong: true },
    ...(geoMode === 'city' ? [{ key: 'state', label: 'State' }] : []),
    { key: 'imp', label: 'IMP', num: true },
    { key: 'actions', label: 'Leads', num: true },
    { key: 'conv', label: 'Conv', num: true, pct: true },
    { key: 'cpa', label: 'CPA', num: true, money: true },
    { key: 'revenue', label: 'Revenue', num: true, render: revCell },
  ];

  const csidCols = [
    { key: 'csid', label: 'CSID', strong: true },
    { key: 'punch1', label: 'Punch 1 (Hook 1)', render: (r) => <span className="text-slate-800">{r.punch1}</span> },
    { key: 'punch2', label: 'Punch 2 (Hook 2)', render: (r) => <span className="text-slate-600">{r.punch2}</span> },
    { key: 'imp', label: 'IMP', num: true },
    { key: 'actions', label: 'Actions', num: true },
    { key: 'conv', label: 'Conv', num: true, pct: true },
    { key: 'revenue', label: 'Revenue', num: true, render: revCell },
  ];

  const simpleCols = [
    { key: 'name', label: 'Name', strong: true },
    { key: 'imp', label: 'IMP', num: true },
    { key: 'actions', label: 'Actions', num: true },
    { key: 'conv', label: 'Conv', num: true, pct: true },
    { key: 'cpa', label: 'CPA', num: true, money: true },
    { key: 'revenue', label: 'Revenue', num: true, render: revCell },
    { key: 'bounce', label: 'Bounce', num: true, pct: true },
  ];

  // Traffic-style breakdowns (Time / Device-OS / Referrer): clicks, leads, conv%, bounce.
  const trafficBase = [
    { key: 'clicks', label: 'Clicks', num: true },
    { key: 'leads', label: 'Leads', num: true },
    { key: 'conv', label: 'Conv', num: true, pct: true },
    { key: 'bounce', label: 'Bounce', num: true, pct: true },
  ];
  const timeCols = [{ key: 'label', label: 'Hour', strong: true }, ...trafficBase];
  const osCols = [{ key: 'name', label: 'Operating System', strong: true }, ...trafficBase];
  const referrerCols = [{ key: 'name', label: 'Referring Domain', strong: true }, ...trafficBase];

  return (
    <div className="grid gap-5" data-testid="admin-metrics">
      {/* Top bar: heading + per-tab date range + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Media-buying overview — Google Ads only.
        </p>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <Button variant="outline" size="sm" onClick={load} className="rounded-xl border-slate-200" data-testid="metrics-refresh">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Impressions', value: fmtNum(t.imp) },
          { label: 'Actions', value: fmtNum(t.actions) },
          { label: 'Conv. Rate', value: fmtPct(t.conv) },
          { label: 'Revenue', value: fmtMoney(t.revenue), accent: true },
          { label: 'ROAS', value: `${(t.roas ?? 0).toFixed(2)}x`, accent: true },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className={`mt-1 text-xl font-bold ${k.accent ? 'text-emerald-600' : 'text-slate-900'}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Demo data + passback note */}
      <div className="flex items-start gap-2 text-sm text-amber-800 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Demo data.</strong> Numbers are simulated until your Google conversion pixel is connected.
          Once live, real impressions, actions and <strong>revenue will be passed back to Google</strong> for smart bidding.
        </span>
      </div>

      {/* TOP: dimension table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-1 px-3 pt-3 border-b border-slate-100">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDim(d.key)}
              className={`px-3 py-2 text-xs font-semibold tracking-wide rounded-t-lg transition-colors ${dim === d.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              data-testid={`metrics-dim-${d.key}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="p-2">
          <MetricTable cols={DIM_COLS} rows={dimRows} totals={t} testid={`metrics-dim-table-${dim}`} />
        </div>
      </div>

      {/* BOTTOM: breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-1 px-3 pt-3 border-b border-slate-100">
          {BREAKDOWNS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBd(b.key)}
              className={`px-3 py-2 text-xs font-semibold tracking-wide rounded-t-lg transition-colors flex items-center gap-1.5 ${bd === b.key ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
              data-testid={`metrics-bd-${b.key}`}
            >
              {b.key === 'csid' && <TrendingUp className="h-3.5 w-3.5" />}
              {b.label}
            </button>
          ))}
        </div>

        <div className="p-2">
          {bd === 'geo' && (
            <>
              <div className="flex gap-2 px-2 pt-1 pb-2">
                {['state', 'city'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setGeoMode(m)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${geoMode === m ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                    data-testid={`metrics-geo-${m}`}
                  >
                    By {m === 'state' ? 'State' : 'City'}
                  </button>
                ))}
              </div>
              <MetricTable
                cols={geoCols}
                rows={geoMode === 'state' ? data.breakdowns.geo_state : data.breakdowns.geo_city}
                testid="metrics-geo-table"
              />
            </>
          )}
          {bd === 'csid' && (
            <MetricTable cols={csidCols} rows={data.breakdowns.csid} testid="metrics-csid-table" />
          )}
          {bd === 'time' && (
            <MetricTable cols={timeCols} rows={data.breakdowns.time} testid="metrics-time-table" />
          )}
          {bd === 'device' && (
            <MetricTable cols={osCols} rows={data.breakdowns.device} testid="metrics-device-table" />
          )}
          {bd === 'referrer' && (
            <MetricTable cols={referrerCols} rows={data.breakdowns.referrer} testid="metrics-referrer-table" />
          )}
        </div>
      </div>
    </div>
  );
};
