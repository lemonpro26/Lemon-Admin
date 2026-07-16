import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, RefreshCw, Phone, FileText, Pencil, Check, X, Search, DollarSign, Database, Eye, Megaphone, MapPin, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';
import { CallDetailDialog } from '@/components/admin/CallDetailDialog';
import { LeadDetailDialog } from '@/components/admin/LeadDetailDialog';
import { NetworkChips, getNetwork } from '@/lib/networks';
import { CampaignCell } from '@/components/admin/CampaignEditor';

const fmtDate = (s) => {
  if (!s) return '\u2014';
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
};

const SOURCE_LABELS = { lapa: 'PA', laspa: 'Spanish PA', sp: 'Spanish', dg: 'Demand Gen', dgs: 'Spanish DG', home: 'Home' };

const UNATTRIBUTED = 'Unattributed / Direct';
// Best human-readable campaign for a retained lead/call (falls back to the raw id,
// then to an "unattributed" bucket for calls/leads with no Google campaign).
const campaignLabel = (it) => (it.campaign_name || it.google_campaign || it.campaign || it.campaign_id || UNATTRIBUTED);

const UNKNOWN_CITY = 'Unknown location';
// City label for a retained lead/call (city + state), for the "Retained by city" view.
const cityLabel = (it) => {
  const parts = [it.city, it.state].map((s) => (s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : UNKNOWN_CITY;
};

// Toggleable table columns (Client / Retained on / Detail are always shown).
const TOGGLE_COLS = [
  { key: 'type', label: 'Type' },
  { key: 'phone', label: 'Phone' },
  { key: 'source', label: 'Source' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'camein', label: 'Came in on' },
];

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
  // Defaults to Today; use the date filter (This week / Last week / All time) to widen.
  const [range, setRange] = useState(todayRange());
  const [data, setData] = useState({ items: [], total: 0, lead_count: 0, call_count: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [syncingQb, setSyncingQb] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [network, setNetwork] = useState('all');
  const [campaign, setCampaign] = useState('all');
  const [city, setCity] = useState('all');
  const [cols, setCols] = useState(() => Object.fromEntries(TOGGLE_COLS.map((c) => [c.key, true])));
  const colOn = (k) => cols[k] !== false;

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

  const syncQuickbase = async () => {
    setSyncingQb(true);
    try {
      const res = await api.post('/admin/quickbase/sync');
      const { leads = 0, calls = 0, matched = 0 } = res.data || {};
      toast.success(`Synced ${leads + calls} records from Quickbase — ${matched} matched to a name/email.`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not sync from Quickbase.');
    } finally {
      setSyncingQb(false);
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

  // Network filter: clicking a network chip narrows the list AND the stat cards
  // to just that traffic source (same behaviour as the Calls & Leads tabs).
  const netItems = useMemo(
    () => items.filter((it) => network === 'all' || getNetwork(it) === network),
    [items, network],
  );
  // Campaign breakdown — how many retained clients (and revenue) each campaign drove.
  const campaignBreakdown = useMemo(() => {
    const m = new Map();
    for (const it of netItems) {
      const key = campaignLabel(it);
      const e = m.get(key) || { key, count: 0, revenue: 0 };
      e.count += 1;
      e.revenue += it.sale_status === 'sold' ? Number(it.sale_value || 0) : 0;
      m.set(key, e);
    }
    // Blank / "Unattributed" bucket first, then the rest alphabetically.
    return Array.from(m.values()).sort((a, b) => {
      const au = a.key === UNATTRIBUTED, bu = b.key === UNATTRIBUTED;
      if (au !== bu) return au ? -1 : 1;
      return a.key.localeCompare(b.key);
    });
  }, [netItems]);
  // City breakdown — geographic distribution of retained clients.
  const cityBreakdown = useMemo(() => {
    const m = new Map();
    for (const it of netItems) {
      const key = cityLabel(it);
      const e = m.get(key) || { key, count: 0, revenue: 0 };
      e.count += 1;
      e.revenue += it.sale_status === 'sold' ? Number(it.sale_value || 0) : 0;
      m.set(key, e);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [netItems]);
  const shownItems = useMemo(
    () => netItems.filter((it) =>
      (campaign === 'all' || campaignLabel(it) === campaign) &&
      (city === 'all' || cityLabel(it) === city)),
    [netItems, campaign, city],
  );
  const stats = useMemo(() => {
    const leadCount = shownItems.filter((i) => i.type === 'lead').length;
    const callCount = shownItems.filter((i) => i.type === 'call').length;
    const revenue = shownItems.reduce(
      (sum, i) => sum + (i.sale_status === 'sold' ? Number(i.sale_value || 0) : 0), 0);
    return { total: shownItems.length, leadCount, callCount, revenue: Math.round(revenue * 100) / 100 };
  }, [shownItems]);

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#0F1B3D] transition-colors" data-testid="retained-columns-trigger">
                <SlidersHorizontal className="h-4 w-4" /> Columns
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" data-testid="retained-columns-menu">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TOGGLE_COLS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={colOn(c.key)}
                  onCheckedChange={(v) => setCols((prev) => ({ ...prev, [c.key]: !!v }))}
                  onSelect={(e) => e.preventDefault()}
                  data-testid={`retained-col-toggle-${c.key}`}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={syncQuickbase} disabled={syncingQb} className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-60 transition-colors" data-testid="retained-sync-quickbase">
            <Database className={`h-4 w-4 ${syncingQb ? 'animate-pulse' : ''}`} /> {syncingQb ? 'Syncing…' : 'Sync from Quickbase'}
          </button>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { k: 'total', label: 'Retained clients', v: stats.total, cls: 'text-amber-600' },
          { k: 'leads', label: 'From form leads', v: stats.leadCount, cls: 'text-blue-600' },
          { k: 'calls', label: 'From phone calls', v: stats.callCount, cls: 'text-emerald-600' },
          { k: 'revenue', label: 'Total revenue', v: `$${Number(stats.revenue || 0).toLocaleString()}`, cls: 'text-slate-900' },
        ].map((c) => (
          <div key={c.k} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`retained-stat-${c.k}`}>
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className={`mt-1 text-3xl font-extrabold ${c.cls}`} data-testid={`retained-stat-value-${c.k}`}>{loading ? '\u2014' : c.v}</div>
          </div>
        ))}
      </div>

      {/* Network filter — clicking a network narrows the table AND the stats above. */}
      <NetworkChips items={items} value={network} onChange={setNetwork} testidPrefix="retained-network" />

      {/* Campaign breakdown — which campaigns your retained clients came from. */}
      {campaignBreakdown.length > 0 && (
        <div data-testid="retained-campaign-breakdown">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Megaphone className="h-3.5 w-3.5" /> Retained by campaign
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCampaign('all')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${campaign === 'all' ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              data-testid="retained-campaign-all"
            >
              All campaigns <span className="text-xs opacity-80">{netItems.length}</span>
            </button>
            {campaignBreakdown.map((c) => (
              <button
                key={c.key}
                onClick={() => setCampaign(campaign === c.key ? 'all' : c.key)}
                title={c.revenue ? `$${Number(c.revenue).toLocaleString()} revenue` : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${campaign === c.key ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'}`}
                data-testid={`retained-campaign-chip-${c.key}`}
              >
                <span className="max-w-[220px] truncate">{c.key}</span>
                <span className={`text-xs rounded-full px-1.5 ${campaign === c.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{c.count}</span>
                {c.revenue > 0 && (
                  <span className={`text-xs ${campaign === c.key ? 'text-white/90' : 'text-emerald-600'}`}>${Number(c.revenue).toLocaleString()}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* City breakdown — geographic distribution of your retained clients. */}
      {cityBreakdown.length > 0 && (
        <div data-testid="retained-city-breakdown">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <MapPin className="h-3.5 w-3.5" /> Retained by city
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCity('all')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${city === 'all' ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              data-testid="retained-city-all"
            >
              All cities <span className="text-xs opacity-80">{netItems.length}</span>
            </button>
            {cityBreakdown.map((c) => (
              <button
                key={c.key}
                onClick={() => setCity(city === c.key ? 'all' : c.key)}
                title={c.revenue ? `$${Number(c.revenue).toLocaleString()} revenue` : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${city === c.key ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'}`}
                data-testid={`retained-city-chip-${c.key}`}
              >
                <span className="max-w-[220px] truncate">{c.key}</span>
                <span className={`text-xs rounded-full px-1.5 ${city === c.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{c.count}</span>
                {c.revenue > 0 && (
                  <span className={`text-xs ${city === c.key ? 'text-white/90' : 'text-emerald-600'}`}>${Number(c.revenue).toLocaleString()}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500" data-testid="retained-loading">Loading…</div>
        ) : shownItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500" data-testid="retained-empty">
            {search.trim()
              ? `No retained clients match "${search.trim()}".`
              : network !== 'all'
                ? `No retained clients from ${network} yet.`
                : 'No retained clients yet. Open a lead or call and mark it as retained — it will appear here.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="retained-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  {colOn('type') && <TableHead>Type</TableHead>}
                  {colOn('phone') && <TableHead>Phone</TableHead>}
                  {colOn('source') && <TableHead className="hidden sm:table-cell">Source</TableHead>}
                  {colOn('campaign') && <TableHead className="hidden lg:table-cell">Campaign</TableHead>}
                  {colOn('revenue') && <TableHead className="hidden sm:table-cell">Revenue</TableHead>}
                  {colOn('camein') && <TableHead className="hidden md:table-cell">Came in on</TableHead>}
                  <TableHead>Retained on</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownItems.map((it) => (
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
                    {colOn('type') && (
                    <TableCell>
                      {it.type === 'call' ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1"><Phone className="h-3 w-3" /> Call</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] gap-1"><FileText className="h-3 w-3" /> Lead</Badge>
                      )}
                    </TableCell>
                    )}
                    {colOn('phone') && <TableCell className="text-slate-600">{formatPhone(it.phone) || '\u2014'}</TableCell>}
                    {colOn('source') && (
                    <TableCell className="hidden sm:table-cell text-slate-600" data-testid={`retained-source-${it.id}`}>
                      {it.type === 'call'
                        ? `Call from ${it.number_group_label || 'Unknown'}`
                        : (SOURCE_LABELS[it.source_page] || it.source_page || '\u2014')}
                    </TableCell>
                    )}
                    {colOn('campaign') && (
                    <TableCell className="hidden lg:table-cell" data-testid={`retained-campaign-${it.id}`}>
                      <CampaignCell kind={it.type === 'call' ? 'calls' : 'leads'} item={it} onChanged={(u) => setData((prev) => ({ ...prev, items: (prev.items || []).map((x) => (x.id === it.id && x.type === it.type) ? { ...x, ...u } : x) }))} />
                    </TableCell>
                    )}
                    {colOn('revenue') && (
                    <TableCell className="hidden sm:table-cell">
                      <RevenueCell item={it} onSave={saveRevenue} />
                    </TableCell>
                    )}
                    {colOn('camein') && <TableCell className="hidden md:table-cell text-slate-500 text-sm whitespace-nowrap" data-testid={`retained-camein-${it.id}`}>{fmtDate(it.created_at)}</TableCell>}
                    <TableCell className="text-slate-500 text-sm whitespace-nowrap"><RetainedDateCell item={it} onSave={saveRetainedDate} /></TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => setViewing(it)}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0F1B3D] hover:text-indigo-600 transition-colors"
                        data-testid={`retained-view-${it.id}`}
                      >
                        <Eye className="h-4 w-4" /> View
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CallDetailDialog
        call={viewing?.type === 'call' ? viewing : null}
        open={!!viewing && viewing.type === 'call'}
        onOpenChange={(o) => !o && setViewing(null)}
        onChanged={load}
      />
      <LeadDetailDialog
        lead={viewing?.type === 'lead' ? viewing : null}
        open={!!viewing && viewing.type === 'lead'}
        onOpenChange={(o) => !o && setViewing(null)}
        onChanged={load}
      />
    </div>
  );
};
