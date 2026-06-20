import React, { useEffect, useState, useCallback } from 'react';
import {
  Megaphone, Plus, Pencil, Trash2, Save, Sparkles, MousePointerClick, Target, FlaskConical,
  Search, Eye, EyeOff, ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

// Client-side mirror of the backend macro stripping (for live preview).
function renderPreview(text, city, state) {
  let res = text || '';
  if (city) res = res.replace(/\{!\s*city\s*\}/gi, city);
  else res = res.replace(/\{!\s*city\s*\},?\s/gi, '').replace(/\s?\{!\s*city\s*\}/gi, '');
  if (state) res = res.replace(/\{!\s*state\s*\}/gi, state);
  else res = res.replace(/\{!\s*state\s*\},?\s/gi, '').replace(/\s?\{!\s*state\s*\}/gi, '');
  res = res.replace(/\s+([.,!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return res.replace(/^[,\s]+|[,\s]+$/g, '').trim();
}

const SAMPLE = { city: 'Los Angeles', state: 'California' };
const HOME = 'home';

// Bucket = the set of variants that compete for the same traffic.
const bucketKey = (r) => `${r.match_campaign || ''}|${r.match_adgroup || ''}|${r.match_ad || ''}`;

const newCreateForm = () => ({ hook1: '', hook2: '', target: HOME, weight: 50, label: '' });
const EMPTY_EDIT = {
  label: '', match_campaign: '', match_adgroup: '', match_ad: '', hook1: '', hook2: '', weight: 50, enabled: true,
};
const EMPTY_MOVE = { kind: HOME, adgroup: '', ad: '' };

export const AdminHooks = ({ canEdit }) => {
  const [rules, setRules] = useState([]);
  const [defaultHook, setDefaultHook] = useState(null);
  const [entities, setEntities] = useState({ campaigns: [], adgroups: [] });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(todayRange());

  const [cForm, setCForm] = useState(newCreateForm());
  const [creating, setCreating] = useState(false);

  const [dialog, setDialog] = useState(null); // {rule}
  const [form, setForm] = useState(EMPTY_EDIT);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [moveDialog, setMoveDialog] = useState(null); // {rule}
  const [moveForm, setMoveForm] = useState(EMPTY_MOVE);
  const [moving, setMoving] = useState(false);

  // Friendly-name maps from captured entities.
  const agName = {};
  (entities.adgroups || []).forEach((a) => { if (a.adgroup_name) agName[a.adgroup_id] = a.adgroup_name; });
  const adName = {};
  (entities.ads || []).forEach((a) => { if (a.ad_name) adName[a.ad_id] = a.ad_name; });
  const campName = {};
  (entities.campaigns || []).forEach((c) => { if (c.campaign_name) campName[c.campaign_id] = c.campaign_name; });

  const targetText = (r) => {
    if (r.match_ad) return `Ad: ${adName[r.match_ad] || r.match_ad}`;
    if (r.match_adgroup) return `Ad group: ${agName[r.match_adgroup] || r.match_adgroup}`;
    if (r.match_campaign) return `Campaign: ${campName[r.match_campaign] || r.match_campaign}`;
    return 'Home page (all traffic)';
  };

  const loadEntities = useCallback(async () => {
    try {
      const res = await api.get('/admin/ad-entities');
      setEntities(res.data);
    } catch (e) { /* noop */ }
  }, []);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/hook-rules', { params: { start: range.start, end: range.end } });
      setRules(res.data.rules || []);
      setDefaultHook(res.data.default || null);
    } catch (e) {
      toast.error('Failed to load hooks.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { loadEntities(); }, [loadEntities]);
  useEffect(() => { loadRules(); }, [loadRules]);

  // Serving share within a variant's competing bucket (enabled variants only).
  const servingPct = (r) => {
    const key = bucketKey(r);
    const peers = rules.filter((x) => x.enabled !== false && bucketKey(x) === key);
    const denom = peers.reduce((s, x) => s + (Number(x.weight) || 0), 0);
    if (!denom) return 0;
    return Math.round(((Number(r.weight) || 0) / denom) * 100);
  };

  const targetFromForm = (target) => {
    if (target === HOME) return { match_campaign: '', match_adgroup: '', match_ad: '' };
    const ag = entities.adgroups.find((a) => a.adgroup_id === target);
    return { match_campaign: '', match_adgroup: target, match_ad: '' };
  };

  const create = async () => {
    if (!cForm.hook1.trim() || !cForm.hook2.trim()) {
      toast.error('Hook 1 and Hook 2 are required.');
      return;
    }
    const w = Math.max(1, Math.min(100, Number(cForm.weight) || 0));
    const tgt = targetFromForm(cForm.target);
    const label = cForm.label.trim()
      || `${cForm.target === HOME ? 'Home' : cForm.target} — ${cForm.hook1.slice(0, 40)}`;
    setCreating(true);
    try {
      await api.post('/admin/hook-rules', { label, hook1: cForm.hook1, hook2: cForm.hook2, weight: w, enabled: true, ...tgt });
      toast.success('Hook saved to A/B variants.');
      setCForm(newCreateForm());
      await loadRules();
      await loadEntities();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed.');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (r) => {
    setForm({
      label: r.label || '', match_campaign: r.match_campaign || '', match_adgroup: r.match_adgroup || '',
      match_ad: r.match_ad || '', hook1: r.hook1 || '', hook2: r.hook2 || '',
      weight: r.weight ?? 50, enabled: r.enabled !== false,
    });
    setDialog({ rule: r });
  };

  const saveEdit = async () => {
    if (!form.hook1.trim() || !form.hook2.trim()) {
      toast.error('Hook 1 and Hook 2 are required.');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/admin/hook-rules/${dialog.rule.id}`, {
        ...form,
        label: form.label.trim() || form.hook1.slice(0, 40),
        weight: Math.max(1, Math.min(100, Number(form.weight) || 0)),
      });
      toast.success('Hook updated.');
      setDialog(null);
      await loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async (r) => {
    try {
      await api.put(`/admin/hook-rules/${r.id}`, {
        label: r.label, match_campaign: r.match_campaign || '', match_adgroup: r.match_adgroup || '',
        match_ad: r.match_ad || '', hook1: r.hook1, hook2: r.hook2, weight: r.weight ?? 50, enabled: !r.enabled,
      });
      toast.success(!r.enabled ? 'Hook activated.' : 'Hook paused.');
      await loadRules();
    } catch (e) {
      toast.error('Could not update status.');
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete hook "${r.label}"?`)) return;
    try {
      await api.delete(`/admin/hook-rules/${r.id}`);
      toast.success('Hook deleted.');
      await loadRules();
    } catch (e) {
      toast.error('Delete failed.');
    }
  };

  // Hide / unhide from view only (does NOT pause serving).
  const toggleHidden = async (r) => {
    try {
      await api.put(`/admin/hook-rules/${r.id}`, {
        label: r.label, match_campaign: r.match_campaign || '', match_adgroup: r.match_adgroup || '',
        match_ad: r.match_ad || '', hook1: r.hook1, hook2: r.hook2, weight: r.weight ?? 50,
        enabled: r.enabled !== false, hidden: !r.hidden,
      });
      toast.success(!r.hidden ? 'Hook hidden from view.' : 'Hook shown.');
      await loadRules();
    } catch (e) {
      toast.error('Could not update visibility.');
    }
  };

  const openMove = (r) => {
    setMoveForm({
      kind: r.match_ad ? 'ad' : (r.match_adgroup ? 'adgroup' : HOME),
      adgroup: r.match_adgroup || '', ad: r.match_ad || '',
    });
    setMoveDialog({ rule: r });
  };

  // "Move target" = keep the original (paused, stats preserved) + spawn a brand-new
  // hook with the new target inheriting the same copy & weight.
  const confirmMove = async () => {
    const r = moveDialog.rule;
    let tgt = { match_campaign: '', match_adgroup: '', match_ad: '' };
    let suffix = 'Home';
    if (moveForm.kind === 'adgroup') {
      if (!moveForm.adgroup) { toast.error('Pick an ad group.'); return; }
      tgt.match_adgroup = moveForm.adgroup;
      suffix = `AG ${agName[moveForm.adgroup] || moveForm.adgroup}`;
    } else if (moveForm.kind === 'ad') {
      if (!moveForm.ad) { toast.error('Pick an ad.'); return; }
      tgt.match_ad = moveForm.ad;
      suffix = `Ad ${adName[moveForm.ad] || moveForm.ad}`;
    }
    setMoving(true);
    try {
      // 1) create the new hook on the new target
      await api.post('/admin/hook-rules', {
        label: `${r.label} → ${suffix}`, hook1: r.hook1, hook2: r.hook2,
        weight: r.weight ?? 50, enabled: true, ...tgt,
      });
      // 2) pause the original (keeps its accumulated stats)
      await api.put(`/admin/hook-rules/${r.id}`, {
        label: r.label, match_campaign: r.match_campaign || '', match_adgroup: r.match_adgroup || '',
        match_ad: r.match_ad || '', hook1: r.hook1, hook2: r.hook2, weight: r.weight ?? 50,
        enabled: false, hidden: r.hidden || false,
      });
      toast.success('New hook created on the new target. Original paused (stats kept).');
      setMoveDialog(null);
      await loadRules();
      await loadEntities();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Move failed.');
    } finally {
      setMoving(false);
    }
  };

  // Group variants by bucket so competing A/B variants sit together.
  // Apply the search filter + hide filter to what's DISPLAYED (serving math still
  // uses all enabled rules via servingPct).
  const q = search.trim().toLowerCase();
  const hiddenCount = rules.filter((r) => r.hidden).length;
  const visibleRules = rules.filter((r) => {
    if (!showHidden && r.hidden) return false;
    if (!q) return true;
    return [r.label, r.hook1, r.hook2, targetText(r)]
      .filter(Boolean).some((s) => s.toLowerCase().includes(q));
  });

  const groups = {};
  visibleRules.forEach((r) => {
    const k = bucketKey(r);
    (groups[k] = groups[k] || { target: targetText(r), rows: [] }).rows.push(r);
  });
  const groupList = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="grid gap-6" data-testid="admin-hooks">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" /> A/B test hooks — each variant serves a % of its matching traffic.
        </p>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Create / save a hook variant */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#EF4444]" /> Create a Hook
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Save a hook for the home page or a specific ad group, and set how much of that traffic should see it.
            Add more variants to the same target to split-test. Use{' '}
            <code className="px-1 bg-slate-100 rounded">{'{!city}'}</code> /{' '}
            <code className="px-1 bg-slate-100 rounded">{'{!state}'}</code> for live location text.
          </p>
          <div className="grid gap-4">
            <div>
              <Label className="text-xs text-slate-600">Hook 1 (headline)</Label>
              <Textarea value={cForm.hook1} onChange={(e) => setCForm({ ...cForm, hook1: e.target.value })} rows={2} placeholder="Stuck With a Lemon? You May Be Owed Money." className="mt-1 rounded-xl border-slate-200" data-testid="hooks-create-hook1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Hook 2 (subtext)</Label>
              <Textarea value={cForm.hook2} onChange={(e) => setCForm({ ...cForm, hook2: e.target.value })} rows={2} placeholder="Find out in 60 seconds if your {!state} vehicle qualifies." className="mt-1 rounded-xl border-slate-200" data-testid="hooks-create-hook2" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-600">Show this hook on</Label>
                <Select value={cForm.target} onValueChange={(v) => setCForm({ ...cForm, target: v })}>
                  <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hooks-create-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={HOME}>Home page (all traffic)</SelectItem>
                    {entities.adgroups.map((a) => (
                      <SelectItem key={`${a.campaign_id}-${a.adgroup_id}`} value={a.adgroup_id}>
                        Ad group: {a.adgroup_name || a.adgroup_id}
                        {a.campaign_name ? ` · ${a.campaign_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-600">% of serving (share of traffic)</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number" min={1} max={100}
                    value={cForm.weight}
                    onChange={(e) => setCForm({ ...cForm, weight: e.target.value })}
                    className="h-10 rounded-lg border-slate-200"
                    data-testid="hooks-create-weight"
                  />
                  <span className="text-slate-500 font-medium">%</span>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm" data-testid="hooks-create-preview">
              <span className="text-slate-900 font-semibold">{renderPreview(cForm.hook1, SAMPLE.city, SAMPLE.state) || 'Preview\u2026'}</span><br />
              <span className="text-slate-600">{renderPreview(cForm.hook2, SAMPLE.city, SAMPLE.state)}</span>
            </div>
            <div>
              <Button onClick={create} disabled={creating} className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="hooks-create-save">
                <Save className="h-4 w-4 mr-2" /> {creating ? 'Saving\u2026' : 'Save Hook'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Variants + per-hook stats */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="font-slab font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-[#EF4444]" /> Hook Variants &amp; Performance
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search hooks…"
                className="h-9 w-44 pl-8 rounded-lg border-slate-200"
                data-testid="hooks-search"
              />
            </div>
            {hiddenCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHidden((v) => !v)}
                className="h-9 rounded-lg border-slate-200"
                data-testid="hooks-toggle-hidden"
              >
                {showHidden ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
                {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading hooks…</div>
        ) : groupList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {rules.length === 0
              ? 'No hook variants yet — create one above and set it to the home page or an ad group.'
              : 'No hooks match your search / filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hook</TableHead>
                  <TableHead className="hidden md:table-cell">Target</TableHead>
                  <TableHead className="text-right">Serving %</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Conversions</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Conv %</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupList.map(([key, grp]) => (
                  <React.Fragment key={key}>
                    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                      <TableCell colSpan={8} className="py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {grp.target} · {grp.rows.length} variant{grp.rows.length > 1 ? 's' : ''}
                      </TableCell>
                    </TableRow>
                    {grp.rows.map((r) => (
                      <TableRow key={r.id} data-testid={`hook-row-${r.id}`} className={r.hidden ? 'opacity-60' : ''}>
                        <TableCell>
                          <div className="font-medium text-slate-900 flex items-center gap-2">
                            {r.label}
                            {r.hidden && <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px]">hidden</Badge>}
                          </div>
                          <div className="text-xs text-slate-400 max-w-[260px] truncate">{r.hook1}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-slate-600 text-sm">{targetText(r)}</TableCell>
                        <TableCell className="text-right">
                          <div className="font-semibold tabular-nums text-slate-900" data-testid={`hook-serving-${r.id}`}>{servingPct(r)}%</div>
                          <div className="text-[11px] text-slate-400">weight {r.weight}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums" data-testid={`hook-clicks-${r.id}`}>{r.clicks}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium" data-testid={`hook-conversions-${r.id}`}>{r.leads}</TableCell>
                        <TableCell className="text-right tabular-nums hidden sm:table-cell" data-testid={`hook-convrate-${r.id}`}>{r.conversion_rate}%</TableCell>
                        <TableCell className="text-center">
                          {canEdit ? (
                            <Switch checked={r.enabled !== false} onCheckedChange={() => togglePause(r)} data-testid={`hook-toggle-${r.id}`} />
                          ) : (
                            <Badge variant="outline" className={r.enabled !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500'}>
                              {r.enabled !== false ? 'Live' : 'Paused'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {canEdit && (
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => openMove(r)} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors" data-testid={`hook-move-${r.id}`} aria-label="Move target" title="Move to a different target (forks a new hook)"><ArrowRightLeft className="h-4 w-4" /></button>
                              <button onClick={() => toggleHidden(r)} className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors" data-testid={`hook-hide-${r.id}`} aria-label={r.hidden ? 'Show' : 'Hide'} title={r.hidden ? 'Show in list' : 'Hide from list (keeps serving)'}>{r.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                              <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors" data-testid={`hook-edit-${r.id}`} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                              <button onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-red-600 transition-colors" data-testid={`hook-delete-${r.id}`} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Fallback (shown only when no home-page variant is live) */}
        {defaultHook && (
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-x-4 gap-y-1 flex-wrap" data-testid="hooks-default-fallback">
            <span className="font-semibold text-slate-600">Default fallback:</span>
            <span className="truncate max-w-[360px]">{defaultHook.hook1}</span>
            <span className="flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" /> {defaultHook.clicks}</span>
            <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" /> {defaultHook.leads}</span>
            <span className="text-slate-400">(shown only when no home-page variant is live)</span>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg" data-testid="hook-dialog">
          <DialogHeader><DialogTitle>Edit Hook</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="text-xs text-slate-600">Label (internal name)</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Cash Offer — Variant B" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-form-label" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Ad Group (blank = home page)</Label>
                <Input list="adgroup-options" value={form.match_adgroup} onChange={(e) => setForm({ ...form, match_adgroup: e.target.value })} placeholder="ad group id (blank = home)" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-form-adgroup" />
                <datalist id="adgroup-options">
                  {entities.adgroups.map((a) => <option key={`${a.campaign_id}-${a.adgroup_id}`} value={a.adgroup_id} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs text-slate-600">% of serving</Label>
                <Input type="number" min={1} max={100} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-form-weight" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Hook 1 (headline)</Label>
              <Textarea value={form.hook1} onChange={(e) => setForm({ ...form, hook1: e.target.value })} rows={2} className="mt-1 rounded-lg border-slate-200" data-testid="hook-form-hook1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Hook 2 (subtext)</Label>
              <Textarea value={form.hook2} onChange={(e) => setForm({ ...form, hook2: e.target.value })} rows={2} className="mt-1 rounded-lg border-slate-200" data-testid="hook-form-hook2" />
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
              <span className="text-slate-900 font-semibold">{renderPreview(form.hook1, SAMPLE.city, SAMPLE.state) || 'Preview\u2026'}</span><br />
              <span className="text-slate-600">{renderPreview(form.hook2, SAMPLE.city, SAMPLE.state)}</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} data-testid="hook-form-enabled" />
              <span className="text-sm text-slate-700">{form.enabled ? 'Active (live)' : 'Paused'}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} className="rounded-lg">Cancel</Button>
            <Button onClick={saveEdit} disabled={busy} className="rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="hook-form-save">
              {busy ? 'Saving\u2026' : 'Save Hook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move-target dialog (forks a new hook, pauses the original) */}
      <Dialog open={!!moveDialog} onOpenChange={(o) => !o && setMoveDialog(null)}>
        <DialogContent className="max-w-lg" data-testid="hook-move-dialog">
          <DialogHeader><DialogTitle>Move Hook Target</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 -mt-2">
            This creates a <strong>brand-new hook</strong> on the target you pick (same copy &amp; weight) and
            <strong> pauses the original</strong> so its current stats are preserved.
          </p>
          <div className="grid gap-4">
            <div>
              <Label className="text-xs text-slate-600">Move this hook to</Label>
              <Select value={moveForm.kind} onValueChange={(v) => setMoveForm({ ...moveForm, kind: v })}>
                <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-move-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HOME}>Home page (all traffic)</SelectItem>
                  <SelectItem value="adgroup">A specific Ad Group</SelectItem>
                  <SelectItem value="ad">A specific Ad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {moveForm.kind === 'adgroup' && (
              <div>
                <Label className="text-xs text-slate-600">Ad Group</Label>
                <Select value={moveForm.adgroup} onValueChange={(v) => setMoveForm({ ...moveForm, adgroup: v })}>
                  <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-move-adgroup">
                    <SelectValue placeholder="Pick an ad group" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.adgroups.map((a) => (
                      <SelectItem key={`${a.campaign_id}-${a.adgroup_id}`} value={a.adgroup_id}>
                        {a.adgroup_name || a.adgroup_id}{a.campaign_name ? ` · ${a.campaign_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {moveForm.kind === 'ad' && (
              <div>
                <Label className="text-xs text-slate-600">Ad</Label>
                <Select value={moveForm.ad} onValueChange={(v) => setMoveForm({ ...moveForm, ad: v })}>
                  <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-move-ad">
                    <SelectValue placeholder="Pick an ad" />
                  </SelectTrigger>
                  <SelectContent>
                    {(entities.ads || []).map((a) => (
                      <SelectItem key={`${a.adgroup_id}-${a.ad_id}`} value={a.ad_id}>
                        {a.ad_name || `Ad ${a.ad_id}`}{a.adgroup_name ? ` · ${a.adgroup_name}` : ''}
                      </SelectItem>
                    ))}
                    {(!entities.ads || entities.ads.length === 0) && (
                      <div className="px-3 py-2 text-xs text-slate-400">No ads captured from traffic yet.</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog(null)} className="rounded-lg">Cancel</Button>
            <Button onClick={confirmMove} disabled={moving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white" data-testid="hook-move-confirm">
              {moving ? 'Moving…' : 'Create new hook & pause original'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
