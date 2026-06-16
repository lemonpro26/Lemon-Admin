import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Target, Power } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const EMPTY_RULE = {
  label: '', match_campaign: '', match_adgroup: '', match_ad: '',
  hook1: '', hook2: '', enabled: true,
};

function matchSummary(r) {
  const parts = [];
  if (r.match_campaign) parts.push(`Campaign ${r.match_campaign}`);
  if (r.match_adgroup) parts.push(`Ad Group ${r.match_adgroup}`);
  if (r.match_ad) parts.push(`Ad ${r.match_ad}`);
  return parts.length ? parts.join(' · ') : 'Any (catch-all)';
}

export const AdminTargeting = () => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // rule id or null (new)
  const [form, setForm] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/hook-rules');
      setRules(res.data.rules);
    } catch (e) {
      toast.error('Failed to load targeting rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY_RULE); setOpen(true); };
  const openEdit = (r) => { setEditing(r.id); setForm({ ...EMPTY_RULE, ...r }); setOpen(true); };
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.label.trim()) { toast.error('Please give the rule a label.'); return; }
    if (!form.hook1.trim() || !form.hook2.trim()) { toast.error('Both hooks are required.'); return; }
    if (!form.match_campaign && !form.match_adgroup && !form.match_ad) {
      toast.error('Set at least one match field (campaign, ad group, or ad).'); return;
    }
    setSaving(true);
    try {
      const body = {
        label: form.label, match_campaign: form.match_campaign, match_adgroup: form.match_adgroup,
        match_ad: form.match_ad, hook1: form.hook1, hook2: form.hook2, enabled: form.enabled,
      };
      if (editing) await api.put(`/admin/hook-rules/${editing}`, body);
      else await api.post('/admin/hook-rules', body);
      toast.success(editing ? 'Rule updated.' : 'Rule created.');
      setOpen(false);
      load();
    } catch (e) {
      toast.error('Could not save the rule.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete rule "${r.label}"?`)) return;
    try {
      await api.delete(`/admin/hook-rules/${r.id}`);
      toast.success('Rule deleted.');
      load();
    } catch (e) {
      toast.error('Could not delete the rule.');
    }
  };

  const toggle = async (r) => {
    try {
      await api.put(`/admin/hook-rules/${r.id}`, { ...r, enabled: !r.enabled });
      load();
    } catch (e) {
      toast.error('Could not update the rule.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" data-testid="admin-targeting">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            <Target className="h-5 w-5 text-[#EF4444]" /> Hook Targeting Rules
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Override Hook 1 &amp; Hook 2 for specific campaigns, ad groups, or ads. The most specific
            matching rule wins; if none match, your default hooks are used. Tokens{' '}
            <code className="px-1 bg-slate-100 rounded text-[#EF4444]">{'{!city}'}</code> /{' '}
            <code className="px-1 bg-slate-100 rounded text-[#EF4444]">{'{!state}'}</code> still work.
          </p>
        </div>
        <Button onClick={openNew} className="shrink-0 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="targeting-new-rule-button">
          <Plus className="h-4 w-4 mr-2" /> New Rule
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        {loading ? (
          <p className="text-slate-500 py-8 text-center">Loading rules\u2026</p>
        ) : rules.length === 0 ? (
          <div className="py-10 text-center text-slate-500" data-testid="targeting-empty">
            No targeting rules yet. Create one to customize hooks by ad group or ad.
          </div>
        ) : (
          <Table data-testid="targeting-table">
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead className="hidden md:table-cell">Hook 1</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id} data-testid={`targeting-row-${r.id}`}>
                  <TableCell className="font-medium text-slate-900">{r.label}</TableCell>
                  <TableCell className="text-slate-600 text-sm">{matchSummary(r)}</TableCell>
                  <TableCell className="hidden md:table-cell text-slate-600 text-sm max-w-xs truncate">{r.hook1}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggle(r)}
                      className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 ${r.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
                      data-testid={`targeting-toggle-${r.id}`}
                    >
                      <Power className="h-3 w-3" /> {r.enabled ? 'Active' : 'Off'}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" className="rounded-lg border-slate-200" onClick={() => openEdit(r)} data-testid={`targeting-edit-${r.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-lg border-slate-200 text-red-600 hover:text-red-700" onClick={() => remove(r)} data-testid={`targeting-delete-${r.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="targeting-dialog">
          <DialogHeader>
            <DialogTitle className="font-slab">{editing ? 'Edit Rule' : 'New Targeting Rule'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="text-slate-700">Rule Label</Label>
              <Input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Emergency Repair Ad Group"
                className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="targeting-form-label" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-slate-700 text-xs">Campaign ID</Label>
                <Input value={form.match_campaign} onChange={(e) => set('match_campaign', e.target.value)} placeholder="tg_ref"
                  className="mt-1.5 h-10 rounded-lg border-slate-200" data-testid="targeting-form-campaign" />
              </div>
              <div>
                <Label className="text-slate-700 text-xs">Ad Group ID</Label>
                <Input value={form.match_adgroup} onChange={(e) => set('match_adgroup', e.target.value)} placeholder="adgroup_id"
                  className="mt-1.5 h-10 rounded-lg border-slate-200" data-testid="targeting-form-adgroup" />
              </div>
              <div>
                <Label className="text-slate-700 text-xs">Ad ID</Label>
                <Input value={form.match_ad} onChange={(e) => set('match_ad', e.target.value)} placeholder="sub2"
                  className="mt-1.5 h-10 rounded-lg border-slate-200" data-testid="targeting-form-ad" />
              </div>
            </div>
            <p className="text-xs text-slate-400 -mt-1">Leave a field blank to match any value. Set at least one.</p>
            <div>
              <Label className="text-slate-700">Hook 1 (Headline)</Label>
              <Textarea value={form.hook1} onChange={(e) => set('hook1', e.target.value)} rows={2}
                placeholder="Did Your {!city} Car Turn Out to Be a Lemon?"
                className="mt-1.5 rounded-xl border-slate-200" data-testid="targeting-form-hook1" />
            </div>
            <div>
              <Label className="text-slate-700">Hook 2 (Subheadline)</Label>
              <Textarea value={form.hook2} onChange={(e) => set('hook2', e.target.value)} rows={3}
                placeholder="24/7 same-day service across {!state}."
                className="mt-1.5 rounded-xl border-slate-200" data-testid="targeting-form-hook2" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} data-testid="targeting-form-enabled" />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl border-slate-200">Cancel</Button>
            <Button onClick={save} disabled={saving} className="rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="targeting-form-save">
              {saving ? 'Saving\u2026' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
