import React, { useEffect, useState } from 'react';
import { FileText, DollarSign, Trash2, Award, FlaskConical, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CampaignEditor } from '@/components/admin/CampaignEditor';

const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s || '\u2014'; } };
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const SRC = {
  lapa: 'PA page (lapa)', laspa: 'Spanish PA (laspa)', sp: 'Spanish Landing (sp)',
  ladg: 'Demand Gen (ladg)', ladgs: 'Spanish Demand Gen (ladgs)',
  latm: 'Team Attorneys — Overlay (latm)', latm2: 'Team Attorneys — Split (latm2)',
  dg: 'Demand Gen (dg)', dgs: 'Spanish Demand Gen (dgs)',
  tm: 'Team Attorneys — Overlay (tm)', tm2: 'Team Attorneys — Split (tm2)',
};

// Self-contained lead detail dialog reused wherever a lead needs opening
// (Leads tab and the Calls-tab unified search).
export const LeadDetailDialog = ({ lead, open, onOpenChange, onChanged }) => {
  const editable = canEditFn();
  const [l, setL] = useState(lead);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({});

  useEffect(() => {
    setL(lead);
    setAmount(lead?.sale_value != null ? String(lead.sale_value) : '');
    setEditing(false);
  }, [lead]);

  if (!l) return null;
  const name = l.qb_name || l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.name || '\u2014';
  const vehicle = [l.car_year, l.car_make, l.car_model].filter(Boolean).join(' ') || '\u2014';
  const setD = (patch) => setDraft((p) => ({ ...p, ...patch }));

  const startEdit = () => {
    setDraft({
      full_name: l.full_name || l.qb_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.name || '',
      phone: formatPhone(l.phone) || l.phone || '',
      email: l.email || '',
      car_year: l.car_year || '', car_make: l.car_make || '', car_model: l.car_model || '',
      source_page: l.source_page || '',
      adgroup_name: l.adgroup_name || '', ad_name: l.ad_name || '',
      keyword: l.keyword || '', ad_size: l.ad_size || '',
      gclid: l.gclid || '', ip: l.ip || '',
      city: l.city || '', state: l.state || '',
      when: toLocalInput(l.created_at),
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload = {
        full_name: draft.full_name, qb_name: draft.full_name,
        phone: draft.phone, email: draft.email,
        car_year: draft.car_year, car_make: draft.car_make, car_model: draft.car_model,
        source_page: draft.source_page, adgroup_name: draft.adgroup_name, ad_name: draft.ad_name,
        keyword: draft.keyword, ad_size: draft.ad_size, gclid: draft.gclid, ip: draft.ip,
        city: draft.city, state: draft.state,
      };
      if (draft.when) payload.created_at = new Date(draft.when).toISOString();
      const res = await api.patch(`/admin/leads/${l.id}`, payload);
      setL(res.data.lead);
      setEditing(false);
      toast.success('Lead updated.');
      onChanged && onChanged();
    } catch { toast.error('Could not save changes.'); } finally { setSaving(false); }
  };

  const markSold = async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value < 0) { toast.error('Enter a valid revenue amount.'); return; }
    setBusy(true);
    try {
      const res = await api.post(`/admin/leads/${l.id}/sold`, { value, currency: 'USD' });
      toast.success('Marked sold.');
      setL({ ...l, ...res.data });
      onChanged && onChanged();
    } catch { toast.error('Could not mark sold.'); } finally { setBusy(false); }
  };

  const markRetained = async (retained) => {
    try {
      await api.post(`/admin/leads/${l.id}/retained`, { retained });
      setL({ ...l, retained });
      toast.success(retained ? 'Marked as retained client' : 'Removed from retained');
      onChanged && onChanged();
    } catch { toast.error('Could not update retained status.'); }
  };

  const del = async () => {
    if (!window.confirm(`Delete lead ${name}?`)) return;
    try {
      await api.delete(`/admin/leads/${l.id}`);
      toast.success('Lead deleted.');
      onOpenChange(false);
      onChanged && onChanged();
    } catch { toast.error('Could not delete lead.'); }
  };

  const rows = [
    ['Name', name, 'ld-name'],
    ['Phone', formatPhone(l.phone), 'ld-phone'],
    ['Email', l.email, 'ld-email'],
    ['Vehicle', vehicle, 'ld-vehicle'],
    ['Source', SRC[l.source_page] || l.source_page || 'home', 'ld-source'],
    ['Ad Group', l.adgroup_name || l.adgroup_id, 'ld-adgroup'],
    ['Ad', l.ad_name || l.ad_id, 'ld-ad'],
    l.ad_size ? ['Size', l.ad_size, 'ld-size'] : ['Keyword', l.keyword, 'ld-keyword'],
    ['GCLID', l.gclid, 'ld-gclid'],
    ['IP Address', l.ip, 'ld-ip'],
    ['When', fmtDate(l.created_at), 'ld-when'],
  ];

  const EditField = ({ label, k, type = 'text', testid }) => (
    <div className="flex items-center justify-between gap-4 text-sm py-1">
      <span className="text-slate-500 shrink-0">{label}</span>
      <Input type={type === 'datetime' ? 'datetime-local' : type} value={draft[k]} onChange={(e) => setD({ [k]: e.target.value })} className="flex-1 max-w-[240px] h-9 rounded-lg border-slate-200" data-testid={testid} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="shared-lead-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" /> Lead detail
            {l.retained && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Retained</Badge>}
            {editable && !editing && (
              <Button variant="outline" size="sm" onClick={startEdit} className="ml-auto rounded-lg border-slate-200 h-8" data-testid="ld-edit">
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {editing ? (
            <div className="grid gap-1 rounded-xl border border-slate-200 p-3 bg-slate-50/50" data-testid="ld-edit-form">
              <EditField label="Name" k="full_name" testid="ld-edit-name" />
              <EditField label="Phone" k="phone" testid="ld-edit-phone" />
              <EditField label="Email" k="email" testid="ld-edit-email" />
              <EditField label="Year" k="car_year" testid="ld-edit-year" />
              <EditField label="Make" k="car_make" testid="ld-edit-make" />
              <EditField label="Model" k="car_model" testid="ld-edit-model" />
              <EditField label="Source" k="source_page" testid="ld-edit-source" />
              <EditField label="Ad Group" k="adgroup_name" testid="ld-edit-adgroup" />
              <EditField label="Ad" k="ad_name" testid="ld-edit-ad" />
              <EditField label="Keyword" k="keyword" testid="ld-edit-keyword" />
              <EditField label="Size" k="ad_size" testid="ld-edit-size" />
              <EditField label="GCLID" k="gclid" testid="ld-edit-gclid" />
              <EditField label="IP Address" k="ip" testid="ld-edit-ip" />
              <EditField label="City" k="city" testid="ld-edit-city" />
              <EditField label="State" k="state" testid="ld-edit-state" />
              <EditField label="When" k="when" type="datetime" testid="ld-edit-when" />
              <div className="flex gap-2 pt-2">
                <Button onClick={saveEdit} disabled={saving} className="flex-1 rounded-lg bg-[#0F1B3D]" data-testid="ld-edit-save">{saving ? 'Saving…' : 'Save changes'}</Button>
                <Button variant="outline" onClick={() => setEditing(false)} disabled={saving} className="rounded-lg" data-testid="ld-edit-cancel"><X className="h-4 w-4" /></Button>
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

          {!editing && <CampaignEditor kind="leads" item={l} onChanged={() => { setL({ ...l }); onChanged && onChanged(); }} />}

          {!editing && l.saw_landing_page && (
            <div className="mt-2 rounded-xl border border-slate-200 p-4 bg-white" data-testid="ld-hook-section">
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical className="h-4 w-4 text-indigo-600" />
                <span className="font-semibold text-slate-900 text-sm">Landing page &amp; hook</span>
              </div>
              <div className="text-sm">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700" data-testid="ld-hook-label">
                  {l.hook_label || 'Default hook'}
                </span>
                {l.hook1 && <p className="text-slate-900 font-semibold mt-2" data-testid="ld-hook1">{l.hook1}</p>}
                {l.hook2 && <p className="text-slate-600 mt-1" data-testid="ld-hook2">{l.hook2}</p>}
                <div className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Landing page</span>
                    <span className="font-medium text-slate-900 text-right break-all" data-testid="ld-landing-path">{l.landing_path || '\u2014'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Last click</span>
                    <span className="font-medium text-slate-900 text-right" data-testid="ld-last-click">{l.last_click_at ? fmtDate(l.last_click_at) : '\u2014'}</span>
                  </div>
                  {l.click_visits > 1 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Visits before submitting</span>
                      <span className="font-medium text-slate-900 text-right" data-testid="ld-visits">{l.click_visits}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {editable && !editing && (
            <div className="mt-2 grid gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Sale value" className="pl-9 rounded-lg border-slate-200" data-testid="ld-sale-input" />
                </div>
                <Button onClick={markSold} disabled={busy} className="rounded-lg bg-[#0F1B3D]" data-testid="ld-mark-sold">
                  {l.sale_status === 'sold' ? 'Update revenue' : 'Mark Sold'}
                </Button>
              </div>
              <Button onClick={() => markRetained(!l.retained)} variant="outline" className={`w-full rounded-lg ${l.retained ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`} data-testid="ld-retained-toggle">
                <Award className="h-4 w-4 mr-2" /> {l.retained ? 'Retained client \u2713 (click to remove)' : 'Mark as Retained Client'}
              </Button>
              <Button onClick={del} variant="outline" className="w-full rounded-lg border-red-200 text-red-600 hover:bg-red-50" data-testid="ld-delete">
                <Trash2 className="h-4 w-4 mr-2" /> Delete Lead
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
