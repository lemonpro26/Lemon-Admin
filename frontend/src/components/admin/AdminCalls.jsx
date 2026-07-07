import React, { useEffect, useState, useCallback } from 'react';
import { Phone, RefreshCw, Trash2, PlayCircle, DollarSign, Send, RotateCw, Plus, FlaskConical, Search, X, SlidersHorizontal, Award, FileText, Sparkles, Target } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { NetworkChips, getNetwork } from '@/lib/networks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';
import { useSortable, SortLabel } from '@/lib/useSortable';
import { useLivePoll, LiveBadge } from '@/lib/useLivePoll';
import { Badge } from '@/components/ui/badge';
import { LeadDetailDialog } from '@/components/admin/LeadDetailDialog';

// Toggleable columns (Caller & Actions always shown). Persisted per-browser.
const COLS = [
  { key: 'number', label: 'Number' },
  { key: 'called', label: 'Called #' },
  { key: 'duration', label: 'Duration' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'hook', label: 'Hook seen' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'location', label: 'Location' },
  { key: 'when', label: 'When' },
];
const COLS_KEY = 'lp_calls_cols_v1';
const loadCols = () => {
  const def = { number: true, called: true, duration: true, campaign: true, hook: true, revenue: true, location: true, when: true };
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_KEY) || '{}');
    return { ...def, ...saved };
  } catch { return def; }
};

// Call segments keyed on the DIALED tracking number (reliable for every call).
const CALL_SEGMENTS = [
  { key: 'all', label: 'All' },
  { key: 'attributed', label: 'Attributed' },
  { key: 'home_pa', label: 'Home & PA', hint: '844-335-8911' },
  { key: 'spanish', label: 'Spanish', hint: '866-524-3722' },
  { key: 'dg', label: 'Demand Gen', hint: '833-240-9312' },
  { key: 'dgs', label: 'Demand Gen Spanish', hint: '833-868-1802' },
];

// A call is "attributed" when we can tie it to an ad/campaign.
const callHasAttribution = (c) => !!(c.campaign_name || c.google_campaign);


const GCALL_TYPE_LABELS = {
  CALL_TRACKED: 'Tracked call',
  DIRECT_CALL: 'Direct call',
  MANUALLY_DIALED: 'Manually dialed',
  HIGH_END_MOBILE_SEARCH: 'Mobile click-to-call',
};
const gcallType = (t) => GCALL_TYPE_LABELS[t] || (t ? String(t).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '');

