import React, { useState } from 'react';
import { AlertTriangle, Zap, DollarSign, Info, CheckCircle2, XCircle, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';

// A tiny two-column stat pill for the summary panel.
const Stat = ({ label, value, tone = 'default', testid }) => {
  const toneCls = {
    default: 'text-slate-900', good: 'text-emerald-600', bad: 'text-rose-600', warn: 'text-amber-600',
  }[tone] || 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3" data-testid={testid}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
};

const ResultCard = ({ title, data, per }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`bulk-result-${title.toLowerCase()}`}>
    <div className="flex items-center justify-between mb-3">
      <span className="font-slab font-bold text-slate-900">{title}</span>
      <span className="text-xs text-slate-500">@ ${per}/each</span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Matched" value={data.matched} testid={`bulk-${title.toLowerCase()}-matched`} />
      <Stat label="Updated" value={data.updated} tone="good" testid={`bulk-${title.toLowerCase()}-updated`} />
      <Stat label="Skipped (already sold)" value={data.skipped_existing} tone="warn" testid={`bulk-${title.toLowerCase()}-skipped`} />
      <Stat label="Uploaded to Google" value={data.uploaded} tone={data.uploaded ? 'good' : 'default'} testid={`bulk-${title.toLowerCase()}-uploaded`} />
      <Stat label="Missing gclid" value={data.missing_gclid} tone={data.missing_gclid ? 'warn' : 'default'} testid={`bulk-${title.toLowerCase()}-missing-gclid`} />
      <Stat label="Upload errors" value={data.upload_errors} tone={data.upload_errors ? 'bad' : 'default'} testid={`bulk-${title.toLowerCase()}-errors`} />
    </div>
  </div>
);

