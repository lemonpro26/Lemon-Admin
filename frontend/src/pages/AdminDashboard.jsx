import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, Users, Megaphone, BarChart3, Phone, Settings as SettingsIcon,
  DollarSign, Send, RotateCw, Crown, Shield, Eye, FlaskConical, Trash2,
  FileText, Percent, Sigma, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, TOKEN_KEY, clearSession, canEdit as canEditFn, getRole, getUsername } from '@/lib/api';
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
import { Logo } from '@/components/Logo';
import { useSortable, SortLabel } from '@/lib/useSortable';
import { AdminHooks } from '@/components/admin/AdminHooks';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminCalls } from '@/components/admin/AdminCalls';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminSplitTest } from '@/components/admin/AdminSplitTest';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

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
  const [saleAmount, setSaleAmount] = useState('');
  const [saleCurrency, setSaleCurrency] = useState('USD');
  const [marking, setMarking] = useState(false);
  const [creatingTest, setCreatingTest] = useState(false);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { sorted: sortedLeads, sortKey, sortDir, toggle } = useSortable(leads, 'created_at', 'desc');

  const logout = useCallback(() => {
    clearSession();
    navigate('/admin');
  }, [navigate]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = debouncedSearch.trim()
        ? { search: debouncedSearch.trim() }
        : { start: range.start, end: range.end };
      const res = await api.get('/admin/leads', { params });
      setLeads(res.data.leads);
      setTotal(res.data.total);
    } catch (e) {
      if (e?.response?.status === 401) {
        logout();
      } else {
        toast.error('Failed to load leads.');
      }
    } finally {
      setLoading(false);
    }
  }, [range, logout, debouncedSearch]);

  const loadGaStatus = useCallback(async () => {
    try {
      const g = await api.get('/admin/google-ads/status');
      setGaStatus(g.data);
    } catch (e) { /* non-blocking */ }
  }, []);

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
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { loadStats(); }, [loadStats]);

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
        <Tabs defaultValue="hooks">
          <TabsList className="mb-6 flex-wrap h-auto">
            <TabsTrigger value="hooks" data-testid="admin-tab-hooks"><Megaphone className="h-4 w-4 mr-2" /> Hooks</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="admin-tab-analytics"><BarChart3 className="h-4 w-4 mr-2" /> Analytics</TabsTrigger>
            <TabsTrigger value="split" data-testid="admin-tab-split"><FlaskConical className="h-4 w-4 mr-2" /> Split Test</TabsTrigger>
            <TabsTrigger value="calls" data-testid="admin-tab-calls"><Phone className="h-4 w-4 mr-2" /> Calls ({stats?.total_calls ?? 0})</TabsTrigger>
            <TabsTrigger value="leads" data-testid="admin-tab-leads"><Users className="h-4 w-4 mr-2" /> Leads ({total})</TabsTrigger>
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

          {/* SPLIT TEST */}
          <TabsContent value="split">
            <AdminSplitTest />
          </TabsContent>

          {/* CALLS */}
          <TabsContent value="calls">
            <AdminCalls />
          </TabsContent>

          {/* LEADS */}
          <TabsContent value="leads">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Users className="h-4 w-4" /> {debouncedSearch.trim() ? `Search results for "${debouncedSearch.trim()}"` : 'Leads submitted in the selected range.'}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or phone…"
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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-slate-500" data-testid="admin-leads-loading">Loading leads…</div>
              ) : leads.length === 0 ? (
                <div className="p-12 text-center text-slate-500" data-testid="admin-leads-empty">
                  No leads in this date range. Adjust the date filter or submit a test lead.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="admin-leads-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead><SortLabel label="Name" k="full_name" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        <TableHead><SortLabel label="Phone" k="phone" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        <TableHead className="hidden md:table-cell"><SortLabel label="Vehicle" k="car_make" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        <TableHead className="hidden md:table-cell"><SortLabel label="Email" k="email" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        <TableHead className="hidden sm:table-cell"><SortLabel label="Revenue" k="sale_value" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        <TableHead className="hidden lg:table-cell"><SortLabel label="Location" k="city" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        <TableHead className="hidden sm:table-cell"><SortLabel label="Date" k="created_at" sortKey={sortKey} sortDir={sortDir} onClick={toggle} /></TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLeads.map((lead) => (
                        <TableRow key={lead.id} data-testid={`admin-lead-row-${lead.id}`}>
                          <TableCell className="font-medium text-slate-900">
                            {lead.full_name}
                            {lead.is_test && (
                              <Badge variant="outline" className="ml-2 bg-slate-100 text-slate-500 border-slate-200 text-[10px]">test</Badge>
                            )}
                            {lead.source_page === 'lapa' && (
                              <Badge variant="outline" className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]" data-testid={`lead-source-${lead.id}`}>PA page</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-600">{lead.phone}</TableCell>
                          <TableCell className="hidden md:table-cell text-slate-600">{[lead.car_year, lead.car_make, lead.car_model].filter(Boolean).join(' ') || '\u2014'}</TableCell>
                          <TableCell className="hidden md:table-cell text-slate-600 break-all">{lead.email}</TableCell>
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
                          <TableCell className="hidden lg:table-cell text-slate-600">{lead.city}, {lead.state}</TableCell>
                          <TableCell className="hidden sm:table-cell text-slate-500 text-sm">{fmtDate(lead.created_at)}</TableCell>
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
            <DialogTitle className="font-slab">{selected?.full_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm">
                {[
                  ['Vehicle Year', selected.car_year, 'lead-detail-car-year'],
                  ['Vehicle Make', selected.car_make, 'lead-detail-car-make'],
                  ['Vehicle Model', selected.car_model, 'lead-detail-car-model'],
                  ['Phone', selected.phone, 'lead-detail-phone'],
                  ['Email', selected.email, 'lead-detail-email'],
                  ['Address', selected.address, 'lead-detail-address'],
                  ['Zip', selected.zip, 'lead-detail-zip'],
                  ['Location', `${selected.city}, ${selected.state}`, 'lead-detail-location'],
                  ['Source', selected.source_page === 'lapa' ? 'PA page (lapa)' : (selected.source_page || 'home'), 'lead-detail-source'],
                  ['Campaign ID', selected.campaign_id, 'lead-detail-campaign'],
                  ['Ad Group ID', selected.adgroup_id, 'lead-detail-adgroup'],
                  ['Ad ID', selected.ad_id, 'lead-detail-ad'],
                  ['Keyword', selected.keyword, 'lead-detail-keyword'],
                  ['GCLID', selected.gclid, 'lead-detail-gclid'],
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
    </div>
  );
}