const fmtDuration = (s) => {  const n = Number(s) || 0;
  const m = Math.floor(n / 60);
  const sec = n % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const convBadge = (c) => {
  if (c?.sale_status !== 'sold') return null;
  const st = c.conversion_status;
  if (c.conversion_uploaded) return { txt: 'Sent to Google', cls: 'bg-emerald-100 text-emerald-700' };
  if (st === 'validated') return { txt: 'Validated (test)', cls: 'bg-sky-100 text-sky-700' };
  if (st === 'not_configured') return { txt: 'Saved — pending', cls: 'bg-amber-100 text-amber-700' };
  if (st === 'no_identifier') return { txt: 'No GCLID/phone', cls: 'bg-slate-100 text-slate-600' };
  if (st === 'rejected' || st === 'error') return { txt: 'Failed — retry', cls: 'bg-red-100 text-red-700' };
  return { txt: 'Saved', cls: 'bg-slate-100 text-slate-600' };
};

export const AdminCalls = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(todayRange());
  const [selected, setSelected] = useState(null);
  const [saleAmount, setSaleAmount] = useState('');
  const [saleCurrency, setSaleCurrency] = useState('USD');
  const [marking, setMarking] = useState(false);
  const [gaStatus, setGaStatus] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [seg, setSeg] = useState('all');
  const [network, setNetwork] = useState('all');
  const [cols, setCols] = useState(loadCols);
  const [matchedLeads, setMatchedLeads] = useState([]);
  const [openedLead, setOpenedLead] = useState(null);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testName, setTestName] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [numbers, setNumbers] = useState([]);
  const editable = canEditFn();
  const { sorted: sortedCalls, sortKey, sortDir, toggle } = useSortable(calls, 'created_at', 'desc');

  useEffect(() => {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
  }, [cols]);
  const toggleCol = (k) => setCols((prev) => ({ ...prev, [k]: !prev[k] }));

  // Segment calls by the DIALED tracking number (number_group), plus an
  // "attributed" segment that shows only calls tied to an ad/campaign.
  const inSeg = (s, c) => s === 'all' || (s === 'attributed' ? callHasAttribution(c) : (c.number_group || 'other') === s);
  const segCounts = CALL_SEGMENTS.reduce((acc, s) => {
    acc[s.key] = s.key === 'all' ? calls.length : calls.filter((c) => inSeg(s.key, c)).length;
    return acc;
  }, {});
  const shownCalls = sortedCalls.filter((c) => inSeg(seg, c) && (network === 'all' || getNetwork(c) === network));
  const colSpanCount = COLS.filter((k) => cols[k.key]).length + 2; // + Caller + Actions

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const q = debouncedSearch.trim();
      // Search looks across ALL calls (ignores the date range), like the Leads tab.
      const params = q ? { search: q } : { start: range.start, end: range.end };
      const res = await api.get('/admin/calls', { params });
      setCalls(res.data?.calls || []);
      // Unified search: also surface matching LEADS when searching.
      if (q) {
        try {
          const lr = await api.get('/admin/leads', { params: { search: q } });
          setMatchedLeads(lr.data?.leads || lr.data?.items || []);
        } catch { setMatchedLeads([]); }
      } else {
        setMatchedLeads([]);
      }
    } catch (e) {
      if (!silent) toast.error('Failed to load calls.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [range, debouncedSearch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/admin/phone-numbers').then((r) => setNumbers(r.data?.numbers || [])).catch(() => {});
  }, []);
  useLivePoll(() => load({ silent: true }), { intervalMs: 30000 });

  useEffect(() => {
    api.get('/admin/google-ads/status').then((r) => setGaStatus(r.data)).catch(() => {});
  }, []);

  const openCall = (c) => {
    setSelected(c);
    setSaleAmount(c.sale_value != null ? String(c.sale_value) : '');
    setSaleCurrency(c.sale_currency || 'USD');
  };

  const markSold = async () => {
    const value = parseFloat(saleAmount);
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a valid revenue amount.');
      return;
    }
    setMarking(true);
    try {
      const res = await api.post(`/admin/calls/${selected.id}/sold`, {
        value, currency: saleCurrency || 'USD',
      });
      const conv = res.data?.conversion || {};
      toast.success(conv.ok ? `Marked sold. ${conv.detail || ''}` : `Saved. ${conv.detail || 'Conversion pending.'}`);
      await load();
      setSelected({ ...selected, ...res.data });
    } catch (e) {
      toast.error('Could not mark call as sold.');
    } finally {
      setMarking(false);
    }
  };

  const retryConversion = async () => {
    setMarking(true);
    try {
      const res = await api.post(`/admin/calls/${selected.id}/conversion/retry`);
      const conv = res.data?.conversion || {};
      toast.success(conv.ok ? `Sent. ${conv.detail || ''}` : `${conv.detail || 'Still pending.'}`);
      await load();
      setSelected({ ...selected, ...(res.data || {}) });
    } catch (e) {
      toast.error('Retry failed.');
    } finally {
      setMarking(false);
    }
  };

  const markRetained = async (retained) => {
    if (!selected) return;
    try {
      await api.post(`/admin/calls/${selected.id}/retained`, { retained });
      setSelected({ ...selected, retained, retained_at: retained ? new Date().toISOString() : null });
      toast.success(retained ? 'Marked as retained client' : 'Removed from retained');
      await load();
    } catch (e) {
      toast.error('Could not update retained status.');
    }
  };

  const deleteCall = async (c) => {
    if (!window.confirm(`Delete call from ${c.caller_number || 'unknown'}?`)) return;
    try {
      await api.delete(`/admin/calls/${c.id}`);
      toast.success('Call deleted.');
      load();
    } catch (e) {
      toast.error('Could not delete call.');
    }
  };

  const addTestCall = async () => {
    try {
      const payload = {};
      if (testPhone.trim()) payload.phone = testPhone.trim();
      if (testName.trim()) payload.name = testName.trim();
      if (testNumber) payload.tracking_number = testNumber;
      const res = await api.post('/admin/calls/test', payload);
      const c = res.data?.call || {};
      toast.success(payload.phone
        ? `Test call added for ${c.caller_number}${c.qb_name ? ` — matched "${c.qb_name}" in Quickbase` : ' — no Quickbase match'}.`
        : 'Test call added.');
      setTestOpen(false);
      setTestPhone('');
      setTestName('');
      load();
    } catch (e) {
      toast.error('Could not add test call.');
    }
  };

  const syncGoogleCalls = async () => {
    setSyncingGoogle(true);
    try {
      const res = await api.post('/admin/calls/sync-google');
      const m = res.data?.matched ?? 0;
      const g = res.data?.google_rows ?? 0;
      toast.success(m > 0
        ? `Matched ${m} call${m === 1 ? '' : 's'} to Google Ads (${g} Google records scanned).`
        : `No new matches yet (${g} Google records scanned). Google call data can lag a few hours.`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not sync Google call details.');
    } finally {
      setSyncingGoogle(false);
    }
  };

  return (
    <div className="grid gap-4" data-testid="admin-calls">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Phone className="h-4 w-4" /> {debouncedSearch.trim() ? `Search results for "${debouncedSearch.trim()}" — all calls` : 'Inbound calls from CallTrackingMetrics, with ad attribution & revenue passback.'}
          {!debouncedSearch.trim() && <LiveBadge />}
        </p>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search calls by number, name, city…"
              className="pl-9 pr-8 h-9 w-64 rounded-xl border-slate-200"
              data-testid="calls-search"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" data-testid="calls-search-clear" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {editable && (
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)} className="rounded-xl border-slate-200" data-testid="calls-add-test">
              <Plus className="h-4 w-4 mr-2" /> Test call
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => load()} className="rounded-xl border-slate-200" data-testid="calls-refresh">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          {editable && (
            <Button variant="outline" size="sm" onClick={syncGoogleCalls} disabled={syncingGoogle} className="rounded-xl border-slate-200" data-testid="calls-sync-google" title="Pull call type & campaign from Google Ads and match to your calls">
              <Sparkles className={`h-4 w-4 mr-2 ${syncingGoogle ? 'animate-pulse' : ''}`} /> {syncingGoogle ? 'Syncing…' : 'Sync Google calls'}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl border-slate-200" data-testid="calls-columns-button">
                <SlidersHorizontal className="h-4 w-4 mr-2" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={!!cols[col.key]}
                  onCheckedChange={() => toggleCol(col.key)}
                  onSelect={(e) => e.preventDefault()}
                  data-testid={`calls-col-toggle-${col.key}`}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!debouncedSearch.trim() && <DateRangeFilter value={range} onChange={setRange} />}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="call-segment-filters">
        {CALL_SEGMENTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSeg(s.key)}
            title={s.hint || ''}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${seg === s.key ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
            data-testid={`call-seg-${s.key}`}
          >
            {s.label}
            <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${seg === s.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`} data-testid={`call-seg-count-${s.key}`}>{segCounts[s.key]}</span>
          </button>
        ))}
      </div>

      {/* Network filter (mockup) — separate calls by traffic source */}
      <div className="mt-3">
        <NetworkChips items={sortedCalls} value={network} onChange={setNetwork} testidPrefix="call-network" />
      </div>

      {debouncedSearch.trim() && matchedLeads.length > 0 && (
        <div data-testid="calls-matched-leads">
          <p className="text-sm text-slate-500 flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4" /> Matching leads ({matchedLeads.length})
          </p>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table data-testid="calls-matched-leads-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead className="hidden md:table-cell">Vehicle</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchedLeads.map((l) => {
                    const name = l.qb_name || l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || '\u2014';
                    const vehicle = [l.car_year, l.car_make, l.car_model].filter(Boolean).join(' ');
                    return (
                      <TableRow key={l.id} data-testid={`matched-lead-row-${l.id}`} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenedLead(l)}>
                        <TableCell className="font-medium text-slate-900">
                          {name}
                          <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-200 text-[10px]">lead</Badge>
                          {l.retained && <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Retained</Badge>}
                        </TableCell>
                        <TableCell className="text-slate-600">{formatPhone(l.phone) || '\u2014'}</TableCell>
                        <TableCell className="hidden sm:table-cell text-slate-600">{l.email || '\u2014'}</TableCell>
                        <TableCell className="hidden md:table-cell text-slate-600">{vehicle || '\u2014'}</TableCell>
                        <TableCell className="hidden sm:table-cell text-slate-500 text-sm">{fmtDate(l.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortLabel label="Caller" k="caller_name" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
              {cols.number && <TableHead><SortLabel label="Number" k="caller_number" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              {cols.called && <TableHead><SortLabel label="Called #" k="tracked_number_display" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              {cols.duration && <TableHead><SortLabel label="Duration" k="duration" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              {cols.campaign && <TableHead className="hidden md:table-cell"><SortLabel label="Campaign" k="campaign" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              {cols.hook && <TableHead className="hidden lg:table-cell"><SortLabel label="Hook seen" k="hook_label" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              {cols.revenue && <TableHead className="hidden sm:table-cell"><SortLabel label="Revenue" k="sale_value" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              {cols.location && <TableHead className="hidden lg:table-cell"><SortLabel label="Location" k="city" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              {cols.when && <TableHead><SortLabel label="When" k="created_at" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={colSpanCount} className="text-center text-slate-400 py-10">Loading…</TableCell></TableRow>
            ) : calls.length === 0 ? (
              <TableRow><TableCell colSpan={colSpanCount} className="text-center text-slate-400 py-10" data-testid="calls-empty">No calls in this period yet.</TableCell></TableRow>
            ) : shownCalls.length === 0 ? (
              <TableRow><TableCell colSpan={colSpanCount} className="text-center text-slate-400 py-10" data-testid="calls-seg-empty">No {(CALL_SEGMENTS.find((s) => s.key === seg) || {}).label || ''} calls in this period.</TableCell></TableRow>
            ) : shownCalls.map((c) => (
              <TableRow key={c.id} data-testid={`call-row-${c.id}`}>
                <TableCell className="font-medium text-slate-900">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{c.qb_name || c.caller_name || '—'}</span>
                    {c.number_group && c.number_group !== 'other' && (
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]" data-testid={`call-group-${c.number_group}-${c.id}`}>{c.number_group_label}</Badge>
                    )}
                    {(c.campaign_name || c.google_campaign) && (
                      <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-[10px] gap-1 max-w-[170px]" data-testid={`call-attribution-badge-${c.id}`} title={`Ad attribution: ${c.campaign_name || c.google_campaign}${c.adgroup_name ? ' › ' + c.adgroup_name : ''}`}>
                        <Target className="h-3 w-3 shrink-0" /> <span className="truncate">{c.campaign_name || c.google_campaign}</span>
                      </Badge>
                    )}
                    {c.retained && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]" data-testid={`call-retained-badge-${c.id}`}>Retained</Badge>
                    )}
                    {c.google_matched && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] gap-1" data-testid={`call-google-badge-${c.id}`} title={`Verified via Google Ads${c.google_call_type ? ' — ' + gcallType(c.google_call_type) : ''}`}>
                        <Sparkles className="h-3 w-3" /> Google Ads
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {cols.number && <TableCell className="text-slate-700">{formatPhone(c.caller_number) || '—'}</TableCell>}
                {cols.called && (
                  <TableCell className="text-slate-700 whitespace-nowrap" data-testid={`call-called-number-${c.id}`}>
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium">{c.tracked_number_display || '—'}</span>
                      {c.number_group && c.number_group !== 'other' && (
                        <span className="text-[10px] text-slate-400">{c.number_group_label}</span>
                      )}
                    </div>
                  </TableCell>
                )}
                {cols.duration && <TableCell className="text-slate-700">{fmtDuration(c.duration)}</TableCell>}
                {cols.campaign && (
                  <TableCell className="hidden md:table-cell text-slate-600">
                    {c.campaign_name || c.google_campaign || c.campaign || '—'}
                    {c.adgroup_name && (
                      <span className="block text-[10px] text-slate-400" data-testid={`call-adgroup-${c.id}`}>{c.adgroup_name}</span>
                    )}
                    {c.google_matched && c.google_call_type && (
                      <span className="block text-[10px] text-green-600" data-testid={`call-google-type-${c.id}`}>{gcallType(c.google_call_type)} · via Google</span>
                    )}
                  </TableCell>
                )}
                {cols.hook && (
                <TableCell className="hidden lg:table-cell">
                  {c.saw_landing_page ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700" data-testid={`call-hook-${c.id}`} title={c.hook1 || ''}>
                      {c.hook_label || 'Default hook'}
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500" data-testid={`call-nopage-${c.id}`}>
                      No page visit
                    </span>
                  )}
                </TableCell>
                )}
                {cols.revenue && (
                <TableCell className="hidden sm:table-cell">
                  {c.sale_status === 'sold' ? (
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-900" data-testid={`call-revenue-${c.id}`}>
                        ${Number(c.sale_value).toLocaleString()}
                      </span>
                      {convBadge(c) && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full w-fit ${convBadge(c).cls}`} data-testid={`call-conv-badge-${c.id}`}>
                          {convBadge(c).txt}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                )}
                {cols.location && <TableCell className="hidden lg:table-cell text-slate-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</TableCell>}
                {cols.when && <TableCell className="text-slate-600 whitespace-nowrap">{fmtDate(c.called_at || c.created_at)}</TableCell>}
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {c.recording_url && (
                      <a href={c.recording_url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800" title="Play recording" data-testid={`call-recording-${c.id}`}>
                        <PlayCircle className="h-5 w-5" />
                      </a>
                    )}
                    <Button variant="outline" size="sm" className="rounded-lg border-slate-200" onClick={() => openCall(c)} data-testid={`call-open-${c.id}`}>
                      View
                    </Button>
                    {editable && (
                      <Button variant="outline" size="sm" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 px-2" onClick={() => deleteCall(c)} data-testid={`call-delete-${c.id}`} title="Delete call">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* CALL DETAIL DIALOG */}
      <Dialog open={testOpen} onOpenChange={(o) => { if (!o) { setTestOpen(false); } }}>
        <DialogContent className="max-w-md" data-testid="test-call-dialog">
          <DialogHeader>
            <DialogTitle className="font-slab">Add a test call</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Creates a sample inbound call. Enter a specific phone number to test the Quickbase name lookup, or leave blank for a random test number.</p>
            <div>
              <label className="text-xs font-semibold text-slate-600">Phone number (optional)</label>
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="(760) 910-8655" className="mt-1 rounded-xl border-slate-200" data-testid="test-call-phone" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Caller name (optional)</label>
              <Input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="Leave blank to auto-fill from Quickbase" className="mt-1 rounded-xl border-slate-200" data-testid="test-call-name" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Tracking number (which number was called)</label>
              <select
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F1B3D]/20"
                data-testid="test-call-number"
              >
                <option value="">Random</option>
                {numbers.map((n) => (
                  <option key={n.key} value={n.display}>{n.label} — {n.display}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTestOpen(false)} className="rounded-xl" data-testid="test-call-cancel">Cancel</Button>
              <Button onClick={addTestCall} className="rounded-xl bg-[#0F1B3D] hover:bg-[#0a1330]" data-testid="test-call-submit">Add test call</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md" data-testid="admin-call-detail">
          <DialogHeader>
            <DialogTitle className="font-slab flex items-center gap-2">
              <Phone className="h-4 w-4" /> {selected?.qb_name || selected?.caller_name || formatPhone(selected?.caller_number) || 'Call'}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm">
                {[
                  ['Caller', selected.qb_name || selected.caller_name, 'call-detail-name'],
                  ['Number', formatPhone(selected.caller_number), 'call-detail-number'],
                  ['Called #', selected.tracked_number_display || selected.tracking_number, 'call-detail-tracking'],
                  ['Landing group', selected.number_group_label, 'call-detail-group'],
                  ['Duration', fmtDuration(selected.duration), 'call-detail-duration'],
                  ['Campaign', selected.campaign_name || selected.google_campaign || selected.campaign, 'call-detail-campaign'],
                  ['Ad Group', selected.adgroup_name || selected.adgroup_id, 'call-detail-adgroup'],
                  ['Ad', selected.ad_name || selected.ad_id, 'call-detail-ad'],
                  ['Keyword', selected.keyword, 'call-detail-keyword'],
                  ['GCLID', selected.gclid, 'call-detail-gclid'],
                  ['Location', [selected.city, selected.state].filter(Boolean).join(', '), 'call-detail-location'],
                  ['When', fmtDate(selected.called_at || selected.created_at), 'call-detail-when'],
                ].map(([label, value, tid]) => (
                  <div key={tid} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-900 font-medium text-right break-all" data-testid={tid}>{value || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Hook seen / landing-page attribution */}
              <div className="rounded-xl border border-slate-200 p-4 bg-white" data-testid="call-hook-section">
                <div className="flex items-center gap-2 mb-2">
                  <FlaskConical className="h-4 w-4 text-indigo-600" />
                  <span className="font-semibold text-slate-900">Landing page &amp; hook</span>
                </div>
                {selected.saw_landing_page ? (
                  <div className="text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700" data-testid="call-detail-hook-label">
                        {selected.hook_label || 'Default hook'}
                      </span>
                    </div>
                    {selected.hook1 && (
                      <p className="text-slate-900 font-semibold" data-testid="call-detail-hook1">{selected.hook1}</p>
                    )}
                    {selected.hook2 && (
                      <p className="text-slate-600 mt-1" data-testid="call-detail-hook2">{selected.hook2}</p>
                    )}
                    <div className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Landing page</span>
                        <span className="font-medium text-slate-900 text-right break-all" data-testid="call-detail-landing-path">{selected.landing_path || '—'}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Last click</span>
                        <span className="font-medium text-slate-900 text-right" data-testid="call-detail-last-click">{selected.last_click_at ? fmtDate(selected.last_click_at) : '—'}</span>
                      </div>
                      {selected.click_visits > 1 && (
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-500">Visits before calling</span>
                          <span className="font-medium text-slate-900 text-right" data-testid="call-detail-visits">{selected.click_visits}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500" data-testid="call-detail-nopage">
                    This caller clicked to call from the ad <strong>without visiting the landing page</strong> (no matching page visit found).
                  </p>
                )}
              </div>

              {/* Google Ads call details (matched from call_view) */}
              {selected.google_matched && (
                <div className="rounded-xl border border-green-200 p-4 bg-green-50" data-testid="call-google-section">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-slate-900">Google Ads call details</span>
                  </div>
                  <div className="grid gap-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Call type</span><span className="font-medium text-slate-900" data-testid="call-google-type">{gcallType(selected.google_call_type) || '—'}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Campaign</span><span className="font-medium text-slate-900 text-right break-all" data-testid="call-google-campaign">{selected.google_campaign || '—'}</span></div>
                    {selected.google_call_status && (
                      <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="font-medium text-slate-900">{selected.google_call_status}</span></div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Matched from Google Ads on caller area code + time + duration.</p>
                </div>
              )}

              {/* Revenue + Google Ads conversion */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50" data-testid="call-revenue-section">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-slate-900">Revenue &amp; Google Ads Conversion</span>
                </div>

                {selected.call_conversion_status && (
                  <div className="mb-3 text-xs rounded-lg bg-white border border-slate-200 px-3 py-2" data-testid="call-auto-conversion-status">
                    <span className="font-semibold text-slate-700">Auto call conversion: </span>
                    <span className="text-slate-600">
                      {selected.call_conversion_status === 'skipped_short'
                        ? 'Not counted (call too short)'
                        : selected.call_conversion_uploaded
                          ? 'Sent to Google Ads ✓'
                          : selected.call_conversion_validate_only && selected.call_conversion_status === 'validated'
                            ? 'Validated (test mode)'
                            : (selected.call_conversion_detail || selected.call_conversion_status)}
                    </span>
                  </div>
                )}

                {!selected.gclid && (
                  <div className="mb-3 text-xs rounded-lg bg-slate-100 border border-slate-200 text-slate-600 px-3 py-2" data-testid="call-no-gclid-note">
                    No GCLID on this call — Google will match on the caller&apos;s phone number (enhanced) only.
                  </div>
                )}
                {gaStatus && !gaStatus.configured && (
                  <div className="mb-3 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2" data-testid="call-ga-not-configured">
                    Google Ads isn&apos;t connected yet. Sales are saved now, and conversions upload once credentials are added.
                  </div>
                )}
                {gaStatus && gaStatus.configured && gaStatus.validate_only && (
                  <div className="mb-3 text-xs rounded-lg bg-sky-50 border border-sky-200 text-sky-800 px-3 py-2" data-testid="call-ga-test-mode">
                    Test mode (validate-only): conversions are validated with Google but not recorded.
                  </div>
                )}

                {selected.sale_status === 'sold' ? (
                  <div className="text-sm">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Sale value</span>
                      <span className="font-semibold text-slate-900" data-testid="call-detail-sale-value">
                        ${Number(selected.sale_value).toLocaleString()} {selected.sale_currency}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-slate-500">Conversion</span>
                      {convBadge(selected) && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${convBadge(selected).cls}`} data-testid="call-detail-conversion-status">
                          {convBadge(selected).txt}
                        </span>
                      )}
                    </div>
                    {selected.conversion_detail && (
                      <p className="text-xs text-slate-500 mt-1" data-testid="call-detail-conversion-detail">{selected.conversion_detail}</p>
                    )}
                    {editable && (
                      <Button
                        onClick={retryConversion}
                        disabled={marking}
                        variant="outline"
                        className="mt-3 w-full rounded-lg border-slate-200"
                        data-testid="call-retry-conversion-button"
                      >
                        <RotateCw className="h-4 w-4 mr-2" /> {marking ? 'Sending…' : 'Re-send conversion'}
                      </Button>
                    )}
                  </div>
                ) : editable ? (
                  <>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-slate-600">Revenue amount</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={saleAmount}
                          onChange={(e) => setSaleAmount(e.target.value)}
                          placeholder="250.00"
                          className="mt-1 h-10 rounded-lg border-slate-200"
                          data-testid="call-sale-amount-input"
                        />
                      </div>
                      <div className="w-20">
                        <Label className="text-xs text-slate-600">Currency</Label>
                        <Input
                          value={saleCurrency}
                          onChange={(e) => setSaleCurrency(e.target.value.toUpperCase())}
                          className="mt-1 h-10 rounded-lg border-slate-200"
                          data-testid="call-sale-currency-input"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={markSold}
                      disabled={marking}
                      className="mt-3 w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-70"
                      data-testid="call-mark-sold-button"
                    >
                      <Send className="h-4 w-4 mr-2" /> {marking ? 'Sending…' : 'Mark as Sold & Send to Google Ads'}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500" data-testid="call-revenue-readonly">
                    This call has not been marked as sold. View-only access cannot edit revenue.
                  </p>
                )}
              </div>

              {editable && (
                <Button
                  onClick={() => markRetained(!selected.retained)}
                  variant="outline"
                  className={`w-full rounded-lg ${selected.retained ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                  data-testid="call-retained-toggle"
                >
                  <Award className="h-4 w-4 mr-2" /> {selected.retained ? 'Retained client \u2713 (click to remove)' : 'Mark as Retained Client'}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Shared lead dialog for unified search (open a matching lead from the Calls tab) */}
      <LeadDetailDialog
        lead={openedLead}
        open={!!openedLead}
        onOpenChange={(o) => { if (!o) setOpenedLead(null); }}
        onChanged={() => load({ silent: true })}
      />
    </div>
  );
};