export const AdminBulkConversions = () => {
  const canEdit = canEditFn();
  const [leadValue, setLeadValue] = useState('1000');
  const [callValue, setCallValue] = useState('350');
  const [skipExisting, setSkipExisting] = useState(true);
  const [uploadToGoogle, setUploadToGoogle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const payload = () => ({
    lead_value: leadValue === '' ? null : Number(leadValue),
    call_value: callValue === '' ? null : Number(callValue),
    skip_existing: skipExisting,
    upload_to_google: uploadToGoogle,
    dry_run: false,
  });

  const runPreview = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await api.post('/admin/conversions/bulk-value', { ...payload(), dry_run: true });
      setPreview(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const runReal = async () => {
    setConfirmOpen(false);
    setBusy(true); setResult(null);
    const toastId = toast.loading(uploadToGoogle
      ? 'Backfilling values and uploading to Google Ads… (this can take a minute)'
      : 'Backfilling values…');
    try {
      const res = await api.post('/admin/conversions/bulk-value', payload());
      setResult(res.data);
      toast.success(
        `Done in ${(res.data.took_ms / 1000).toFixed(1)}s — ${res.data.leads.updated} leads & ${res.data.calls.updated} calls updated.`,
        { id: toastId },
      );
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Bulk assign failed.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const nothingChosen = leadValue === '' && callValue === '';

  return (
    <div className="grid gap-5" data-testid="admin-bulk-conversions">
      {/* Header + warning */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3" data-testid="bulk-warning">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 leading-relaxed">
          <p className="font-bold mb-1">One-time bulk backfill — think before you run this.</p>
          <p>Assigning a flat value to every existing lead/call will inflate your Google Ads ROAS
          and can mislead Smart Bidding. Google will optimize for anyone who submits a form,
          not paying clients. Only run this if you intentionally want to seed conversion data.
          <span className="block mt-1"><b>Idempotent:</b> Records already marked as sold are skipped when the checkbox below is on.</span></p>
        </div>
      </div>

      {/* Inputs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="bulk-inputs-card">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-indigo-600" />
          <span className="font-slab font-bold text-slate-900">Value per record</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Every lead</span>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={leadValue}
                onChange={(e) => setLeadValue(e.target.value)}
                placeholder="1000"
                disabled={!canEdit || busy}
                className="pl-7 h-11 text-lg font-semibold tabular-nums"
                data-testid="bulk-lead-value-input"
              />
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">Leave blank to skip leads.</span>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Every call</span>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={callValue}
                onChange={(e) => setCallValue(e.target.value)}
                placeholder="350"
                disabled={!canEdit || busy}
                className="pl-7 h-11 text-lg font-semibold tabular-nums"
                data-testid="bulk-call-value-input"
              />
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">Excludes test calls automatically.</span>
          </label>
        </div>

        <div className="mt-5 space-y-2.5">
          <label className="flex items-start gap-2.5 cursor-pointer select-none" data-testid="bulk-skip-existing">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(e) => setSkipExisting(e.target.checked)}
              disabled={!canEdit || busy}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0F1B3D]"
              data-testid="bulk-skip-existing-checkbox"
            />
            <span className="text-sm text-slate-700"><b>Skip records already marked as sold</b> (recommended — protects your retained-client revenue values).</span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer select-none" data-testid="bulk-upload-google">
            <input
              type="checkbox"
              checked={uploadToGoogle}
              onChange={(e) => setUploadToGoogle(e.target.checked)}
              disabled={!canEdit || busy}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0F1B3D]"
              data-testid="bulk-upload-google-checkbox"
            />
            <span className="text-sm text-slate-700"><b>Upload each as an offline conversion to Google Ads</b> (records missing a <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">gclid</code> will still be saved locally but Google will ignore them).</span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={runPreview}
            disabled={!canEdit || busy || nothingChosen}
            data-testid="bulk-preview-btn"
            className="gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Info className="h-4 w-4" />}
            Preview counts (dry-run)
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canEdit || busy || nothingChosen}
            className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
            data-testid="bulk-run-btn"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Run bulk backfill
          </Button>
          {!canEdit && <span className="text-xs text-slate-500">Read-only user — cannot run.</span>}
        </div>
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="bulk-preview-panel">
          <ResultCard title="Leads" data={preview.leads} per={leadValue || 0} />
          <ResultCard title="Calls" data={preview.calls} per={callValue || 0} />
          <p className="md:col-span-2 text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> This was a dry-run — nothing was changed and nothing was sent to Google.
          </p>
        </div>
      )}

      {/* Result panel */}
      {result && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="bulk-result-panel">
          <ResultCard title="Leads" data={result.leads} per={leadValue || 0} />
          <ResultCard title="Calls" data={result.calls} per={callValue || 0} />
          {result.error_count > 0 && (
            <div className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 p-4" data-testid="bulk-error-list">
              <div className="flex items-center gap-2 mb-2 text-rose-700 font-bold">
                <XCircle className="h-4 w-4" /> {result.error_count} error{result.error_count === 1 ? '' : 's'}
              </div>
              <ul className="text-xs text-rose-800 space-y-1 max-h-40 overflow-auto">
                {(result.errors || []).map((e, i) => <li key={i} className="font-mono">{e}</li>)}
              </ul>
            </div>
          )}
          {result.error_count === 0 && (
            <p className="md:col-span-2 text-sm text-emerald-700 flex items-center gap-1.5" data-testid="bulk-success-note">
              <CheckCircle2 className="h-4 w-4" /> Completed in {(result.took_ms / 1000).toFixed(1)}s with no upload errors.
            </p>
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="bulk-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" /> Confirm bulk backfill
            </DialogTitle>
            <DialogDescription>
              You are about to apply these values to every matching record in your database:
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            {leadValue !== '' && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Every lead →</span>
                <span className="font-bold text-slate-900">${Number(leadValue).toLocaleString()}</span>
              </div>
            )}
            {callValue !== '' && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Every call →</span>
                <span className="font-bold text-slate-900">${Number(callValue).toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Skip records already sold?</span>
              <span className="font-bold text-slate-900">{skipExisting ? 'Yes' : 'No — will overwrite'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Upload to Google Ads?</span>
              <span className={`font-bold ${uploadToGoogle ? 'text-rose-700' : 'text-slate-900'}`}>{uploadToGoogle ? 'Yes — sent as offline conversions' : 'No — local only'}</span>
            </div>
          </div>
          <p className="text-[12px] text-slate-500 mt-2">
            Tip: click <b>Preview counts</b> first to see the exact number of records that will be touched.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="bulk-confirm-cancel">Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={runReal} data-testid="bulk-confirm-run">
              Yes, run it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- CLEAR NON-RETAINED (reversal of bulk backfill) ---------- */}
      <ClearNonRetainedSection />
    </div>
  );
};


// Reverses the bulk backfill for records that never became clients. Retained
// clients keep their manually-entered revenue. Uses a separate confirm dialog
// with its own copy so users don't accidentally confuse this with the backfill.
const ClearNonRetainedSection = () => {
  const canEdit = canEditFn();
  const [includeLeads, setIncludeLeads] = useState(true);
  const [includeCalls, setIncludeCalls] = useState(true);
  const [retractFromGoogle, setRetractFromGoogle] = useState(true);
  const [onlyBulkBackfill, setOnlyBulkBackfill] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const payload = () => ({
    include_leads: includeLeads,
    include_calls: includeCalls,
    retract_from_google: retractFromGoogle,
    only_bulk_backfill: onlyBulkBackfill,
    dry_run: false,
  });

  const runPreview = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await api.post('/admin/conversions/clear-non-retained', { ...payload(), dry_run: true });
      setPreview(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const runReal = async () => {
    setConfirmOpen(false);
    setBusy(true); setResult(null);
    const toastId = toast.loading(retractFromGoogle
      ? 'Clearing values and retracting from Google Ads… (this can take a minute)'
      : 'Clearing values…');
    try {
      const res = await api.post('/admin/conversions/clear-non-retained', payload());
      setResult(res.data);
      toast.success(
        `Cleared ${res.data.leads.cleared} leads & ${res.data.calls.cleared} calls (retained kept: ${res.data.leads.skipped_retained}L / ${res.data.calls.skipped_retained}C).`,
        { id: toastId },
      );
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Clear failed.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 mt-8 pt-6 border-t-2 border-dashed border-slate-200" data-testid="admin-clear-non-retained">
      <div className="flex items-center gap-2">
        <Undo2 className="h-5 w-5 text-slate-500" />
        <h3 className="font-slab font-bold text-slate-900">Undo backfill — clear revenue for non-retained records</h3>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed" data-testid="clear-explainer">
        <p className="mb-1"><b>What this does:</b> for every lead &amp; call that is <b>NOT marked &quot;Retained&quot;</b>, this will:</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>Wipe the local <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">sale_value</code> / <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">sale_status</code> fields.</li>
          <li>Send a <b>RETRACTION</b> to Google Ads via the Data Manager API — the conversion is removed from reporting and Smart Bidding.</li>
          <li>Tag the record with <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">sale_source = &quot;backfill_cleared&quot;</code> so we know it was undone.</li>
        </ul>
        <p className="mt-2"><b>What stays untouched:</b> retained leads &amp; retained calls keep their revenue (both locally and in Google Ads).</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" data-testid="clear-inputs-card">
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={includeLeads} onChange={(e) => setIncludeLeads(e.target.checked)} disabled={!canEdit || busy}
                 className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0F1B3D]" data-testid="clear-include-leads" />
          <span className="text-sm text-slate-700"><b>Include leads</b> — clear revenue on all non-retained leads.</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={includeCalls} onChange={(e) => setIncludeCalls(e.target.checked)} disabled={!canEdit || busy}
                 className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0F1B3D]" data-testid="clear-include-calls" />
          <span className="text-sm text-slate-700"><b>Include calls</b> — clear revenue on all non-retained calls.</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={retractFromGoogle} onChange={(e) => setRetractFromGoogle(e.target.checked)} disabled={!canEdit || busy}
                 className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0F1B3D]" data-testid="clear-retract-google" />
          <span className="text-sm text-slate-700"><b>Retract from Google Ads</b> — recommended. Removes each conversion from Google Ads reporting &amp; Smart Bidding via Data Manager API.</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={onlyBulkBackfill} onChange={(e) => setOnlyBulkBackfill(e.target.checked)} disabled={!canEdit || busy}
                 className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0F1B3D]" data-testid="clear-only-bulk-backfill" />
          <span className="text-sm text-slate-700"><b>Only touch records tagged <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">bulk_backfill</code></b> — safest. Prevents wiping revenue that was entered manually per-lead by your team.</span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Button variant="outline" onClick={runPreview} disabled={!canEdit || busy || (!includeLeads && !includeCalls)}
                  data-testid="clear-preview-btn" className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Info className="h-4 w-4" />}
            Preview counts (dry-run)
          </Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={!canEdit || busy || (!includeLeads && !includeCalls)}
                  className="bg-slate-800 hover:bg-slate-900 text-white gap-1.5" data-testid="clear-run-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Run clear
          </Button>
        </div>
      </div>

      {(preview || result) && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="clear-panel">
          <ClearResultCard title="Leads" data={(result || preview).leads} />
          <ClearResultCard title="Calls" data={(result || preview).calls} />
          {(result && result.error_count > 0) && (
            <div className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 p-4" data-testid="clear-error-list">
              <div className="flex items-center gap-2 mb-2 text-rose-700 font-bold">
                <XCircle className="h-4 w-4" /> {result.error_count} error{result.error_count === 1 ? '' : 's'}
              </div>
              <ul className="text-xs text-rose-800 space-y-1 max-h-40 overflow-auto">
                {(result.errors || []).map((e, i) => <li key={i} className="font-mono">{e}</li>)}
              </ul>
            </div>
          )}
          {result && result.error_count === 0 && (
            <p className="md:col-span-2 text-sm text-emerald-700 flex items-center gap-1.5" data-testid="clear-success-note">
              <CheckCircle2 className="h-4 w-4" /> Completed in {(result.took_ms / 1000).toFixed(1)}s with no retraction errors.
            </p>
          )}
          {preview && !result && (
            <p className="md:col-span-2 text-xs text-slate-500 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> This was a dry-run — nothing was cleared and nothing was sent to Google.
            </p>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="clear-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Undo2 className="h-5 w-5 text-slate-600" /> Confirm clear
            </DialogTitle>
            <DialogDescription>
              You are about to reverse the bulk backfill for non-retained records.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Clear leads?</span>
              <span className="font-bold text-slate-900">{includeLeads ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Clear calls?</span>
              <span className="font-bold text-slate-900">{includeCalls ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Retract from Google Ads?</span>
              <span className={`font-bold ${retractFromGoogle ? 'text-rose-700' : 'text-slate-900'}`}>{retractFromGoogle ? 'Yes — retractions sent' : 'No — local only'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Only bulk_backfill records?</span>
              <span className="font-bold text-slate-900">{onlyBulkBackfill ? 'Yes (safest)' : 'No — will also clear manual entries'}</span>
            </div>
          </div>
          <p className="text-[12px] text-slate-500 mt-2">
            Retained records will be <b>skipped automatically</b> — their revenue stays intact.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="clear-confirm-cancel">Cancel</Button>
            <Button className="bg-slate-800 hover:bg-slate-900 text-white" onClick={runReal} data-testid="clear-confirm-run">
              Yes, clear now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ClearResultCard = ({ title, data }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`clear-result-${title.toLowerCase()}`}>
    <div className="font-slab font-bold text-slate-900 mb-3">{title}</div>
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Matched (non-retained)" value={data.matched} testid={`clear-${title.toLowerCase()}-matched`} />
      <Stat label="Cleared locally" value={data.cleared} tone="good" testid={`clear-${title.toLowerCase()}-cleared`} />
      <Stat label="Retracted from Google" value={data.retracted} tone={data.retracted ? 'good' : 'default'} testid={`clear-${title.toLowerCase()}-retracted`} />
      <Stat label="Retract errors" value={data.retract_errors} tone={data.retract_errors ? 'bad' : 'default'} testid={`clear-${title.toLowerCase()}-errors`} />
      <Stat label="Skipped (retained — kept)" value={data.skipped_retained} tone="warn" testid={`clear-${title.toLowerCase()}-kept`} />
    </div>
  </div>
);
