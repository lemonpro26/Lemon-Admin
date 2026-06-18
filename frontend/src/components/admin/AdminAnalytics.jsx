import React, { useEffect, useState, useCallback } from 'react';
import { BarChart3, RefreshCw, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useSortable, SortLabel } from '@/lib/useSortable';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

const NONE = '(untracked / direct)';

function Section({ title, columns, rows, testid }) {
  const { sorted, sortKey, sortDir, toggle } = useSortable(rows, 'leads', 'desc');
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" data-testid={testid}>
      <div className="px-5 py-3 border-b border-slate-100 font-slab font-bold text-slate-900">{title}</div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No data yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.num ? 'text-right' : ''}>
                    <SortLabel
                      label={c.label}
                      k={c.key}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClick={toggle}
                      align={c.num ? 'right' : 'left'}
                    />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.num ? 'text-right tabular-nums' : 'text-slate-700'}>
                      {c.render ? c.render(r) : (r[c.key] === '' || r[c.key] == null ? NONE : r[c.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const convCell = (r) => (
  <span className={`font-semibold ${r.conversion_rate >= 20 ? 'text-emerald-600' : r.conversion_rate > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
    {r.conversion_rate}%
  </span>
);

const bounceCell = (r) => (
  <span className={`font-semibold ${r.bounce_rate >= 70 ? 'text-red-500' : r.bounce_rate >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
    {r.bounce_rate}%
  </span>
);

export const AdminAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(todayRange());
  const editable = canEditFn();

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

  const editLabel = async (type, id) => {
    const current = (data?.ad_labels?.[type] || {})[String(id)] || '';
    const name = window.prompt(`Friendly name for this ${type} (ID ${id}):`, current);
    if (name === null) return;
    try {
      await api.post('/admin/ad-labels', { type, id: String(id), name });
      toast.success(name.trim() ? 'Name saved.' : 'Name cleared.');
      load();
    } catch (e) {
      toast.error('Could not save name.');
    }
  };

  useEffect(() => { load(); }, [load]);

  const header = (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <p className="text-sm text-slate-500 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" /> Clicks &amp; leads attributed by Google Ads parameters.
      </p>
      <div className="flex items-center gap-2">
        <DateRangeFilter value={range} onChange={setRange} />
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
  const nameCell = (type, idKey) => (r) => {
    const id = r[idKey];
    if (id === '' || id == null) return NONE;
    const name = (labels[type] || {})[String(id)];
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={name ? 'font-medium text-slate-900' : 'text-slate-700'}>{name || id}</span>
        {name && <span className="text-[10px] text-slate-400">#{id}</span>}
        {editable && (
          <button
            type="button"
            onClick={() => editLabel(type, id)}
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

  return (
    <div className="grid gap-6" data-testid="admin-analytics">
      {header}

      <Section
        title="By Campaign"
        testid="analytics-by-campaign"
        rows={data.by_campaign}
        columns={[
          { key: 'campaign_id', label: 'Campaign', render: nameCell('campaign', 'campaign_id') },
          { key: 'clicks', label: 'Clicks', num: true },
          { key: 'leads', label: 'Leads', num: true },
          { key: 'conversion_rate', label: 'Conv. Rate', num: true, render: convCell },
          { key: 'bounce_rate', label: 'Bounce Rate', num: true, render: bounceCell },
        ]}
      />

      <Section
        title="By Ad Group"
        testid="analytics-by-adgroup"
        rows={data.by_adgroup}
        columns={[
          { key: 'campaign_id', label: 'Campaign', render: nameCell('campaign', 'campaign_id') },
          { key: 'adgroup_id', label: 'Ad Group', render: nameCell('adgroup', 'adgroup_id') },
          { key: 'clicks', label: 'Clicks', num: true },
          { key: 'leads', label: 'Leads', num: true },
          { key: 'conversion_rate', label: 'Conv. Rate', num: true, render: convCell },
          { key: 'bounce_rate', label: 'Bounce Rate', num: true, render: bounceCell },
        ]}
      />

      <Section
        title="By Ad / Creative"
        testid="analytics-by-ad"
        rows={data.by_ad}
        columns={[
          { key: 'campaign_id', label: 'Campaign', render: nameCell('campaign', 'campaign_id') },
          { key: 'adgroup_id', label: 'Ad Group', render: nameCell('adgroup', 'adgroup_id') },
          { key: 'ad_id', label: 'Ad', render: nameCell('ad', 'ad_id') },
          { key: 'clicks', label: 'Clicks', num: true },
          { key: 'leads', label: 'Leads', num: true },
          { key: 'conversion_rate', label: 'Conv. Rate', num: true, render: convCell },
          { key: 'bounce_rate', label: 'Bounce Rate', num: true, render: bounceCell },
        ]}
      />

      <Section
        title="By Keyword"
        testid="analytics-by-keyword"
        rows={data.by_keyword}
        columns={[
          { key: 'keyword', label: 'Keyword' },
          { key: 'clicks', label: 'Clicks', num: true },
          { key: 'leads', label: 'Leads', num: true },
          { key: 'conversion_rate', label: 'Conv. Rate', num: true, render: convCell },
          { key: 'bounce_rate', label: 'Bounce Rate', num: true, render: bounceCell },
        ]}
      />
    </div>
  );
};
