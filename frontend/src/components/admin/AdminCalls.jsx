import React, { useEffect, useState, useCallback } from 'react';
import { Phone, RefreshCw, Trash2, PlayCircle, DollarSign, Send, RotateCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

const fmtDuration = (s) => {
  const n = Number(s) || 0;
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
  const editable = canEditFn();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/calls', { params: { start: range.start, end: range.end } });
      setCalls(res.data?.calls || []);
    } catch (e) {
      toast.error('Failed to load calls.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

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
      await api.post('/admin/calls/test');
      toast.success('Test call added.');
      load();
    } catch (e) {
      toast.error('Could not add test call.');
    }
  };

  return (
    <div className="grid gap-4" data-testid="admin-calls">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Phone className="h-4 w-4" /> Inbound calls from CallTrackingMetrics, with ad attribution &amp; revenue passback.
        </p>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          {editable && (
            <Button variant="outline" size="sm" onClick={addTestCall} className="rounded-xl border-slate-200" data-testid="calls-add-test">
              <Plus className="h-4 w-4 mr-2" /> Test call
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load} className="rounded-xl border-slate-200" data-testid="calls-refresh">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Caller</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="hidden md:table-cell">Campaign</TableHead>
              <TableHead className="hidden sm:table-cell">Revenue</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">Loading…</TableCell></TableRow>
            ) : calls.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10" data-testid="calls-empty">No calls in this period yet.</TableCell></TableRow>
            ) : calls.map((c) => (
              <TableRow key={c.id} data-testid={`call-row-${c.id}`}>
                <TableCell className="font-medium text-slate-900">{c.caller_name || '—'}</TableCell>
                <TableCell className="text-slate-700">{c.caller_number || '—'}</TableCell>
                <TableCell className="text-slate-700">{fmtDuration(c.duration)}</TableCell>
                <TableCell className="hidden md:table-cell text-slate-600">{c.campaign || '—'}</TableCell>
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
                <TableCell className="hidden lg:table-cell text-slate-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</TableCell>
                <TableCell className="text-slate-600 whitespace-nowrap">{fmtDate(c.called_at || c.created_at)}</TableCell>
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
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md" data-testid="admin-call-detail">
          <DialogHeader>
            <DialogTitle className="font-slab flex items-center gap-2">
              <Phone className="h-4 w-4" /> {selected?.caller_name || selected?.caller_number || 'Call'}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm">
                {[
                  ['Caller', selected.caller_name, 'call-detail-name'],
                  ['Number', selected.caller_number, 'call-detail-number'],
                  ['Tracking #', selected.tracking_number, 'call-detail-tracking'],
                  ['Duration', fmtDuration(selected.duration), 'call-detail-duration'],
                  ['Campaign', selected.campaign, 'call-detail-campaign'],
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

              {/* Revenue + Google Ads conversion */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50" data-testid="call-revenue-section">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-slate-900">Revenue &amp; Google Ads Conversion</span>
                </div>

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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
