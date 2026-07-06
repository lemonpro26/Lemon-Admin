import React, { useEffect, useState } from 'react';
import { Phone, DollarSign, Trash2, Award } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s || '\u2014'; } };
const fmtDur = (d) => (d ? `${Math.floor(d / 60)}m ${d % 60}s` : '\u2014');

// Self-contained call detail dialog reused wherever a call needs opening
// (Calls tab and the Leads-tab unified search).
export const CallDetailDialog = ({ call, open, onOpenChange, onChanged }) => {
  const editable = canEditFn();
  const [c, setC] = useState(call);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setC(call);
    setAmount(call?.sale_value != null ? String(call.sale_value) : '');
  }, [call]);

  if (!c) return null;

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
    ['Campaign', c.campaign_name || c.google_campaign || c.campaign, 'cd-campaign'],
    ['Ad Group', c.adgroup_name || c.adgroup_id, 'cd-adgroup'],
    ['Location', [c.city, c.state].filter(Boolean).join(', '), 'cd-location'],
    ['When', fmtDate(c.called_at || c.created_at), 'cd-when'],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="shared-call-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-emerald-600" /> Call detail
            {c.retained && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Retained</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {rows.map(([label, val, tid]) => (
            <div key={label} className="flex justify-between gap-4 text-sm py-1 border-b border-slate-100">
              <span className="text-slate-500">{label}</span>
              <span className="font-medium text-slate-900 text-right" data-testid={tid}>{val || '\u2014'}</span>
            </div>
          ))}

          {editable && (
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
