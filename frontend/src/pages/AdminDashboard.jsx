import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, Users, Megaphone, BarChart3, Phone, Settings as SettingsIcon,
  DollarSign, Send, RotateCw, Crown, Shield, Eye, FlaskConical, Trash2, Languages, LayoutGrid, Filter,
  FileText, Percent, Sigma, Search, X, AlertTriangle, Award, SlidersHorizontal, Share2,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { api, TOKEN_KEY, clearSession, canEdit as canEditFn, getRole, getUsername } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logo } from '@/components/Logo';
import { useSortable, SortLabel } from '@/lib/useSortable';
import { useLivePoll, LiveBadge } from '@/lib/useLivePoll';
import { AdminHooks } from '@/components/admin/AdminHooks';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminCalls } from '@/components/admin/AdminCalls';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminSplitTest } from '@/components/admin/AdminSplitTest';
import { AdminSpanish } from '@/components/admin/AdminSpanish';
import { AdminPages } from '@/components/admin/AdminPages';
import { AdminFunnel } from '@/components/admin/AdminFunnel';
import { AdminRetained } from '@/components/admin/AdminRetained';
import { AdminChannels } from '@/components/admin/AdminChannels';
import { NetworkChips, getNetwork } from '@/lib/networks';
import { CallDetailDialog } from '@/components/admin/CallDetailDialog';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

// Toggleable Leads-table columns (Name & Actions always shown). Persisted per-browser.
const LEAD_COLS = [
  { key: 'phone', label: 'Phone' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'email', label: 'Email' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'location', label: 'Location' },
  { key: 'date', label: 'Date' },
];
const LEAD_COLS_KEY = 'lp_leads_cols_v1';
const loadLeadCols = () => {
  const def = { phone: true, vehicle: true, email: true, revenue: true, location: true, date: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(LEAD_COLS_KEY) || '{}') }; } catch { return def; }
};


function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

