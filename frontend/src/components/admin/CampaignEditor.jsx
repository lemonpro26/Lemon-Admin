import React, { useEffect, useState, useRef } from 'react';
import { Megaphone, Pencil, Check, X, Trash2 } from 'lucide-react';
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

  const clear = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/${kind}/${item.id}/campaign`, { clear: true });
      item.campaign_id = '';
      item.campaign_name = '';
      item.campaign = '';
      toast.success('Campaign removed.');
      setEditing(false);
      onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not remove campaign.');
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
          {editable && current && (
            <button onClick={clear} disabled={busy} className="text-slate-400 hover:text-red-600 p-1" title="Remove campaign" data-testid="campaign-editor-clear"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </span>
      )}
    </div>
  );
};


// Compact inline campaign editor for table cells — lets you edit the campaign
// straight from the Campaign column without opening the detail dialog. Updates
// in place (no list refetch) and stops click propagation so it never triggers a
// row's onClick (which opens a dialog).
export const CampaignCell = ({ kind, item, onChanged, children }) => {
  const editable = canEditFn();
  const [campaigns, setCampaigns] = useState(_campaignCache || []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  // Local copy so the cell updates instantly on save without reloading the table.
  const [current, setCurrent] = useState(
    item.campaign_name || item.google_campaign || item.campaign || item.campaign_id || '');

  useEffect(() => {
    setCurrent(item.campaign_name || item.google_campaign || item.campaign || item.campaign_id || '');
  }, [item.campaign_name, item.google_campaign, item.campaign, item.campaign_id]);

  useEffect(() => {
    if (_campaignCache) { setCampaigns(_campaignCache); return; }
    api.get('/admin/campaigns').then((res) => {
      _campaignCache = res.data.campaigns || [];
      setCampaigns(_campaignCache);
    }).catch(() => {});
  }, []);

  // Focus the input WITHOUT scrolling the page to it (prevents the jump/shift).
  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, [editing]);

  const stop = (e) => { e.stopPropagation(); };

  const startEdit = (e) => {
    stop(e);
    setDraft(item.campaign_name || (typeof current === 'string' ? current : '') || '');
    setEditing(true);
  };

  const save = async (e) => {
    stop(e);
    const name = draft.trim();
    if (!name) { toast.error('Enter or pick a campaign.'); return; }
    const match = campaigns.find((c) => (c.name || '').toLowerCase() === name.toLowerCase());
    setBusy(true);
    try {
      const res = await api.post(`/admin/${kind}/${item.id}/campaign`, {
        campaign_id: match ? match.id : '',
        campaign_name: name,
      });
      // Mutate the row object + update the cell locally — no full table reload.
      item.campaign_id = res.data.campaign_id;
      item.campaign_name = res.data.campaign_name;
      setCurrent(res.data.campaign_name || name);
      toast.success('Campaign updated.');
      setEditing(false);
      onChanged && onChanged({ campaign_id: res.data.campaign_id, campaign_name: res.data.campaign_name });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not update campaign.');
    } finally { setBusy(false); }
  };

  const clear = async (e) => {
    stop(e);
    setBusy(true);
    try {
      await api.post(`/admin/${kind}/${item.id}/campaign`, { clear: true });
      item.campaign_id = '';
      item.campaign_name = '';
      item.campaign = '';
      item.google_campaign = '';
      setCurrent('');
      toast.success('Campaign removed.');
      setEditing(false);
      onChanged && onChanged({ campaign_id: '', campaign_name: '', campaign: '', google_campaign: '' });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not remove campaign.');
    } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={stop} data-testid={`campaign-cell-edit-${item.id}`}>
        <input
          ref={inputRef}
          list="campaign-cell-options"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(e); if (e.key === 'Escape') { stop(e); setEditing(false); } }}
          placeholder="Pick or type"
          className="w-44 rounded-lg border border-slate-200 px-2 py-1 text-xs"
          data-testid={`campaign-cell-input-${item.id}`}
        />
        <datalist id="campaign-cell-options">
          {campaigns.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
        <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 p-0.5" data-testid={`campaign-cell-save-${item.id}`}><Check className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { stop(e); setEditing(false); }} className="text-slate-400 hover:text-slate-600 p-0.5" data-testid={`campaign-cell-cancel-${item.id}`}><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  return (
    <div className="group inline-flex items-start gap-1.5" data-testid={`campaign-cell-${item.id}`}>
      <div className="min-w-0">
        <span className="text-slate-600">{current || '\u2014'}</span>
        {children}
      </div>
      {editable && (
        <button
          onClick={startEdit}
          className="text-slate-300 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
          title="Edit campaign"
          data-testid={`campaign-cell-editbtn-${item.id}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {editable && current && (
        <button
          onClick={clear}
          disabled={busy}
          className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
          title="Remove campaign"
          data-testid={`campaign-cell-clearbtn-${item.id}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};