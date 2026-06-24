import React, { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Copy, Check, Trophy, Save, Home as HomeIcon, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { DateRangeFilter } from '@/components/admin/DateRangeFilter';

const last30 = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const iso = (d) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  return { start: iso(start), end: iso(end) };
};

const VARIANTS = [
  { key: 'home', label: 'Home Page', path: '/', icon: HomeIcon },
  { key: 'pa', label: 'PA Advertorial', path: '/pa', icon: FileText },
];

function VariantCard({ v, stat, weight, isWinner, isLeading }) {
  const Icon = v.icon;
  return (
    <div
      className={`rounded-2xl border p-5 bg-white transition-colors ${
        isLeading ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
      }`}
      data-testid={`split-variant-${v.key}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-slab font-bold text-slate-900">
          <Icon className="h-4 w-4 text-[#0F1B3D]" /> {v.label}
          <code className="text-xs font-normal text-slate-400">{v.path}</code>
        </div>
        {isWinner && (
          <span
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full"
            data-testid={`split-winner-${v.key}`}
          >
            <Trophy className="h-3.5 w-3.5" /> Winning
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-2xl font-extrabold text-slate-900" data-testid={`split-${v.key}-clicks`}>{stat.clicks}</div>
          <div className="text-xs text-slate-500 mt-0.5">Visits</div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-slate-900" data-testid={`split-${v.key}-leads`}>{stat.leads}</div>
          <div className="text-xs text-slate-500 mt-0.5">Leads</div>
        </div>
        <div>
          <div
            className={`text-2xl font-extrabold ${isLeading ? 'text-emerald-600' : 'text-[#0F1B3D]'}`}
            data-testid={`split-${v.key}-conv`}
          >
            {stat.conversion_rate}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Conv. %</div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
        Traffic weight: <span className="font-bold text-slate-700">{weight}%</span>
      </div>
    </div>
  );
}

export function AdminSplitTest() {
  const canEdit = canEditFn();
  const [range, setRange] = useState(last30());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [homePct, setHomePct] = useState(50);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const splitUrl = `${window.location.origin}/split`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/split-test', { params: { start: range.start, end: range.end } });
      setData(res.data);
      setEnabled(!!res.data.enabled);
      setHomePct(Number(res.data.home_pct ?? 50));
    } catch (e) {
      toast.error('Failed to load split test');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/split-test', { enabled, home_pct: homePct });
      toast.success('Split test saved');
      load();
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(splitUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stats = data?.stats || { home: { clicks: 0, leads: 0, conversion_rate: 0 }, pa: { clicks: 0, leads: 0, conversion_rate: 0 }, winner: null };
  const winner = stats.winner;
  const weights = { home: homePct, pa: 100 - homePct };

  return (
    <div className="space-y-6" data-testid="admin-split-test">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" /> A/B test your two landing pages and compare conversion %.
        </p>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Config */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="split-config">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-slab font-bold text-slate-900">Auto-splitter</div>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              When ON, visitors to <code>/split</code> are randomly routed to Home or the PA page
              (stable per visitor). When OFF, everyone goes to Home.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
              {enabled ? 'Live' : 'Off'}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!canEdit}
              data-testid="split-enable-switch"
            />
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-2">
            <span>Home <span className="text-[#0F1B3D]">{homePct}%</span></span>
            <span>PA <span className="text-[#0F1B3D]">{100 - homePct}%</span></span>
          </div>
          <Slider
            value={[homePct]}
            min={0}
            max={100}
            step={5}
            onValueChange={(v) => setHomePct(v[0])}
            disabled={!canEdit}
            data-testid="split-weight-slider"
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">Home %</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={homePct}
              onChange={(e) => setHomePct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              disabled={!canEdit}
              className="w-24 h-9"
              data-testid="split-home-pct-input"
            />
          </div>
        </div>

        {canEdit && (
          <div className="mt-5">
            <Button onClick={save} disabled={saving} className="rounded-xl bg-[#0F1B3D]" data-testid="split-save-button">
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save split test'}
            </Button>
          </div>
        )}

        {/* Splitter URL */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="text-sm font-semibold text-slate-700 mb-2">Campaign URL — point Google Ads here:</div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800" data-testid="split-url">
              {splitUrl}
            </code>
            <Button variant="outline" onClick={copyUrl} className="rounded-xl" data-testid="split-copy-button">
              {copied ? <Check className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </div>

      {/* Comparison */}
      <div>
        <div className="font-slab font-bold text-slate-900 mb-3">Performance ({range.start} → {range.end})</div>
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {VARIANTS.map((v) => (
              <VariantCard
                key={v.key}
                v={v}
                stat={stats[v.key]}
                weight={weights[v.key]}
                isWinner={winner === v.key}
                isLeading={winner === v.key}
              />
            ))}
          </div>
        )}
        {!loading && winner === 'tie' && (
          <p className="mt-3 text-sm text-amber-600" data-testid="split-tie">Both pages are converting at the same rate so far.</p>
        )}
        {!loading && !winner && (
          <p className="mt-3 text-sm text-slate-500" data-testid="split-need-data">
            Need visits on both pages in this date range to declare a winner.
          </p>
        )}
      </div>
    </div>
  );
}
