import React, { useEffect, useState } from 'react';
import { FileText, DollarSign, Trash2, Award } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s || '\u2014'; } };
const SRC = { lapa: 'PA (lapa)', laspa: 'Spanish PA (laspa)', sp: 'Spanish (sp)', dg: 'Demand Gen (dg)', dgs: 'Spanish DG (dgs)' };

// Self-contained lead detail dialog reused wherever a lead needs opening
// (Leads tab and the Calls-tab unified search).
export const LeadDetailDialog = ({ lead, open, onOpenChange, onChanged }) => {
  const editable = canEditFn();
  const [l, setL] = useState(lead);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setL(lead);
    setAmount(lead?.sale_value != null ? String(lead.sale_value) : '');
  }, [lead]);

  if (!l) return null;
  const name = l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || '\u2014';
  const vehicle = [l.car_year, l.car_make, l.car_model].filter(Boolean).join(' ') || '\u2014';

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
    ['Phone', l.phone, 'ld-phone'],
    ['Email', l.email, 'ld-email'],
    ['Vehicle', vehicle, 'ld-vehicle'],
    ['Source', SRC[l.source_page] || l.source_page || 'home', 'ld-source'],
    ['IP Address', l.ip, 'ld-ip'],
    ['When', fmtDate(l.created_at), 'ld-when'],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="shared-lead-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" /> Lead detail
            {l.retained && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Retained</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {rows.map(([label, val, tid]) => (
            <div key={label} className="flex justify-between gap-4 text-sm py-1 border-b border-slate-100">
              <span className="text-slate-500">{label}</span>
              <span className="font-medium text-slate-900 text-right break-all" data-testid={tid}>{val || '\u2014'}</span>
            </div>
          ))}

          {editable && (
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
