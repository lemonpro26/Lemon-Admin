import React, { useEffect, useState } from 'react';
import { Megaphone, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';

let _campaignCache = null; // { id, name }[]

// Editable Campaign field for the lead/call detail dialogs. Pick from the Google
// campaign list OR type a custom one (native datalist), then save.
export const CampaignEditor = ({ kind, item, onChanged }) => {
  const editable = canEditFn();
  const [campaigns, setCampaigns] = useState(_campaignCache || []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const current = item.campaign_name || item.google_campaign || item.campaign || item.campaign_id || '';

  useEffect(() => {
    if (_campaignCache) { setCampaigns(_campaignCache); return; }
    api.get('/admin/campaigns').then((res) => {
      _campaignCache = res.data.campaigns || [];
      setCampaigns(_campaignCache);
    }).catch(() => {});
  }, []);

  const save = async () => {
    const name = draft.trim();
    if (!name) { toast.error('Enter or pick a campaign.'); return; }
    const match = campaigns.find((c) => (c.name || '').toLowerCase() === name.toLowerCase());
    setBusy(true);
    try {
      const res = await api.post(`/admin/${kind}/${item.id}/campaign`, {
        campaign_id: match ? match.id : '',
        campaign_name: name,
      });
      item.campaign_id = res.data.campaign_id;
      item.campaign_name = res.data.campaign_name;
      toast.success('Campaign updated.');
      setEditing(false);
      onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not update campaign.');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex justify-between gap-4 text-sm py-1 border-b border-slate-100 items-center" data-testid="campaign-editor">
      <span className="text-slate-500 flex items-center gap-1.5"><Megaphone className="h-3.5 w-3.5" /> Campaign</span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            list="campaign-options"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Pick or type a campaign"
            className="w-52 rounded-lg border border-slate-200 px-2 py-1 text-sm"
            data-testid="campaign-editor-input"
            autoFocus
          />
          <datalist id="campaign-options">
            {campaigns.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
          <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 p-1" data-testid="campaign-editor-save"><Check className="h-4 w-4" /></button>
          <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600 p-1" data-testid="campaign-editor-cancel"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <span className="flex items-center gap-2">
          <span className="font-medium text-slate-900 text-right break-all" data-testid="campaign-editor-value">{current || 'Unattributed / Direct'}</span>
          {editable && (
            <button onClick={() => { setDraft(item.campaign_name || ''); setEditing(true); }} className="text-slate-400 hover:text-slate-700 p-1" data-testid="campaign-editor-edit"><Pencil className="h-3.5 w-3.5" /></button>
          )}
        </span>
      )}
    </div>
  );
};
