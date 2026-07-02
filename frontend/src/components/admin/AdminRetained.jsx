import React, { useCallback, useEffect, useState } from 'react';
import { Award, RefreshCw, Phone, FileText, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { DateRangeFilter, allTimeRange } from '@/components/admin/DateRangeFilter';

const fmtDate = (s) => {
  if (!s) return '\u2014';
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
};

const SOURCE_LABELS = { lapa: 'PA', laspa: 'Spanish PA', sp: 'Spanish', dg: 'Demand Gen', dgs: 'Spanish DG', home: 'Home' };

// yyyy-mm-dd for a date <input>, from a stored ISO string.
const toDateInput = (s) => {
  if (!s) return '';
  try { return new Date(s).toISOString().slice(0, 10); } catch { return ''; }
};

const RetainedDateCell = ({ item, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toDateInput(item.retained_at));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(item, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-36 rounded-lg border-slate-200 text-sm"
          data-testid={`retained-date-input-${item.id}`}
        />
        <button onClick={save} disabled={saving} className="text-emerald-600 hover:text-emerald-700 p-1" data-testid={`retained-date-save-${item.id}`}><Check className="h-4 w-4" /></button>
        <button onClick={() => { setDraft(toDateInput(item.retained_at)); setEditing(false); }} className="text-slate-400 hover:text-slate-600 p-1" data-testid={`retained-date-cancel-${item.id}`}><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <button
      onClick={() => { setDraft(toDateInput(item.retained_at)); setEditing(true); }}
      className="group inline-flex items-center gap-1.5 text-slate-600 hover:text-[#0F1B3D] transition-colors"
      data-testid={`retained-date-edit-${item.id}`}
    >
      {fmtDate(item.retained_at)}
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};

export const AdminRetained = () => {
  // Defaults to All-time so the tab shows every retained client.
  const [range, setRange] = useState(allTimeRange());
  const [data, setData] = useState({ items: [], total: 0, lead_count: 0, call_count: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/retained', { params: { start: range.start, end: range.end } });
      setData(res.data || { items: [] });
    } catch (e) {
      toast.error('Failed to load retained clients');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const saveRetainedDate = async (item, dateStr) => {
    const path = item.type === 'call' ? 'calls' : 'leads';
    try {
      await api.post(`/admin/${path}/${item.id}/retained`, { retained: true, retained_at: dateStr });
      toast.success('Retained date updated');
      await load();
    } catch (e) {
      toast.error('Could not update the retained date.');
      throw e;
    }
  };

  const items = data.items || [];

  return (
    <div className="space-y-5" data-testid="admin-retained">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-500" /> Your retained clients — every lead &amp; call you marked as retained.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#0F1B3D] transition-colors" data-testid="retained-refresh">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { k: 'total', label: 'Retained clients', v: data.total, cls: 'text-amber-600' },
          { k: 'leads', label: 'From form leads', v: data.lead_count, cls: 'text-blue-600' },
          { k: 'calls', label: 'From phone calls', v: data.call_count, cls: 'text-emerald-600' },
        ].map((c) => (
          <div key={c.k} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`retained-stat-${c.k}`}>
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className={`mt-1 text-3xl font-extrabold ${c.cls}`} data-testid={`retained-stat-value-${c.k}`}>{loading ? '\u2014' : c.v}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500" data-testid="retained-loading">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500" data-testid="retained-empty">
            No retained clients yet. Open a lead or call and mark it as retained — it will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="retained-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden sm:table-cell">Source</TableHead>
                  <TableHead className="hidden sm:table-cell">Revenue</TableHead>
                  <TableHead className="hidden md:table-cell">Came in on</TableHead>
                  <TableHead>Retained on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={`${it.type}-${it.id}`} data-testid={`retained-row-${it.id}`}>
                    <TableCell className="font-medium text-slate-900">{it.name}</TableCell>
                    <TableCell>
                      {it.type === 'call' ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1"><Phone className="h-3 w-3" /> Call</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] gap-1"><FileText className="h-3 w-3" /> Lead</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{it.phone || '\u2014'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-slate-600" data-testid={`retained-source-${it.id}`}>
                      {it.type === 'call'
                        ? `Call from ${it.number_group_label || 'Unknown'}`
                        : (SOURCE_LABELS[it.source_page] || it.source_page || '\u2014')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {it.sale_status === 'sold' ? <span className="font-semibold text-slate-900">${Number(it.sale_value).toLocaleString()}</span> : <span className="text-slate-400">{'\u2014'}</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-slate-500 text-sm whitespace-nowrap" data-testid={`retained-camein-${it.id}`}>{fmtDate(it.created_at)}</TableCell>
                    <TableCell className="text-slate-500 text-sm whitespace-nowrap"><RetainedDateCell item={it} onSave={saveRetainedDate} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};
