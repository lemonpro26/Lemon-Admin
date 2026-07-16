import React, { useEffect, useState } from 'react';
import { Phone, DollarSign, Trash2, Award, FlaskConical, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CampaignEditor } from '@/components/admin/CampaignEditor';

const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s || '\u2014'; } };
const fmtDur = (d) => (d ? `${Math.floor(d / 60)}m ${d % 60}s` : '\u2014');

// Convert an ISO string to a value the datetime-local input understands (local wall-clock).
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const CALL_GROUPS = [
  { key: 'home_pa', label: 'Home & PA' },
  { key: 'spanish', label: 'Spanish & SPA' },
  { key: 'dg', label: 'Demand Gen' },
  { key: 'dgs', label: 'Demand Gen Spanish' },
  { key: 'other', label: 'Other / Unknown' },
];

// Self-contained call detail dialog reused wherever a call needs opening
// (Calls tab and the Leads-tab unified search).
export const CallDetailDialog = ({ call, open, onOpenChange, onChanged }) => {
  const editable = canEditFn();
  const [c, setC] = useState(call);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({});

  useEffect(() => {
    setC(call);
    setAmount(call?.sale_value != null ? String(call.sale_value) : '');
    setEditing(false);
  }, [call]);

  if (!c) return null;

  const setD = (patch) => setDraft((p) => ({ ...p, ...patch }));

  const startEdit = () => {
    setDraft({
      caller_name: c.caller_name || c.qb_name || '',
      caller_number: formatPhone(c.caller_number) || c.caller_number || '',
      tracked_number_display: c.tracked_number_display || c.tracking_number || '',
      number_group: c.number_group || 'other',
      duration: c.duration || 0,
      city: c.city || '', state: c.state || '',
      keyword: c.keyword || '', gclid: c.gclid || '',
      adgroup_name: c.adgroup_name || '', ad_name: c.ad_name || '',
      when: toLocalInput(c.called_at || c.created_at),
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload = {
        caller_name: draft.caller_name,
        qb_name: draft.caller_name,
        caller_number: draft.caller_number,
        tracked_number_display: draft.tracked_number_display,
        number_group: draft.number_group,
        duration: parseInt(draft.duration || 0, 10),
        city: draft.city, state: draft.state,
        keyword: draft.keyword, gclid: draft.gclid,
        adgroup_name: draft.adgroup_name, ad_name: draft.ad_name,
      };
      if (draft.when) payload.called_at = new Date(draft.when).toISOString();
      const res = await api.patch(`/admin/calls/${c.id}`, payload);
      setC(res.data.call);
      setEditing(false);
      toast.success('Call updated.');
      onChanged && onChanged();
    } catch { toast.error('Could not save changes.'); } finally { setSaving(false); }
  };

  const markSold = async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value < 0) { toast.error('Enter a valid revenue amount.'); return; }
    setBusy(true);
    try {
      const res = await api.post(`/admin/calls/${c.id}/sold`, { value, currency: 'USD' });
      toast.success('Marked sold.');
      setC({ ...c, ...res.data });
      onChanged && onChanged();
    } catch { toast.error('Could not mark sold.'); } finally { setBusy(false); }
  };

  const markRetained = async (retained) => {
    try {
      await api.post(`/admin/calls/${c.id}/retained`, { retained });
      setC({ ...c, retained });
      toast.success(retained ? 'Marked as retained client' : 'Removed from retained');
      onChanged && onChanged();
    } catch { toast.error('Could not update retained status.'); }
  };

  const del = async () => {
    if (!window.confirm(`Delete call from ${c.caller_number || 'unknown'}?`)) return;
    try {
      await api.delete(`/admin/calls/${c.id}`);
      toast.success('Call deleted.');
      onOpenChange(false);
      onChanged && onChanged();
    } catch { toast.error('Could not delete call.'); }
  };

  const rows = [
    ['Caller', c.qb_name || c.caller_name, 'cd-name'],
    ['Number', formatPhone(c.caller_number), 'cd-number'],
    ['Called #', c.tracked_number_display || c.tracking_number, 'cd-tracking'],
    ['Landing group', c.number_group_label, 'cd-group'],
    ['Duration', fmtDur(c.duration), 'cd-duration'],
    ['Ad Group', c.adgroup_name || c.adgroup_id, 'cd-adgroup'],
    ['Ad', c.ad_name || c.ad_id, 'cd-ad'],
    ['Keyword', c.keyword, 'cd-keyword'],
    ['GCLID', c.gclid, 'cd-gclid'],
    ['Location', [c.city, c.state].filter(Boolean).join(', '), 'cd-location'],
    ['When', fmtDate(c.called_at || c.created_at), 'cd-when'],
  ];

  const EditField = ({ label, k, type = 'text', testid }) => (
    <div className="flex items-center justify-between gap-4 text-sm py-1">
      <span className="text-slate-500 shrink-0">{label}</span>
      {type === 'group' ? (
        <select value={draft.number_group} onChange={(e) => setD({ number_group: e.target.value })} className="flex-1 max-w-[240px] h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" data-testid={testid}>
          {CALL_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
      ) : (
        <Input type={type === 'datetime' ? 'datetime-local' : type} value={draft[k]} onChange={(e) => setD({ [k]: e.target.value })} className="flex-1 max-w-[240px] h-9 rounded-lg border-slate-200" data-testid={testid} />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="shared-call-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-emerald-600" /> Call detail
            {c.retained && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Retained</Badge>}
            {editable && !editing && (
              <Button variant="outline" size="sm" onClick={startEdit} className="ml-auto rounded-lg border-slate-200 h-8" data-testid="cd-edit">
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {editing ? (
            <div className="grid gap-1 rounded-xl border border-slate-200 p-3 bg-slate-50/50" data-testid="cd-edit-form">
              <EditField label="Caller" k="caller_name" testid="cd-edit-name" />
              <EditField label="Number" k="caller_number" testid="cd-edit-number" />
              <EditField label="Called #" k="tracked_number_display" testid="cd-edit-tracking" />
              <EditField label="Landing group" k="number_group" type="group" testid="cd-edit-group" />
              <EditField label="Duration (sec)" k="duration" type="number" testid="cd-edit-duration" />
              <EditField label="Ad Group" k="adgroup_name" testid="cd-edit-adgroup" />
              <EditField label="Ad" k="ad_name" testid="cd-edit-ad" />
              <EditField label="Keyword" k="keyword" testid="cd-edit-keyword" />
              <EditField label="GCLID" k="gclid" testid="cd-edit-gclid" />
              <EditField label="City" k="city" testid="cd-edit-city" />
              <EditField label="State" k="state" testid="cd-edit-state" />
              <EditField label="When" k="when" type="datetime" testid="cd-edit-when" />
              <div className="flex gap-2 pt-2">
                <Button onClick={saveEdit} disabled={saving} className="flex-1 rounded-lg bg-[#0F1B3D]" data-testid="cd-edit-save">{saving ? 'Saving…' : 'Save changes'}</Button>
                <Button variant="outline" onClick={() => setEditing(false)} disabled={saving} className="rounded-lg" data-testid="cd-edit-cancel"><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : (
            rows.map(([label, val, tid]) => (
              <div key={label} className="flex justify-between gap-4 text-sm py-1 border-b border-slate-100">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-900 text-right break-all" data-testid={tid}>{val || '\u2014'}</span>
              </div>
            ))
          )}

          {!editing && <CampaignEditor kind="calls" item={c} onChanged={() => { setC({ ...c }); onChanged && onChanged(); }} />}

          {/* Landing page & hook attribution */}
          {!editing && (
          <div className="mt-2 rounded-xl border border-slate-200 p-4 bg-white" data-testid="cd-hook-section">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-slate-900 text-sm">Landing page &amp; hook</span>
            </div>
            {c.saw_landing_page ? (
              <div className="text-sm">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700" data-testid="cd-hook-label">
                  {c.hook_label || 'Default hook'}
                </span>
                {c.hook1 && <p className="text-slate-900 font-semibold mt-2" data-testid="cd-hook1">{c.hook1}</p>}
                {c.hook2 && <p className="text-slate-600 mt-1" data-testid="cd-hook2">{c.hook2}</p>}
                <div className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Landing page</span>
                    <span className="font-medium text-slate-900 text-right break-all" data-testid="cd-landing-path">{c.landing_path || '\u2014'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Last click</span>
                    <span className="font-medium text-slate-900 text-right" data-testid="cd-last-click">{c.last_click_at ? fmtDate(c.last_click_at) : '\u2014'}</span>
                  </div>
                  {c.click_visits > 1 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Visits before calling</span>
                      <span className="font-medium text-slate-900 text-right" data-testid="cd-visits">{c.click_visits}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : c.tapped_from_page ? (
              <p className="text-sm text-slate-700" data-testid="cd-tapped">
                Caller <strong>tapped the call button</strong> on the <strong>{c.source_page || 'landing'}</strong> page.
              </p>
            ) : (
              <p className="text-sm text-slate-500" data-testid="cd-nopage">
                This caller clicked to call from the ad <strong>without visiting the landing page</strong>.
              </p>
            )}
          </div>
          )}

          {editable && !editing && (
            <div className="mt-2 grid gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Sale value" className="pl-9 rounded-lg border-slate-200" data-testid="cd-sale-input" />
                </div>
                <Button onClick={markSold} disabled={busy} className="rounded-lg bg-[#0F1B3D]" data-testid="cd-mark-sold">
                  {c.sale_status === 'sold' ? 'Update revenue' : 'Mark Sold'}
                </Button>
              </div>
              <Button onClick={() => markRetained(!c.retained)} variant="outline" className={`w-full rounded-lg ${c.retained ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`} data-testid="cd-retained-toggle">
                <Award className="h-4 w-4 mr-2" /> {c.retained ? 'Retained client \u2713 (click to remove)' : 'Mark as Retained Client'}
              </Button>
              <Button onClick={del} variant="outline" className="w-full rounded-lg border-red-200 text-red-600 hover:bg-red-50" data-testid="cd-delete">
                <Trash2 className="h-4 w-4 mr-2" /> Delete Call
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
