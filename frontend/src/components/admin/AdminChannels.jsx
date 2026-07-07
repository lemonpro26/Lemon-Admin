import React from 'react';
import { Info, Phone, Users, Award, TrendingUp } from 'lucide-react';
import { NETWORKS } from '@/lib/networks';

// MOCKUP DATA — placeholder numbers so the owner can preview the per-network
// breakdown layout. Once network attribution goes live these values come from
// the API (calls/leads/retained/revenue/spend grouped by `network`).
const MOCK = {
  google: { calls: 128, leads: 342, retained: 21, revenue: 84500, spend: 12300, live: true },
  facebook: { calls: 46, leads: 190, retained: 9, revenue: 31200, spend: 6800 },
  instagram: { calls: 31, leads: 205, retained: 7, revenue: 22900, spend: 5400 },
  native: { calls: 18, leads: 96, retained: 4, revenue: 12100, spend: 3100 },
};

const usd = (n) => `$${(n || 0).toLocaleString('en-US')}`;
const money = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AdminChannels() {
  const rows = NETWORKS.map((n) => ({ ...n, ...(MOCK[n.key] || {}) }));
  const totals = rows.reduce((t, r) => ({
    calls: t.calls + (r.calls || 0),
    leads: t.leads + (r.leads || 0),
    retained: t.retained + (r.retained || 0),
    revenue: t.revenue + (r.revenue || 0),
    spend: t.spend + (r.spend || 0),
  }), { calls: 0, leads: 0, retained: 0, revenue: 0, spend: 0 });
  const maxRevenue = Math.max(...rows.map((r) => r.revenue || 0), 1);

  return (
    <div className="space-y-6" data-testid="admin-channels">
      {/* Preview banner */}
      <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3" data-testid="channels-preview-banner">
        <Info className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-violet-900">
          <span className="font-semibold">Design preview — numbers are placeholders.</span>{' '}
          Network attribution isn't live yet. Today all traffic is captured as <span className="font-semibold">Google</span>. Once we wire up UTM tags (<code className="text-xs bg-white/70 px-1 rounded">utm_source</code>/<code className="text-xs bg-white/70 px-1 rounded">utm_medium</code>) + click IDs (<code className="text-xs bg-white/70 px-1 rounded">fbclid</code>, <code className="text-xs bg-white/70 px-1 rounded">gclid</code>, <code className="text-xs bg-white/70 px-1 rounded">ttclid</code>), Facebook, Instagram &amp; Native will populate automatically.
        </div>
      </div>

      {/* Per-network summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => {
          const cpl = r.leads ? r.spend / r.leads : 0;
          const roas = r.spend ? r.revenue / r.spend : 0;
          return (
            <div key={r.key} className={`rounded-2xl border ${r.border} bg-white p-5 relative overflow-hidden`} data-testid={`channel-card-${r.key}`}>
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
                <Metric icon={<TrendingUp className="h-3.5 w-3.5" />} label="Revenue" value={usd(r.revenue)} />
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-xs">
                <span className="text-slate-500">CPL <span className="font-semibold text-slate-800">{money(cpl)}</span></span>
                <span className="text-slate-500">ROAS <span className="font-semibold text-slate-800">{roas.toFixed(1)}x</span></span>
              </div>
            </div>
          );
        })}
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
                <th className="px-5 py-3 font-semibold text-right">CPL</th>
                <th className="px-5 py-3 font-semibold text-right">ROAS</th>
                <th className="px-5 py-3 font-semibold w-40">Revenue share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cpl = r.leads ? r.spend / r.leads : 0;
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
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{usd(r.revenue)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{usd(r.spend)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{money(cpl)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{roas.toFixed(1)}x</td>
                    <td className="px-5 py-3">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round((r.revenue / maxRevenue) * 100)}%`, backgroundColor: r.color }} />
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
                <td className="px-5 py-3 text-right">{money(totals.leads ? totals.spend / totals.leads : 0)}</td>
                <td className="px-5 py-3 text-right">{(totals.spend ? totals.revenue / totals.spend : 0).toFixed(1)}x</td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-slate-400">{icon}{label}</div>
      <div className="text-lg font-bold text-slate-900 leading-tight">{value}</div>
    </div>
  );
}