// Small status pill describing a sold lead's Google Ads conversion state.
function convBadge(lead) {
  if (lead.sale_status !== 'sold') return null;
  const s = lead.conversion_status;
  if (lead.conversion_uploaded) {
    return { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', txt: 'Sent' };
  }
  if (s === 'validated') {
    return { cls: 'bg-sky-50 text-sky-700 border border-sky-200', txt: 'Validated (test)' };
  }
  if (s === 'not_configured') {
    return { cls: 'bg-amber-50 text-amber-700 border border-amber-200', txt: 'Setup needed' };
  }
  if (s) {
    return { cls: 'bg-red-50 text-red-700 border border-red-200', txt: 'Failed' };
  }
  return { cls: 'bg-slate-100 text-slate-600', txt: 'Pending' };
}

const ROLE_META = {
  owner: { label: 'Owner', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Crown },
  editor: { label: 'Editor', cls: 'bg-sky-50 text-sky-700 border-sky-200', icon: Shield },
  view_only: { label: 'View Only', cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: Eye },
};

const RoleBadge = ({ role }) => {
  const m = ROLE_META[role] || ROLE_META.editor;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`} data-testid="admin-role-badge">
      <Icon className="h-3 w-3" />{m.label}
    </Badge>
  );
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const editable = canEditFn();
  const role = getRole();
  const username = getUsername();

  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [range, setRange] = useState(todayRange());
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gaStatus, setGaStatus] = useState(null);
  const [gaHealth, setGaHealth] = useState(null);
  const [gaBannerDismissed, setGaBannerDismissed] = useState(false);
  const [saleAmount, setSaleAmount] = useState('');
  const [saleCurrency, setSaleCurrency] = useState('USD');
  const [marking, setMarking] = useState(false);
  const [creatingTest, setCreatingTest] = useState(false);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [matchedCalls, setMatchedCalls] = useState([]);
  const [openedCall, setOpenedCall] = useState(null);
  const [leadSeg, setLeadSeg] = useState('all');
  const [leadCampaign, setLeadCampaign] = useState('all');
  const [leadNetwork, setLeadNetwork] = useState('all');
  const [leadCols, setLeadCols] = useState(loadLeadCols);
  useEffect(() => { try { localStorage.setItem(LEAD_COLS_KEY, JSON.stringify(leadCols)); } catch { /* ignore */ } }, [leadCols]);
  const toggleLeadCol = (k) => setLeadCols((p) => ({ ...p, [k]: !p[k] }));
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('admin_active_tab');
    return saved === 'pacontent' ? 'pages' : (saved || 'hooks');
  });

  const onTabChange = useCallback((v) => {
    setActiveTab(v);
    localStorage.setItem('admin_active_tab', v);
  }, []);

  const { sorted: sortedLeads, sortKey, sortDir, toggle } = useSortable(leads, 'created_at', 'desc');

  // Source-page segmentation for the Leads table. Spanish = sp + Spanish PA;
  // PA = English PA + Spanish PA. The ad-landing flows each get their own chip.
  const inLeadSeg = (seg, sp) => {
    const s = (sp || '').toLowerCase();
    if (seg === 'home') return s === 'home';
    if (seg === 'spanish') return s === 'sp' || s === 'laspa';
    if (seg === 'pa') return s === 'lapa' || s === 'laspa';
    if (seg === 'ladg') return s === 'ladg';
    if (seg === 'ladgs') return s === 'ladgs';
    if (seg === 'latm') return s === 'latm';
    if (seg === 'latm2') return s === 'latm2';
    return true;
  };
  // Chip definitions (order shown left→right). Label doubles as the empty-state noun.
  const LEAD_SEGMENTS = [
    { key: 'all', label: 'All' },
    { key: 'home', label: 'Home' },
    { key: 'spanish', label: 'Spanish' },
    { key: 'pa', label: 'PA Page' },
    { key: 'ladg', label: 'Demand Gen' },
    { key: 'ladgs', label: 'Demand Gen ES' },
    { key: 'latm', label: 'Team /tm' },
    { key: 'latm2', label: 'Team /tm2' },
  ];
  const leadCounts = LEAD_SEGMENTS.reduce((acc, seg) => {
    acc[seg.key] = seg.key === 'all' ? leads.length : leads.filter((l) => inLeadSeg(seg.key, l.source_page)).length;
    return acc;
  }, {});
  const activeSegLabel = (LEAD_SEGMENTS.find((s) => s.key === leadSeg) || {}).label || 'matching';
  // Campaign key + label for a lead (real Google Ads name when synced).
  const leadCampaignKey = (l) => (l.campaign_id || l.campaign_name || '').trim() || '__none__';
  const leadCampaignLabel = (l) => (l.campaign_name || l.campaign_id || '').trim() || 'Direct / Untracked';
  // Leads in the active source segment (before the campaign sub-filter).
  const segLeads = sortedLeads.filter((l) => inLeadSeg(leadSeg, l.source_page));
  // Distinct campaigns present in the current segment, with counts, sorted by volume.
  const leadCampaignOptions = (() => {
    const map = new Map();
    segLeads.forEach((l) => {
      const key = leadCampaignKey(l);
      const cur = map.get(key) || { key, label: leadCampaignLabel(l), count: 0 };
      cur.count += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  })();
  const shownLeads = segLeads.filter(
    (l) => (leadCampaign === 'all' || leadCampaignKey(l) === leadCampaign)
      && (leadNetwork === 'all' || getNetwork(l) === leadNetwork),
  );
  // Switching source segment resets the campaign sub-filter (campaigns differ per source).
  const selectLeadSeg = (key) => { setLeadSeg(key); setLeadCampaign('all'); };

  const logout = useCallback(() => {
    clearSession();
    navigate('/admin');
  }, [navigate]);

  const loadLeads = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const q = debouncedSearch.trim();
      const params = q ? { search: q } : { start: range.start, end: range.end };
      const res = await api.get('/admin/leads', { params });
      setLeads(res.data.leads);
      setTotal(res.data.total);
      // When searching, also surface matching CALLS so leads + calls are
      // searchable together from one bar.
      if (q) {
        try {
          const cr = await api.get('/admin/calls', { params: { search: q } });
          setMatchedCalls(cr.data.calls || []);
        } catch (e) { setMatchedCalls([]); }
      } else {
        setMatchedCalls([]);
      }
    } catch (e) {
      if (e?.response?.status === 401) {
        logout();
      } else if (!silent) {
        toast.error('Failed to load leads.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [range, logout, debouncedSearch]);

  const loadGaStatus = useCallback(async () => {
    try {
      const g = await api.get('/admin/google-ads/status');
      setGaStatus(g.data);
    } catch (e) { /* non-blocking */ }
  }, []);

  const loadGaHealth = useCallback(async (force = false) => {
    try {
      const g = await api.get(`/admin/google-ads/health${force ? '?force=true' : ''}`);
      setGaHealth(g.data);
      return g.data;
    } catch (e) { /* non-blocking */ }
  }, []);

  const [gaRechecking, setGaRechecking] = useState(false);
  const recheckGa = async () => {
    setGaRechecking(true);
    const res = await loadGaHealth(true);
    setGaRechecking(false);
    if (res && res.connected) {
      setGaBannerDismissed(true);
      toast.success('Google Ads is connected.');
    } else {
      toast.error('Still disconnected — production OAuth token/credentials need updating.');
    }
  };

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/stats', { params: { start: range.start, end: range.end } });
      setStats(res.data);
    } catch (e) { /* non-blocking */ }
  }, [range]);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  useEffect(() => { loadGaStatus(); }, [loadGaStatus]);
  useEffect(() => { loadGaHealth(); }, [loadGaHealth]);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Live auto-refresh: silently pull new leads + stats every 30s while the
  // Leads tab is open and the browser tab is visible.
  useLivePoll(
    () => { loadLeads({ silent: true }); loadStats(); },
    { intervalMs: 30000, enabled: activeTab === 'leads' },
  );

  // Keep the top tab counts (Calls / Retained) fresh while those tabs are open,
  // so the numbers update live without a browser refresh.
  useLivePoll(
    () => { loadStats(); },
    { intervalMs: 30000, enabled: activeTab === 'calls' || activeTab === 'retained' },
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const openLead = (lead) => {
    setSelected(lead);
    setSaleAmount(lead.sale_value != null ? String(lead.sale_value) : '');
    setSaleCurrency(lead.sale_currency || 'USD');
  };

  const reportConversion = (conv) => {
    if (!conv) return;
    if (conv.ok) {
      toast.success(conv.validate_only
        ? 'Marked sold. Conversion VALIDATED (test mode — not recorded).'
        : 'Marked sold & conversion sent to Google Ads.');
    } else if (conv.status === 'not_configured') {
      toast.warning('Saved as sold. Google Ads not connected yet — it will upload once credentials are added.');
    } else {
      toast.warning(`Saved as sold, but conversion failed: ${conv.detail || conv.status}`);
    }
  };

  const markSold = async () => {
    const amt = parseFloat(saleAmount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid revenue amount.');
      return;
    }
    setMarking(true);
    try {
      const res = await api.post(`/admin/leads/${selected.id}/sold`, {
        value: amt,
        currency: saleCurrency || 'USD',
      });
      reportConversion(res.data.conversion);
      setSelected((prev) => (prev ? { ...prev, ...res.data } : prev));
      await loadLeads();
    } catch (e) {
      toast.error('Could not mark as sold.');
    } finally {
      setMarking(false);
    }
  };

  const markRetained = async (retained) => {
    if (!selected) return;
    try {
      await api.post(`/admin/leads/${selected.id}/retained`, { retained });
      setSelected((prev) => (prev ? { ...prev, retained, retained_at: retained ? new Date().toISOString() : null } : prev));
      toast.success(retained ? 'Marked as retained client' : 'Removed from retained');
      await loadLeads();
    } catch (e) {
      toast.error('Could not update retained status.');
    }
  };

  const retryConversion = async () => {
    setMarking(true);
    try {
      const res = await api.post(`/admin/leads/${selected.id}/conversion/retry`);
      reportConversion(res.data.conversion);
      setSelected((prev) => (prev ? {
        ...prev,
        conversion_status: res.data.conversion.status,
        conversion_uploaded: res.data.conversion.ok && !res.data.conversion.validate_only,
        conversion_detail: res.data.conversion.detail,
      } : prev));
      await loadLeads();
    } catch (e) {
      toast.error('Retry failed.');
    } finally {
      setMarking(false);
    }
  };

  const createTestLead = async () => {
    setCreatingTest(true);
    try {
      await api.post('/admin/leads/test');
      toast.success('Test lead created.');
      await loadLeads();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not create test lead.');
    } finally {
      setCreatingTest(false);
    }
  };

  const deleteLead = async (lead) => {
    if (!lead) return;
    if (!window.confirm(`Delete lead "${lead.full_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/leads/${lead.id}`);
      toast.success('Lead deleted.');
      setSelected(null);
      await loadLeads();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not delete lead.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="page-admin-dashboard">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="font-slab font-bold text-slate-900 hidden sm:inline border-l border-slate-200 pl-3">Admin Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-slate-500" data-testid="admin-username">{username}</span>
          <RoleBadge role={role} />
          <Button
            variant="outline"
            onClick={logout}
            className="rounded-xl border-slate-200"
            data-testid="admin-logout-button"
          >
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {gaHealth && gaHealth.connected === false && gaHealth.configured === true && !gaBannerDismissed && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3" data-testid="ga-disconnect-banner">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-amber-900">
              <span className="font-semibold">Google Ads is disconnected.</span>{' '}
              Conversion uploads and live campaign-name syncing are paused. Reconnect by refreshing the Google Ads OAuth token in the backend, then redeploy. Your leads &amp; calls are still being captured normally.
            </div>
            <button
              onClick={recheckGa}
              disabled={gaRechecking}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-white transition-colors disabled:opacity-60"
              data-testid="ga-disconnect-banner-recheck"
            >
              <RotateCw className={`h-3.5 w-3.5 ${gaRechecking ? 'animate-spin' : ''}`} /> {gaRechecking ? 'Checking…' : 'Re-check'}
            </button>
            <button
              onClick={() => setGaBannerDismissed(true)}
              className="text-amber-500 hover:text-amber-800 transition-colors shrink-0"
              data-testid="ga-disconnect-banner-dismiss"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="mb-6 flex-wrap h-auto">
            <TabsTrigger value="hooks" data-testid="admin-tab-hooks"><Megaphone className="h-4 w-4 mr-2" /> Hooks</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="admin-tab-analytics"><BarChart3 className="h-4 w-4 mr-2" /> Analytics</TabsTrigger>
            <TabsTrigger value="funnel" data-testid="admin-tab-funnel"><Filter className="h-4 w-4 mr-2" /> Funnel Analytics</TabsTrigger>
            <TabsTrigger value="split" data-testid="admin-tab-split"><FlaskConical className="h-4 w-4 mr-2" /> Split Test</TabsTrigger>
            <TabsTrigger value="spanish" data-testid="admin-tab-spanish"><Languages className="h-4 w-4 mr-2" /> Spanish</TabsTrigger>
            <TabsTrigger value="pages" data-testid="admin-tab-pages"><LayoutGrid className="h-4 w-4 mr-2" /> Pages</TabsTrigger>
            <TabsTrigger value="calls" data-testid="admin-tab-calls"><Phone className="h-4 w-4 mr-2" /> Calls ({stats?.unique_callers ?? stats?.total_calls ?? 0})</TabsTrigger>
            <TabsTrigger value="leads" data-testid="admin-tab-leads"><Users className="h-4 w-4 mr-2" /> Leads ({total})</TabsTrigger>
            <TabsTrigger value="retained" data-testid="admin-tab-retained"><Award className="h-4 w-4 mr-2" /> Retained ({stats?.total_retained ?? 0})</TabsTrigger>
            <TabsTrigger value="channels" data-testid="admin-tab-channels"><Share2 className="h-4 w-4 mr-2" /> Channels</TabsTrigger>
            <TabsTrigger value="settings" data-testid="admin-tab-settings"><SettingsIcon className="h-4 w-4 mr-2" /> Settings</TabsTrigger>
          </TabsList>

          {/* HOOKS */}
          <TabsContent value="hooks">
            <AdminHooks canEdit={editable} />
          </TabsContent>

          {/* METRICS tab removed — admin now shows only real data */}

          {/* ANALYTICS */}
          <TabsContent value="analytics">
            <AdminAnalytics />
          </TabsContent>

          {/* FUNNEL */}
          <TabsContent value="funnel">
            <AdminFunnel />
          </TabsContent>

          {/* SPLIT TEST */}
          <TabsContent value="split">
            <AdminSplitTest />
          </TabsContent>

          {/* SPANISH */}
          <TabsContent value="spanish">
            <AdminSpanish />
          </TabsContent>

          {/* PAGES */}
          <TabsContent value="pages">
            <AdminPages />
          </TabsContent>

          {/* CALLS */}
          <TabsContent value="calls">
            <AdminCalls />
          </TabsContent>

          {/* LEADS */}
          <TabsContent value="leads">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Users className="h-4 w-4" /> {debouncedSearch.trim() ? `Search results for "${debouncedSearch.trim()}" — leads & calls` : 'Leads submitted in the selected range.'}
                {!debouncedSearch.trim() && <LiveBadge />}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search leads & calls…"
                    className="h-10 w-56 rounded-xl border-slate-200 pl-9 pr-8"
                    data-testid="lead-search-input"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      data-testid="lead-search-clear"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <DateRangeFilter value={range} onChange={setRange} />
                {editable && (
                  <Button
                    onClick={createTestLead}
                    disabled={creatingTest}
                    variant="outline"
                    className="h-10 rounded-xl border-slate-200"
                    data-testid="admin-create-test-lead-button"
                  >
                    <FlaskConical className="h-4 w-4 mr-2" /> {creatingTest ? 'Creating…' : 'Submit Test Lead'}
                  </Button>
                )}
              </div>
            </div>

            {/* Calls vs Form Leads summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" data-testid="admin-stats-summary">
              {[
                { key: 'form-leads', label: 'Form Leads', value: stats?.total_leads ?? 0, icon: FileText, cls: 'text-blue-600', bg: 'bg-blue-50' },
                { key: 'calls', label: 'Phone Calls', value: stats?.total_calls ?? 0, icon: Phone, cls: 'text-emerald-600', bg: 'bg-emerald-50' },
                { key: 'total-leads', label: 'Total Leads', value: (stats?.total_leads ?? 0) + (stats?.total_calls ?? 0), icon: Sigma, cls: 'text-slate-900', bg: 'bg-slate-100' },
                { key: 'conv-rate', label: 'Form Conv. Rate', value: `${stats?.conversion_rate ?? 0}%`, icon: Percent, cls: 'text-amber-600', bg: 'bg-amber-50' },
              ].map((s) => (
                <div key={s.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3" data-testid={`stat-card-${s.key}`}>
                  <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                    <s.icon className={`h-5 w-5 ${s.cls}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 truncate">{s.label}</div>
                    <div className={`text-xl font-bold ${s.cls}`} data-testid={`stat-value-${s.key}`}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Source segment filters + per-segment counters */}
            <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
              <div className="flex items-center gap-2 flex-wrap" data-testid="lead-segment-filters">
                {LEAD_SEGMENTS.map((seg) => (
                  <button
                    key={seg.key}
                    onClick={() => selectLeadSeg(seg.key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${leadSeg === seg.key ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                    data-testid={`lead-seg-${seg.key}`}
                  >
                    {seg.label}
                    <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${leadSeg === seg.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`} data-testid={`lead-seg-count-${seg.key}`}>{leadCounts[seg.key] ?? 0}</span>
                  </button>
                ))}
                {/* Secondary filter: campaign within the selected source segment */}
                <Select value={leadCampaign} onValueChange={setLeadCampaign}>
                  <SelectTrigger className="h-9 w-auto min-w-[200px] rounded-full border-slate-200 bg-white text-sm font-semibold text-slate-600" data-testid="lead-campaign-filter">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                    <SelectValue placeholder="All campaigns" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all" data-testid="lead-campaign-opt-all">All campaigns ({segLeads.length})</SelectItem>
                    {leadCampaignOptions.map((c) => (
                      <SelectItem key={c.key} value={c.key} data-testid={`lead-campaign-opt-${c.key}`}>
                        {c.label} ({c.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-slate-300" data-testid="leads-columns-button">
                    <SlidersHorizontal className="h-4 w-4" /> Columns
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {LEAD_COLS.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={!!leadCols[col.key]}
                      onCheckedChange={() => toggleLeadCol(col.key)}
                      onSelect={(e) => e.preventDefault()}
                      data-testid={`leads-col-toggle-${col.key}`}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Network filter (mockup) — separate a lead by traffic source */}
            <div className="mb-4 -mt-1">
              <NetworkChips items={segLeads} value={leadNetwork} onChange={setLeadNetwork} testidPrefix="lead-network" />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-slate-500" data-testid="admin-leads-loading">Loading leads…</div>
              ) : leads.length === 0 ? (
                <div className="p-12 text-center text-slate-500" data-testid="admin-leads-empty">
                  No leads in this date range. Adjust the date filter or submit a test lead.
                </div>
              ) : shownLeads.length === 0 ? (
                <div className="p-12 text-center text-slate-500" data-testid="admin-leads-seg-empty">
                  No {activeSegLabel} leads in this range.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="admin-leads-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead><SortLabel label="Name" k="full_name" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        {leadCols.phone && <TableHead><SortLabel label="Phone" k="phone" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
                        {leadCols.vehicle && <TableHead className="hidden md:table-cell"><SortLabel label="Vehicle" k="car_make" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
                        {leadCols.email && <TableHead className="hidden md:table-cell"><SortLabel label="Email" k="email" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
                        {leadCols.revenue && <TableHead className="hidden sm:table-cell"><SortLabel label="Revenue" k="sale_value" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
                        {leadCols.location && <TableHead className="hidden lg:table-cell"><SortLabel label="Location" k="city" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
                        {leadCols.date && <TableHead className="hidden sm:table-cell"><SortLabel label="Date" k="created_at" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>}
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shownLeads.map((lead) => (
                        <TableRow key={lead.id} data-testid={`admin-lead-row-${lead.id}`}>
                          <TableCell className="font-medium text-slate-900">
                            {lead.qb_name || lead.full_name}
                            {lead.is_test && (
                              <Badge variant="outline" className="ml-2 bg-slate-100 text-slate-500 border-slate-200 text-[10px]">test</Badge>
                            )}
                            {lead.source_page === 'lapa' && (
                              <Badge variant="outline" className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]" data-testid={`lead-source-${lead.id}`}>PA page</Badge>
                            )}
                            {lead.source_page === 'sp' && (
                              <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px]" data-testid={`lead-source-sp-${lead.id}`}>Spanish</Badge>
                            )}
                            {lead.source_page === 'laspa' && (
                              <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px]" data-testid={`lead-source-laspa-${lead.id}`}>Spanish · PA</Badge>
                            )}
                            {lead.crm_duplicate_skipped && (
                              <Badge variant="outline" className="ml-2 bg-rose-50 text-rose-700 border-rose-200 text-[10px]" data-testid={`lead-crm-dup-${lead.id}`}>Duplicate · not sent to CRM</Badge>
                            )}
                            {lead.retained && (
                              <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px]" data-testid={`lead-retained-badge-${lead.id}`}>Retained</Badge>
                            )}
                          </TableCell>
                          {leadCols.phone && <TableCell className="text-slate-600">{formatPhone(lead.phone)}</TableCell>}
                          {leadCols.vehicle && <TableCell className="hidden md:table-cell text-slate-600">{[lead.car_year, lead.car_make, lead.car_model].filter(Boolean).join(' ') || '\u2014'}</TableCell>}
                          {leadCols.email && <TableCell className="hidden md:table-cell text-slate-600 break-all">{lead.email}</TableCell>}
                          {leadCols.revenue && (
                          <TableCell className="hidden sm:table-cell">
                            {lead.sale_status === 'sold' ? (
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-slate-900" data-testid={`lead-revenue-${lead.id}`}>
                                  ${Number(lead.sale_value).toLocaleString()}
                                </span>
                                {convBadge(lead) && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full w-fit ${convBadge(lead).cls}`} data-testid={`lead-conv-badge-${lead.id}`}>
                                    {convBadge(lead).txt}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">{'\u2014'}</span>
                            )}
                          </TableCell>
                          )}
                          {leadCols.location && <TableCell className="hidden lg:table-cell text-slate-600">{lead.city}, {lead.state}</TableCell>}
                          {leadCols.date && <TableCell className="hidden sm:table-cell text-slate-500 text-sm">{fmtDate(lead.created_at)}</TableCell>}
                          <TableCell>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg border-slate-200"
                                onClick={() => openLead(lead)}
                                data-testid={`admin-lead-open-${lead.id}`}
                              >
                                View
                              </Button>
                              {editable && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
                                  onClick={() => deleteLead(lead)}
                                  data-testid={`admin-lead-delete-${lead.id}`}
                                  title="Delete lead"
                                >
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
              )}
            </div>

            {/* Matching CALLS — surfaced when searching so leads + calls are searchable together */}
            {debouncedSearch.trim() && (
              <div className="mt-6" data-testid="lead-search-matched-calls">
                <p className="text-sm text-slate-500 flex items-center gap-2 mb-3">
                  <Phone className="h-4 w-4" /> Matching calls ({matchedCalls.length})
                </p>
                {matchedCalls.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                    No calls match "{debouncedSearch.trim()}".
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table data-testid="admin-matched-calls-table">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Caller</TableHead>
                            <TableHead>Number</TableHead>
                            <TableHead className="hidden sm:table-cell">Duration</TableHead>
                            <TableHead className="hidden md:table-cell">Campaign</TableHead>
                            <TableHead className="hidden sm:table-cell">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {matchedCalls.map((c) => (
                            <TableRow key={c.id} data-testid={`matched-call-row-${c.id}`} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenedCall(c)}>
                              <TableCell className="font-medium text-slate-900">
                                {c.qb_name || c.caller_name || '\u2014'}
                                <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">call</Badge>
                                {c.retained && <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Retained</Badge>}
                              </TableCell>
                              <TableCell className="text-slate-600">{formatPhone(c.caller_number) || '\u2014'}</TableCell>
                              <TableCell className="hidden sm:table-cell text-slate-600">{c.duration ? `${c.duration}s` : '\u2014'}</TableCell>
                              <TableCell className="hidden md:table-cell text-slate-600">{c.campaign || '\u2014'}</TableCell>
                              <TableCell className="hidden sm:table-cell text-slate-500 text-sm">{fmtDate(c.created_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* RETAINED */}
          <TabsContent value="retained">
            <AdminRetained />
          </TabsContent>

          {/* CHANNELS (mockup) */}
          <TabsContent value="channels">
            <AdminChannels />
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings">
            <AdminSettings canEdit={editable} />
          </TabsContent>
        </Tabs>
      </main>

      {/* LEAD DETAIL DIALOG */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md" data-testid="admin-lead-detail">
          <DialogHeader>
            <DialogTitle className="font-slab">{selected?.qb_name || selected?.full_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm">
                {[
                  ['Vehicle Year', selected.car_year, 'lead-detail-car-year'],
                  ['Vehicle Make', selected.car_make, 'lead-detail-car-make'],
                  ['Vehicle Model', selected.car_model, 'lead-detail-car-model'],
                  ['Phone', formatPhone(selected.phone), 'lead-detail-phone'],
                  ['Email', selected.email, 'lead-detail-email'],
                  ['Source', ({ lapa: 'PA page (lapa)', laspa: 'Spanish PA (laspa)', sp: 'Spanish Landing (sp)', ladg: 'Demand Gen (ladg)', ladgs: 'Spanish Demand Gen (ladgs)', latm: 'Team Attorneys — Overlay (latm)', latm2: 'Team Attorneys — Split (latm2)', dg: 'Demand Gen (dg)', dgs: 'Spanish Demand Gen (dgs)', tm: 'Team Attorneys — Overlay (tm)', tm2: 'Team Attorneys — Split (tm2)' }[selected.source_page]) || (selected.source_page || 'home'), 'lead-detail-source'],
                  ['Campaign', selected.campaign_name || selected.campaign_id, 'lead-detail-campaign'],
                  ['Ad Group', selected.adgroup_name || selected.adgroup_id, 'lead-detail-adgroup'],
                  ['Ad', selected.ad_name || selected.ad_id, 'lead-detail-ad'],
                  ['Keyword', selected.keyword, 'lead-detail-keyword'],
                  ['GCLID', selected.gclid, 'lead-detail-gclid'],
                  ['IP Address', selected.ip, 'lead-detail-ip'],
                  ['Submitted', fmtDate(selected.created_at), 'lead-detail-date'],
                ].map(([label, value, tid]) => (
                  <div key={tid} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-900 font-medium text-right break-all" data-testid={tid}>{value || '\u2014'}</span>
                  </div>
                ))}
              </div>

              {/* Revenue + Google Ads conversion */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50" data-testid="lead-revenue-section">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-slate-900">Revenue &amp; Google Ads Conversion</span>
                </div>

                {gaStatus && !gaStatus.configured && (
                  <div className="mb-3 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2" data-testid="ga-banner-not-configured">
                    Google Ads isn&apos;t connected yet. Sales are saved now, and conversions upload automatically once credentials are added.
                  </div>
                )}
                {gaStatus && gaStatus.configured && gaStatus.validate_only && (
                  <div className="mb-3 text-xs rounded-lg bg-sky-50 border border-sky-200 text-sky-800 px-3 py-2" data-testid="ga-banner-test-mode">
                    Test mode (validate-only): conversions are validated with Google but not recorded. Set GOOGLE_ADS_VALIDATE_ONLY=false to go live.
                  </div>
                )}

                {selected.sale_status === 'sold' ? (
                  <div className="text-sm">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Sale value</span>
                      <span className="font-semibold text-slate-900" data-testid="lead-detail-sale-value">
                        ${Number(selected.sale_value).toLocaleString()} {selected.sale_currency}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-slate-500">Conversion</span>
                      {convBadge(selected) && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${convBadge(selected).cls}`} data-testid="lead-detail-conversion-status">
                          {convBadge(selected).txt}
                        </span>
                      )}
                    </div>
                    {selected.conversion_detail && (
                      <p className="text-xs text-slate-500 mt-1" data-testid="lead-detail-conversion-detail">{selected.conversion_detail}</p>
                    )}
                    {editable && (
                      <Button
                        onClick={retryConversion}
                        disabled={marking}
                        variant="outline"
                        className="mt-3 w-full rounded-lg border-slate-200"
                        data-testid="lead-retry-conversion-button"
                      >
                        <RotateCw className="h-4 w-4 mr-2" /> {marking ? 'Sending\u2026' : 'Re-send conversion'}
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
                          data-testid="lead-sale-amount-input"
                        />
                      </div>
                      <div className="w-20">
                        <Label className="text-xs text-slate-600">Currency</Label>
                        <Input
                          value={saleCurrency}
                          onChange={(e) => setSaleCurrency(e.target.value.toUpperCase())}
                          className="mt-1 h-10 rounded-lg border-slate-200"
                          data-testid="lead-sale-currency-input"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={markSold}
                      disabled={marking}
                      className="mt-3 w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-70"
                      data-testid="lead-mark-sold-button"
                    >
                      <Send className="h-4 w-4 mr-2" /> {marking ? 'Sending\u2026' : 'Mark as Sold & Send to Google Ads'}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500" data-testid="lead-revenue-readonly">
                    This lead has not been marked as sold. View-only access cannot edit revenue.
                  </p>
                )}
              </div>

              {editable && (
                <Button
                  onClick={() => markRetained(!selected.retained)}
                  variant="outline"
                  className={`w-full rounded-lg ${selected.retained ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                  data-testid="lead-retained-toggle"
                >
                  <Award className="h-4 w-4 mr-2" /> {selected.retained ? 'Retained client \u2713 (click to remove)' : 'Mark as Retained Client'}
                </Button>
              )}

              {editable && (
                <Button
                  onClick={() => deleteLead(selected)}
                  variant="outline"
                  className="w-full rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  data-testid="lead-delete-button"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Lead
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Shared call dialog for unified search (open a matching call from the Leads tab) */}
      <CallDetailDialog
        call={openedCall}
        open={!!openedCall}
        onOpenChange={(o) => { if (!o) setOpenedCall(null); }}
        onChanged={() => loadLeads({ silent: true })}
      />
    </div>
  );
}
