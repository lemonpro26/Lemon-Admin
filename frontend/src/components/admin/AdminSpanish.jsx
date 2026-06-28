import React, { useCallback, useEffect, useState } from 'react';
import { Languages, Copy, Check, Save, MousePointerClick, Users, TrendingUp, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';
import { AdminHooks } from '@/components/admin/AdminHooks';

function StatCard({ icon: Icon, label, value, testid }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid={testid}>
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-3xl font-extrabold text-[#0F1B3D]">{value}</div>
    </div>
  );
}

function BreakdownTable({ title, rows, labels, fields, testid }) {
  const nameOf = (f, val) => {
    const map = (labels && labels[f.labelKey]) || {};
    return map[val] || val || '(untracked / direct)';
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid={testid}>
      <div className="px-5 py-3 border-b border-slate-100 font-slab font-bold text-slate-900">{title}</div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No Spanish-page traffic in this range yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {fields.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Conv. %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {fields.map((f) => (
                    <TableCell key={f.key} className="font-medium text-slate-800">
                      {nameOf(f, r[f.key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">{r.clicks}</TableCell>
                  <TableCell className="text-right">{r.leads}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.conversion_rate >= 20 ? 'text-emerald-600' : r.conversion_rate > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {r.conversion_rate}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function AdminSpanish() {
  const canEdit = canEditFn();
  const [range, setRange] = useState(todayRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeHooks, setActiveHooks] = useState([]);
  const [defaultHook, setDefaultHook] = useState(null);
  const [hook1, setHook1] = useState('');
  const [hook2, setHook2] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const spUrl = `${window.location.origin}/sp`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/spanish', { params: { start: range.start, end: range.end } });
      setData(res.data);
      setHook1(res.data.hook1_es || '');
      setHook2(res.data.hook2_es || '');
      try {
        const hr = await api.get('/admin/hook-rules', { params: { start: range.start, end: range.end, lang: 'es' } });
        setActiveHooks((hr.data.rules || []).filter((r) => r.enabled !== false && !r.archived));
        setDefaultHook(hr.data.default || null);
      } catch (e) { setActiveHooks([]); setDefaultHook(null); }
    } catch (e) {
      toast.error('Failed to load Spanish page data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/spanish', { hook1_es: hook1, hook2_es: hook2 });
      toast.success('Spanish hooks saved');
      load();
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(spUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stats = data?.stats || { clicks: 0, leads: 0, conversion_rate: 0 };
  const labels = data?.ad_labels || {};

  return (
    <div className="space-y-6" data-testid="admin-spanish">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Languages className="h-4 w-4" /> Spanish landing page (<code>/sp</code>) — edit hooks &amp; track performance.
        </p>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* URL */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="spanish-url-card">
        <div className="text-sm font-semibold text-slate-700 mb-2">Spanish page URL — point Spanish Google Ads here:</div>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800" data-testid="spanish-url">{spUrl}</code>
          <Button variant="outline" onClick={copyUrl} className="rounded-xl" data-testid="spanish-copy-button">
            {copied ? <Check className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* Active Spanish hooks — at-a-glance summary + performance */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid="spanish-active-hooks">
        <div className="px-5 py-3 border-b border-slate-100 font-slab font-bold text-slate-900 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-[#EF4444]" /> Active Spanish Hooks
          <span className="ml-1 text-xs font-sans font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5" data-testid="spanish-active-hooks-count">
            {loading ? '—' : `${activeHooks.length} live`}
          </span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hook</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Conv. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeHooks.map((r) => (
                  <TableRow key={r.id} data-testid={`spanish-active-hook-${r.id}`}>
                    <TableCell className="max-w-md">
                      <div className="font-medium text-slate-900 truncate">{r.label || '(untitled)'}</div>
                      <div className="text-xs text-slate-400 truncate">{r.hook1}</div>
                    </TableCell>
                    <TableCell className="text-right text-slate-600">{r.weight}%</TableCell>
                    <TableCell className="text-right">{r.clicks}</TableCell>
                    <TableCell className="text-right">{r.leads}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.conversion_rate >= 20 ? 'text-emerald-600' : r.conversion_rate > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {r.conversion_rate}%
                    </TableCell>
                  </TableRow>
                ))}
                {defaultHook && (
                  <TableRow className="bg-slate-50/60" data-testid="spanish-active-hook-default">
                    <TableCell className="max-w-md">
                      <div className="font-medium text-slate-700 truncate">{defaultHook.label}</div>
                      <div className="text-xs text-slate-400 truncate">{defaultHook.hook1}</div>
                    </TableCell>
                    <TableCell className="text-right text-slate-400">—</TableCell>
                    <TableCell className="text-right">{defaultHook.clicks}</TableCell>
                    <TableCell className="text-right">{defaultHook.leads}</TableCell>
                    <TableCell className={`text-right font-semibold ${defaultHook.conversion_rate >= 20 ? 'text-emerald-600' : defaultHook.conversion_rate > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {defaultHook.conversion_rate}%
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Spanish hook variants (A/B + versioned history, same as Hooks tab) */}
      <div data-testid="spanish-hooks-card">
        <div className="font-slab font-bold text-slate-900 mb-2">Spanish Hook Variants &amp; Performance</div>
        <AdminHooks canEdit={canEdit} lang="es" />
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={MousePointerClick} label="Visits" value={loading ? '—' : stats.clicks} testid="spanish-stat-clicks" />
        <StatCard icon={Users} label="Leads" value={loading ? '—' : stats.leads} testid="spanish-stat-leads" />
        <StatCard icon={TrendingUp} label="Conversion %" value={loading ? '—' : `${stats.conversion_rate}%`} testid="spanish-stat-conv" />
      </div>

      {/* Breakdowns */}
      {!loading && data && (
        <div className="space-y-4">
          <BreakdownTable
            title="By Campaign"
            rows={data.by_campaign || []}
            labels={labels}
            fields={[{ key: 'campaign_id', label: 'Campaign', labelKey: 'campaign' }]}
            testid="spanish-by-campaign"
          />
          <BreakdownTable
            title="By Ad Group"
            rows={data.by_adgroup || []}
            labels={labels}
            fields={[{ key: 'campaign_id', label: 'Campaign', labelKey: 'campaign' }, { key: 'adgroup_id', label: 'Ad Group', labelKey: 'adgroup' }]}
            testid="spanish-by-adgroup"
          />
        </div>
      )}
    </div>
  );
}
