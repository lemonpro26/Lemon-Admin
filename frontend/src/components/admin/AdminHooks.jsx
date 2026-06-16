import React, { useEffect, useState, useCallback } from 'react';
import {
  Megaphone, Plus, Pencil, Trash2, Save, Sparkles, MousePointerClick, Target,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useSortable, SortLabel } from '@/lib/useSortable';
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

const EMPTY = { label: '', match_campaign: '', match_adgroup: '', match_ad: '', hook1: '', hook2: '', enabled: true };

export const AdminHooks = ({ canEdit }) => {
  const [config, setConfig] = useState(null);
  const [hook1, setHook1] = useState('');
  const [hook2, setHook2] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);

  const [rules, setRules] = useState([]);
  const [defaultHook, setDefaultHook] = useState(null);
  const [entities, setEntities] = useState({ campaigns: [], adgroups: [] });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(todayRange());

  const [dialog, setDialog] = useState(null); // {mode:'create'|'edit', rule}
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const { sorted, sortKey, sortDir, toggle } = useSortable(rules, 'leads', 'desc');

  const loadConfig = useCallback(async () => {
    try {
      const res = await api.get('/admin/config');
      setConfig(res.data);
      setHook1(res.data.hook1 || '');
      setHook2(res.data.hook2 || '');
    } catch (e) { /* handled globally */ }
  }, []);

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

  useEffect(() => { loadConfig(); loadEntities(); }, [loadConfig, loadEntities]);
  useEffect(() => { loadRules(); }, [loadRules]);

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await api.put('/admin/config', { hook1, hook2 });
      toast.success('Home page hook saved.');
      await loadConfig();
      await loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save.');
    } finally {
      setSavingCfg(false);
    }
  };

  const openCreate = () => { setForm(EMPTY); setDialog({ mode: 'create' }); };
  const openEdit = (r) => {
    setForm({
      label: r.label || '', match_campaign: r.match_campaign || '', match_adgroup: r.match_adgroup || '',
      match_ad: r.match_ad || '', hook1: r.hook1 || '', hook2: r.hook2 || '', enabled: r.enabled !== false,
    });
    setDialog({ mode: 'edit', rule: r });
  };

  const saveRule = async () => {
    if (!form.label.trim() || !form.hook1.trim() || !form.hook2.trim()) {
      toast.error('Label, Hook 1 and Hook 2 are required.');
      return;
    }
    setBusy(true);
    try {
      if (dialog.mode === 'create') {
        await api.post('/admin/hook-rules', form);
        toast.success('Hook created.');
      } else {
        await api.put(`/admin/hook-rules/${dialog.rule.id}`, form);
        toast.success('Hook updated.');
      }
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
        match_ad: r.match_ad || '', hook1: r.hook1, hook2: r.hook2, enabled: !r.enabled,
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

  const SAMPLE = { city: 'Los Angeles', state: 'California' };

  return (
    <div className="grid gap-6" data-testid="admin-hooks">
      {/* Per-tab date range (affects hook traffic stats) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Megaphone className="h-4 w-4" /> Dynamic hooks &amp; per-hook traffic.
        </p>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Home page (default) hook */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#EF4444]" /> Home Page Hook (default)
          </h2>
          {defaultHook && (
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1"><MousePointerClick className="h-4 w-4" /> {defaultHook.clicks} clicks</span>
              <span className="flex items-center gap-1"><Target className="h-4 w-4" /> {defaultHook.leads} leads</span>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Shown when no targeted hook matches. Use <code className="px-1 bg-slate-100 rounded">{'{!city}'}</code> and{' '}
          <code className="px-1 bg-slate-100 rounded">{'{!state}'}</code> — when a visitor's location is unknown, those macros are removed automatically.
        </p>
        <div className="grid gap-4">
          <div>
            <Label className="text-xs text-slate-600">Hook 1 (headline)</Label>
            <Textarea value={hook1} onChange={(e) => setHook1(e.target.value)} disabled={!canEdit} rows={2} className="mt-1 rounded-xl border-slate-200" data-testid="hooks-default-hook1" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Hook 2 (subtext)</Label>
            <Textarea value={hook2} onChange={(e) => setHook2(e.target.value)} disabled={!canEdit} rows={2} className="mt-1 rounded-xl border-slate-200" data-testid="hooks-default-hook2" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3" data-testid="hooks-preview-located">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Preview — location known</p>
              <p className="text-sm font-semibold text-slate-900">{renderPreview(hook1, SAMPLE.city, SAMPLE.state) || '\u2014'}</p>
              <p className="text-sm text-slate-600">{renderPreview(hook2, SAMPLE.city, SAMPLE.state)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3" data-testid="hooks-preview-unknown">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Preview — location unknown</p>
              <p className="text-sm font-semibold text-slate-900">{renderPreview(hook1, '', '') || '\u2014'}</p>
              <p className="text-sm text-slate-600">{renderPreview(hook2, '', '')}</p>
            </div>
          </div>
          {canEdit && (
            <div>
              <Button onClick={saveConfig} disabled={savingCfg} className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="hooks-save-default">
                <Save className="h-4 w-4 mr-2" /> {savingCfg ? 'Saving\u2026' : 'Save Home Page Hook'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Targeted hooks */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="font-slab font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-[#EF4444]" /> Targeted Hooks
            <span className="text-sm font-normal text-slate-400">— dynamically swap by campaign / ad group</span>
          </div>
          {canEdit && (
            <Button onClick={openCreate} size="sm" className="rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="hooks-create-button">
              <Plus className="h-4 w-4 mr-1" /> New Hook
            </Button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading hooks\u2026</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No targeted hooks yet. Create one to override the home page hook for a specific campaign or ad group.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortLabel label="Hook" k="label" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                  <TableHead className="hidden md:table-cell"><SortLabel label="Campaign" k="match_campaign" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                  <TableHead className="hidden md:table-cell"><SortLabel label="Ad Group" k="match_adgroup" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                  <TableHead className="text-right"><SortLabel label="Clicks" k="clicks" sortKey={sortKey} sortDir={sortDir} onClick={toggle} align="right" /></TableHead>
                  <TableHead className="text-right"><SortLabel label="Leads" k="leads" sortKey={sortKey} sortDir={sortDir} onClick={toggle} align="right" /></TableHead>
                  <TableHead className="text-right hidden sm:table-cell"><SortLabel label="Conv%" k="conversion_rate" sortKey={sortKey} sortDir={sortDir} onClick={toggle} align="right" /></TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.id} data-testid={`hook-row-${r.id}`}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{r.label}</div>
                      <div className="text-xs text-slate-400 max-w-[260px] truncate">{r.hook1}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-slate-600">{r.match_campaign || <span className="text-slate-300">any</span>}</TableCell>
                    <TableCell className="hidden md:table-cell text-slate-600">{r.match_adgroup || <span className="text-slate-300">any</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.clicks}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.leads}</TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell">{r.conversion_rate}%</TableCell>
                    <TableCell className="text-center">
                      {canEdit ? (
                        <div className="flex items-center justify-center gap-2">
                          <Switch checked={r.enabled !== false} onCheckedChange={() => togglePause(r)} data-testid={`hook-toggle-${r.id}`} />
                        </div>
                      ) : (
                        <Badge variant="outline" className={r.enabled !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500'}>
                          {r.enabled !== false ? 'Live' : 'Paused'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors" data-testid={`hook-edit-${r.id}`} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-red-600 transition-colors" data-testid={`hook-delete-${r.id}`} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg" data-testid="hook-dialog">
          <DialogHeader><DialogTitle>{dialog?.mode === 'create' ? 'New Targeted Hook' : 'Edit Hook'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="text-xs text-slate-600">Label (internal name)</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Emergency Repair — West" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-form-label" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Assign to Campaign</Label>
                <Input list="campaign-options" value={form.match_campaign} onChange={(e) => setForm({ ...form, match_campaign: e.target.value })} placeholder="campaign id (blank = any)" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-form-campaign" />
                <datalist id="campaign-options">
                  {entities.campaigns.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Assign to Ad Group</Label>
                <Input list="adgroup-options" value={form.match_adgroup} onChange={(e) => setForm({ ...form, match_adgroup: e.target.value })} placeholder="ad group id (blank = any)" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="hook-form-adgroup" />
                <datalist id="adgroup-options">
                  {entities.adgroups.map((a) => <option key={`${a.campaign_id}-${a.adgroup_id}`} value={a.adgroup_id} />)}
                </datalist>
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Hook 1 (headline)</Label>
              <Textarea value={form.hook1} onChange={(e) => setForm({ ...form, hook1: e.target.value })} rows={2} placeholder="Did Your {!city} Car Turn Out to Be a Lemon?" className="mt-1 rounded-lg border-slate-200" data-testid="hook-form-hook1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Hook 2 (subtext)</Label>
              <Textarea value={form.hook2} onChange={(e) => setForm({ ...form, hook2: e.target.value })} rows={2} placeholder="24/7 service across {!state}." className="mt-1 rounded-lg border-slate-200" data-testid="hook-form-hook2" />
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
            <Button onClick={saveRule} disabled={busy} className="rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="hook-form-save">
              {busy ? 'Saving\u2026' : 'Save Hook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
