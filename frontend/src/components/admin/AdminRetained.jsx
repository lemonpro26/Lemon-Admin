import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, RefreshCw, Phone, FileText, Pencil, Check, X, Search, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
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

// Small indicator of whether the revenue was sent to Google Ads.
const GoogleSyncTag = ({ item }) => {
  if (item.sale_status !== 'sold') return null;
  if (item.conversion_uploaded) {
    return <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 whitespace-nowrap" title={item.conversion_status || 'Uploaded to Google Ads'} data-testid={`retained-gsync-${item.id}`}>✓ Google</span>;
  }
  return <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-1.5 py-0.5 whitespace-nowrap" title={item.conversion_status || 'Not yet uploaded to Google Ads'} data-testid={`retained-gsync-${item.id}`}>Google pending</span>;
};

// Inline revenue editor. Saving marks the client "sold" and uploads the revenue
// passback to Google Ads via the existing /sold endpoint.
const RevenueCell = ({ item, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.sale_value != null ? String(item.sale_value) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const val = parseFloat(draft);
    if (isNaN(val) || val < 0) { toast.error('Enter a valid revenue amount.'); return; }
    setSaving(true);
    try { await onSave(item, val); setEditing(false); } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
          <Input
            type="number" min="0" step="0.01" value={draft} autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            className="h-8 w-28 pl-5 rounded-lg border-slate-200 text-sm"
            data-testid={`retained-revenue-input-${item.id}`}
          />
        </div>
        <button onClick={save} disabled={saving} className="text-emerald-600 hover:text-emerald-700 p-1" data-testid={`retained-revenue-save-${item.id}`}><Check className="h-4 w-4" /></button>
        <button onClick={() => { setDraft(item.sale_value != null ? String(item.sale_value) : ''); setEditing(false); }} className="text-slate-400 hover:text-slate-600 p-1" data-testid={`retained-revenue-cancel-${item.id}`}><X className="h-4 w-4" /></button>
      </div>
    );
  }
  if (item.sale_status === 'sold') {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={() => setEditing(true)} className="group inline-flex items-center gap-1.5" data-testid={`retained-revenue-edit-${item.id}`}>
          <span className="font-semibold text-slate-900">${Number(item.sale_value).toLocaleString()}</span>
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
        </button>
        <GoogleSyncTag item={item} />
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700" data-testid={`retained-revenue-add-${item.id}`}>
      <DollarSign className="h-3.5 w-3.5" /> Add revenue
    </button>
  );
};

export const AdminRetained = () => {
  // Defaults to All-time so the tab shows every retained client.
  const [range, setRange] = useState(allTimeRange());
  const [data, setData] = useState({ items: [], total: 0, lead_count: 0, call_count: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const saveRevenue = async (item, value) => {
    const path = item.type === 'call' ? 'calls' : 'leads';
    try {
      const res = await api.post(`/admin/${path}/${item.id}/sold`, { value, currency: item.sale_currency || 'USD' });
      const conv = res.data?.conversion || {};
      if (conv.ok && !conv.validate_only) {
        toast.success(`Revenue saved & sent to Google Ads ($${Number(value).toLocaleString()}).`);
      } else if (conv.validate_only) {
        toast.success(`Revenue saved. Google Ads is in validation mode (test) — not counted live.`);
      } else {
        toast.success(`Revenue saved ($${Number(value).toLocaleString()}). Google Ads upload pending — ${conv.detail || conv.status || 'will retry'}.`);
      }
      await load();
    } catch (e) {
      toast.error('Could not save revenue.');
      throw e;
    }
  };

  const allItems = data.items || [];
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    const digits = q.replace(/\D/g, '');
    return allItems.filter((it) => {
      const source = it.type === 'call'
        ? `call from ${it.number_group_label || ''}`
        : (SOURCE_LABELS[it.source_page] || it.source_page || '');
      const hay = [it.name, it.phone, source, it.type].filter(Boolean).join(' ').toLowerCase();
      const phoneDigits = String(it.phone || '').replace(/\D/g, '');
      return hay.includes(q) || (digits && phoneDigits.includes(digits));
    });
  }, [allItems, search]);

  return (
    <div className="space-y-5" data-testid="admin-retained">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-500" /> Your retained clients — every lead &amp; call you marked as retained.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search retained by name, number…"
              className="pl-9 pr-8 h-9 w-64 rounded-xl border-slate-200"
              data-testid="retained-search"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" data-testid="retained-search-clear" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button onClick={load} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#0F1B3D] transition-colors" data-testid="retained-refresh">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { k: 'total', label: 'Retained clients', v: data.total, cls: 'text-amber-600' },
          { k: 'leads', label: 'From form leads', v: data.lead_count, cls: 'text-blue-600' },
          { k: 'calls', label: 'From phone calls', v: data.call_count, cls: 'text-emerald-600' },
          { k: 'revenue', label: 'Total revenue', v: `$${Number(data.total_revenue || 0).toLocaleString()}`, cls: 'text-slate-900' },
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
            {search.trim()
              ? `No retained clients match "${search.trim()}".`
              : 'No retained clients yet. Open a lead or call and mark it as retained — it will appear here.'}
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
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{it.name}</span>
                        {(it.qb_name || it.qb_email) && (
                          <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-1.5 py-0.5 whitespace-nowrap" title="Name/email pulled from Quickbase" data-testid={`retained-qb-tag-${it.id}`}>Quickbase</span>
                        )}
                      </div>
                      {it.email && <div className="text-xs font-normal text-slate-500 truncate max-w-[220px]" data-testid={`retained-email-${it.id}`}>{it.email}</div>}
                    </TableCell>
                    <TableCell>
                      {it.type === 'call' ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1"><Phone className="h-3 w-3" /> Call</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] gap-1"><FileText className="h-3 w-3" /> Lead</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{formatPhone(it.phone) || '\u2014'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-slate-600" data-testid={`retained-source-${it.id}`}>
                      {it.type === 'call'
                        ? `Call from ${it.number_group_label || 'Unknown'}`
                        : (SOURCE_LABELS[it.source_page] || it.source_page || '\u2014')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <RevenueCell item={it} onSave={saveRevenue} />
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
