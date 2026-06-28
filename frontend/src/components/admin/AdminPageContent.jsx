import React, { useCallback, useEffect, useState } from 'react';
import { Save, ExternalLink, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PAGE_META = {
  home: { path: '/', label: 'Home', noun: 'home' },
  sp: { path: '/sp', label: 'Spanish', noun: 'Spanish' },
};

const FIELDS = [
  { key: 'cta', label: 'Get-started button text' },
  { key: 'tooltip', label: 'Tooltip above the button' },
  { key: 'rated', label: 'Trust badge — rating' },
  { key: 'free_consult', label: 'Trust badge — consultation' },
  { key: 'no_win_no_fee', label: 'Trust badge — fee' },
];

// CMS editor for the Home (`/`) and Spanish (`/sp`) landing pages. Mirrors the
// PA editor: live iframe preview + instant Save & Publish.
export function AdminPageContent({ page }) {
  const meta = PAGE_META[page];
  const canEdit = canEditFn();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const url = `${window.location.origin}${meta.path}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/page-content/${page}`);
      setC(res.data);
    } catch (e) {
      toast.error('Failed to load page content');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const f = (key) => (val) => setC((prev) => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/admin/page-content/${page}`, c);
      setC(res.data);
      setPreviewKey((k) => k + 1);
      toast.success(`${meta.label} page updated — live now`);
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !c) {
    return <div className="p-8 text-center text-slate-400 text-sm" data-testid={`page-content-loading-${page}`}>Loading…</div>;
  }

  return (
    <div className="space-y-6" data-testid={`admin-page-content-${page}`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">
          Edit the <code>{meta.path}</code> page. Saving publishes instantly.
        </p>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button variant="outline" onClick={() => { setShowPreview((v) => !v); setPreviewKey((k) => k + 1); }} className="rounded-xl border-slate-200" data-testid={`page-content-preview-toggle-${page}`}>
            <Eye className="h-4 w-4 mr-2" /> {showPreview ? 'Hide preview' : 'See page'}
          </Button>
          <a href={url} target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" data-testid={`page-content-open-${page}`}>
            <ExternalLink className="h-4 w-4" /> Open {meta.path}
          </a>
          {canEdit && (
            <Button onClick={save} disabled={saving} className="rounded-xl bg-[#0F1B3D]" data-testid={`page-content-save-${page}`}>
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save & Publish'}
            </Button>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white" data-testid={`page-content-preview-${page}`}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-slate-500">Live preview — {url}</span>
            <Button variant="ghost" size="sm" onClick={() => setPreviewKey((k) => k + 1)} className="h-7 text-xs" data-testid={`page-preview-refresh-${page}`}>Refresh</Button>
          </div>
          <iframe key={previewKey} title={`${meta.label} preview`} src={url} className="w-full h-[640px] bg-white" />
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="font-slab font-bold text-slate-900">Hero CTA & Trust Line</div>
        <p className="rounded-lg bg-sky-50 border border-sky-100 text-sky-800 text-xs px-3 py-2" data-testid={`page-content-hint-${page}`}>
          The big headline &amp; subheadline are managed in the{' '}
          <span className="font-semibold">{page === 'sp' ? 'Spanish' : 'Hooks'}</span> tab (they support A/B testing &amp; live location text). This editor controls the button, tooltip and trust badges.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {FIELDS.map((fld) => (
            <div key={fld.key}>
              <Label className="text-xs text-slate-500">{fld.label}</Label>
              <Input value={c[fld.key] || ''} onChange={(e) => f(fld.key)(e.target.value)} className="mt-1 h-10 rounded-xl border-slate-200" data-testid={`page-field-${page}-${fld.key}`} />
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="rounded-xl bg-[#0F1B3D]" data-testid={`page-content-save-bottom-${page}`}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save & Publish'}
          </Button>
        </div>
      )}
    </div>
  );
}
