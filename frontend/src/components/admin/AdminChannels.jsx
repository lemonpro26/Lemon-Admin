import React, { useEffect, useState } from 'react';
import { Info, Phone, Users, Award, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { NETWORKS } from '@/lib/networks';
import { DateRangeFilter } from '@/components/admin/DateRangeFilter';

const usd = (n) => `$${Math.round(n || 0).toLocaleString('en-US')}`;
const money = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const last30 = () => {
  const iso = (d) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return { start: iso(start), end: iso(end) };
};

export function AdminChannels() {
  const [range, setRange] = useState(last30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/admin/channels/summary?start=${range.start}&end=${range.end}`)
      .then((res) => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.start, range.end]);

  const net = data?.networks || {};
  const rows = NETWORKS.map((n) => ({ ...n, ...(net[n.key] || { calls: 0, leads: 0, retained: 0, revenue: 0, spend: 0, spend_by_day: [] }) }));
  const totals = rows.reduce((t, r) => ({
    calls: t.calls + (r.calls || 0), leads: t.leads + (r.leads || 0), retained: t.retained + (r.retained || 0),
    revenue: t.revenue + (r.revenue || 0), spend: t.spend + (r.spend || 0),
  }), { calls: 0, leads: 0, retained: 0, revenue: 0, spend: 0 });
  const maxSpend = Math.max(...rows.map((r) => r.spend || 0), 1);
  const googleByDay = (net.google?.spend_by_day) || [];
  const maxDay = Math.max(...googleByDay.map((d) => d.cost || 0), 1);

  return (
    <div className="space-y-6" data-testid="admin-channels">
      {/* Header + date range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Performance by traffic network.
        </p>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Status banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" data-testid="channels-preview-banner">
        <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-emerald-900">
          <span className="font-semibold">Google spend is now LIVE</span> — pulled straight from the Google Ads API by day. Google calls, leads, retained &amp; revenue come from your database. <span className="font-semibold">Facebook, Instagram &amp; Native stay at 0</span> until network attribution is switched on (UTM tags + click IDs like <code className="text-xs bg-white/70 px-1 rounded">fbclid</code>).
        </div>
      </div>

      {/* Per-network summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => {
          const contacts = (r.calls || 0) + (r.leads || 0);
          const cpl = contacts ? r.spend / contacts : 0;
          const cpa = r.retained ? r.spend / r.retained : 0;
          const roas = r.spend ? r.revenue / r.spend : 0;
          return (
            <div key={r.key} className={`rounded-2xl border ${r.border} bg-white p-5`} data-testid={`channel-card-${r.key}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${r.bg}`} style={{ color: r.color }}>
                    <r.Icon className="h-5 w-5" />
                  </span>
                  <span className="font-slab font-bold text-slate-900">{r.label}</span>
                </div>
                {r.live ? (
                  <span className="text-[9px] font-bold uppercase tracking-wide rounded-full bg-green-100 text-green-700 px-2 py-0.5">Live</span>
                ) : (
                  <span className="text-[9px] font-bold uppercase tracking-wide rounded-full bg-slate-100 text-slate-400 px-2 py-0.5">Soon</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-y-3">
                <Metric icon={<Phone className="h-3.5 w-3.5" />} label="Calls" value={r.calls} />
                <Metric icon={<Users className="h-3.5 w-3.5" />} label="Leads" value={r.leads} />
                <Metric icon={<Award className="h-3.5 w-3.5" />} label="Retained" value={r.retained} />
                <Metric icon={<TrendingUp className="h-3.5 w-3.5" />} label="Spend" value={usd(r.spend)} highlight={r.live} />
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <span className="text-slate-500">Revenue <span className="font-semibold text-slate-800">{usd(r.revenue)}</span></span>
                <span className="text-slate-500">ROAS <span className="font-semibold text-slate-800">{r.spend ? `${roas.toFixed(1)}x` : '—'}</span></span>
                <span className="text-slate-500" title="Spend ÷ (Calls + Leads)">CPL <span className="font-semibold text-slate-800">{contacts ? money(cpl) : '—'}</span></span>
                <span className="text-slate-500" title="Spend ÷ Retained">CPA <span className="font-semibold text-slate-800">{r.retained ? money(cpa) : '—'}</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Google spend by day */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="channels-google-spend-by-day">
        <div className="flex items-center justify-between mb-4">
          <div className="font-slab font-bold text-slate-900">Google spend by day</div>
          <div className="text-sm text-slate-500">Total <span className="font-bold text-slate-900">{usd(net.google?.spend || 0)}</span></div>
        </div>
        {loading ? (
          <div className="text-sm text-slate-400 py-6 text-center">Loading Google Ads spend…</div>
        ) : googleByDay.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">No Google Ads spend in this range.</div>
        ) : (
          <div className="flex items-end gap-1.5 h-40 overflow-x-auto pb-1">
            {googleByDay.map((d) => (
              <div key={d.date} className="flex flex-col items-center justify-end gap-1 min-w-[26px] group" title={`${d.date}: ${money(d.cost)}`}>
                <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{usd(d.cost)}</span>
                <div className="w-4 rounded-t bg-blue-500 hover:bg-blue-600 transition-colors" style={{ height: `${Math.max((d.cost / maxDay) * 120, 2)}px` }} />
                <span className="text-[8px] text-slate-400 whitespace-nowrap">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparison table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 font-slab font-bold text-slate-900">Network performance</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="channels-table">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">Network</th>
                <th className="px-5 py-3 font-semibold text-right">Calls</th>
                <th className="px-5 py-3 font-semibold text-right">Leads</th>
                <th className="px-5 py-3 font-semibold text-right">Retained</th>
                <th className="px-5 py-3 font-semibold text-right">Revenue</th>
                <th className="px-5 py-3 font-semibold text-right">Spend</th>
                <th className="px-5 py-3 font-semibold text-right" title="Spend ÷ (Calls + Leads)">CPL</th>
                <th className="px-5 py-3 font-semibold text-right" title="Spend ÷ Retained">CPA</th>
                <th className="px-5 py-3 font-semibold text-right">ROAS</th>
                <th className="px-5 py-3 font-semibold w-40">Spend share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const contacts = (r.calls || 0) + (r.leads || 0);
                const cpl = contacts ? r.spend / contacts : 0;
                const cpa = r.retained ? r.spend / r.retained : 0;
                const roas = r.spend ? r.revenue / r.spend : 0;
                return (
                  <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50/60" data-testid={`channels-row-${r.key}`}>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                        <r.Icon className="h-4 w-4" style={{ color: r.color }} /> {r.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-700">{r.calls}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{r.leads}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{r.retained}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{usd(r.revenue)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{usd(r.spend)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{contacts ? money(cpl) : '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{r.retained ? money(cpa) : '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{r.spend ? `${roas.toFixed(1)}x` : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round((r.spend / maxSpend) * 100)}%`, backgroundColor: r.color }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right">{totals.calls}</td>
                <td className="px-5 py-3 text-right">{totals.leads}</td>
                <td className="px-5 py-3 text-right">{totals.retained}</td>
                <td className="px-5 py-3 text-right">{usd(totals.revenue)}</td>
                <td className="px-5 py-3 text-right">{usd(totals.spend)}</td>
                <td className="px-5 py-3 text-right">{(totals.calls + totals.leads) ? money(totals.spend / (totals.calls + totals.leads)) : '—'}</td>
                <td className="px-5 py-3 text-right">{totals.retained ? money(totals.spend / totals.retained) : '—'}</td>
                <td className="px-5 py-3 text-right">{totals.spend ? `${(totals.revenue / totals.spend).toFixed(1)}x` : '—'}</td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, highlight }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-slate-400">{icon}{label}</div>
      <div className={`text-lg font-bold leading-tight ${highlight ? 'text-blue-600' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
