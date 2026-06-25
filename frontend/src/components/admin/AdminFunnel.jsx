import React, { useCallback, useEffect, useState } from 'react';
import { Filter, ArrowDown, TrendingDown, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

const PAGES = [
  { key: 'overall', label: 'All Pages' },
  { key: 'home', label: 'Home' },
  { key: 'lapa', label: 'PA Page' },
  { key: 'sp', label: 'Spanish' },
];

function StageBar({ stage, topCount, isLast }) {
  const widthPct = topCount ? Math.max(2, (stage.count / topCount) * 100) : 0;
  return (
    <div data-testid={`funnel-stage-${stage.stage.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-semibold text-slate-800">{stage.stage}</span>
        <span className="text-slate-500">
          <span className="font-bold text-slate-900">{stage.count}</span>
          <span className="ml-2 text-xs">({stage.pct_of_views}% of views)</span>
        </span>
      </div>
      <div className="h-9 rounded-lg bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-lg transition-all ${isLast ? 'bg-emerald-500' : 'bg-[#0F1B3D]'}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      {stage.drop > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-rose-600 mt-1 mb-2 pl-1">
          <TrendingDown className="h-3.5 w-3.5" />
          <span><b>{stage.drop}</b> dropped off here ({stage.drop_pct}%)</span>
        </div>
      )}
    </div>
  );
}

export function AdminFunnel() {
  const [range, setRange] = useState(todayRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('overall');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/funnel', { params: { start: range.start, end: range.end } });
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load funnel');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const cur = data?.[page] || { views: 0, submitted: 0, calls: 0, conversions: 0, conversion_rate: 0, stages: [] };
  const topCount = cur.stages?.[0]?.count || 0;
  const isOverall = page === 'overall';

  return (
    <div className="space-y-6" data-testid="admin-funnel">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Filter className="h-4 w-4" /> Step-by-step funnel — see where visitors drop off on each landing page.
        </p>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Page selector */}
      <div className="flex flex-wrap gap-2" data-testid="funnel-page-tabs">
        {PAGES.map((p) => (
          <button
            key={p.key}
            onClick={() => setPage(p.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${page === p.key ? 'bg-[#0F1B3D] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            data-testid={`funnel-page-${p.key}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">Landing Views</div>
          <div className="mt-1 text-3xl font-extrabold text-[#0F1B3D]" data-testid="funnel-views">{loading ? '—' : cur.views}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">Form Leads</div>
          <div className="mt-1 text-3xl font-extrabold text-emerald-600" data-testid="funnel-submitted">{loading ? '—' : cur.submitted}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500 flex items-center gap-1.5">
            <PhoneCall className="h-3.5 w-3.5" /> Phone Calls
          </div>
          <div className="mt-1 text-3xl font-extrabold text-indigo-600" data-testid="funnel-calls">{loading ? '—' : (cur.calls || 0)}</div>
          {!isOverall && !loading && <div className="text-[11px] text-slate-400 mt-1">Calls aren't page-specific — see All Pages</div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">Overall Conversion</div>
          <div className="mt-1 text-3xl font-extrabold text-[#0F1B3D]" data-testid="funnel-conv">{loading ? '—' : `${cur.conversion_rate}%`}</div>
          {isOverall && !loading && (
            <div className="text-[11px] text-slate-400 mt-1" data-testid="funnel-conv-note">
              {cur.submitted} leads + {cur.calls || 0} calls ÷ {cur.views} views
            </div>
          )}
        </div>
      </div>

      {/* Funnel bars */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="funnel-chart">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : topCount === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm" data-testid="funnel-empty">
            No funnel activity for this page in the selected range. New visits will populate here as people move through the steps.
          </div>
        ) : (
          <div className="space-y-1">
            {cur.stages.map((s, i) => (
              <StageBar key={s.stage} stage={s} topCount={topCount} isLast={i === cur.stages.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
