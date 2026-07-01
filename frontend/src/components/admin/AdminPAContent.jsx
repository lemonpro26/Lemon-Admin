import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Save, Plus, X, ExternalLink, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="font-slab font-bold text-slate-900">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, area, testid, placeholder }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      {area ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={area === true ? 3 : area}
          className="mt-1 rounded-xl border-slate-200" data-testid={testid} placeholder={placeholder} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)}
          className="mt-1 h-10 rounded-xl border-slate-200" data-testid={testid} placeholder={placeholder} />
      )}
    </div>
  );
}

// Editor for a list of plain-text strings (body paragraphs, qualify bullets, badges).
function ListEditor({ label, items, onChange, area, testid }) {
  const set = (i, v) => onChange(items.map((x, idx) => (idx === i ? v : x)));
  const add = () => onChange([...items, '']);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="mt-1 space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2" data-testid={`${testid}-row-${i}`}>
            {area ? (
              <Textarea value={it} onChange={(e) => set(i, e.target.value)} rows={2} className="rounded-xl border-slate-200" data-testid={`${testid}-${i}`} />
            ) : (
              <Input value={it} onChange={(e) => set(i, e.target.value)} className="h-10 rounded-xl border-slate-200" data-testid={`${testid}-${i}`} />
            )}
            <Button variant="outline" size="icon" onClick={() => remove(i)} className="rounded-lg border-slate-200 shrink-0 h-10 w-10" data-testid={`${testid}-remove-${i}`}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={add} className="mt-2 rounded-lg" data-testid={`${testid}-add`}>
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </div>
  );
}

export function AdminPAContent({ page = 'pa' }) {
  const canEdit = canEditFn();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/${page}-content`);
      setC(res.data);
    } catch (e) {
      toast.error('Failed to load page content');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const f = (key) => (val) => setC((prev) => ({ ...prev, [key]: val }));
  const setSettlement = (i, patch) =>
    setC((prev) => ({ ...prev, settlements: prev.settlements.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const addSettlement = () => setC((prev) => ({ ...prev, settlements: [...prev.settlements, { amount: '', label: '' }] }));
  const removeSettlement = (i) => setC((prev) => ({ ...prev, settlements: prev.settlements.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/admin/${page}-content`, c);
      setC(res.data);
      setPreviewKey((k) => k + 1); // refresh the live preview after save
      toast.success(`/${page} page updated — live now`);
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !c) {
    return <div className="p-8 text-center text-slate-400 text-sm" data-testid={`${page}-content-loading`}>Loading…</div>;
  }

  const paUrl = `${window.location.origin}/${page}`;

  return (
    <div className="space-y-6" data-testid={`admin-${page}-content`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <FileText className="h-4 w-4" /> Edit the /{page} advertorial page. Saving publishes instantly.
        </p>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            variant="outline"
            onClick={() => { setShowPreview((v) => !v); setPreviewKey((k) => k + 1); }}
            className="rounded-xl border-slate-200"
            data-testid={`${page}-content-preview-toggle`}
          >
            <Eye className="h-4 w-4 mr-2" /> {showPreview ? 'Hide preview' : 'See page'}
          </Button>
          <a href={paUrl} target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" data-testid={`${page}-content-open`}>
            <ExternalLink className="h-4 w-4" /> Open /{page}
          </a>
          {canEdit && (
            <Button onClick={save} disabled={saving} className="rounded-xl bg-[#0F1B3D]" data-testid={`${page}-content-save`}>
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save & Publish'}
            </Button>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white" data-testid={`${page}-content-preview`}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-slate-500">Live preview — {paUrl}</span>
            <Button variant="ghost" size="sm" onClick={() => setPreviewKey((k) => k + 1)} className="h-7 text-xs" data-testid={`${page}-preview-refresh`}>Refresh</Button>
          </div>
          <iframe
            key={previewKey}
            title={`${page} page preview`}
            src={paUrl}
            className="w-full h-[640px] bg-white"
          />
        </div>
      )}

      <Section title="Attorney">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Eyebrow" value={c.attorney_eyebrow} onChange={f('attorney_eyebrow')} testid={`${page}-attorney-eyebrow`} />
          <Field label="Name" value={c.attorney_name} onChange={f('attorney_name')} testid={`${page}-attorney-name`} />
          <Field label="Title line" value={c.attorney_title} onChange={f('attorney_title')} testid={`${page}-attorney-title`} />
          <Field label="Award badge" value={c.attorney_award} onChange={f('attorney_award')} testid={`${page}-attorney-award`} />
        </div>
        <Field label="Bio" value={c.attorney_bio} onChange={f('attorney_bio')} area={5} testid={`${page}-attorney-bio`} />
        <ListEditor label="Credential badges" items={c.attorney_badges} onChange={f('attorney_badges')} testid={`${page}-attorney-badges`} />
        <Field label="School / footer line" value={c.attorney_school} onChange={f('attorney_school')} testid={`${page}-attorney-school`} />
      </Section>

      <Section title="Recent Settlements">
        <Field label="Section label" value={c.settlements_eyebrow} onChange={f('settlements_eyebrow')} testid={`${page}-settlements-eyebrow`} />
        <div className="space-y-2">
          <Label className="text-xs text-slate-500">Settlements (amount + vehicle)</Label>
          {c.settlements.map((s, i) => (
            <div key={i} className="flex items-center gap-2" data-testid={`${page}-settlement-row-${i}`}>
              <Input value={s.amount} onChange={(e) => setSettlement(i, { amount: e.target.value })} placeholder="$107,500" className="h-10 rounded-xl border-slate-200 w-32" data-testid={`${page}-settlement-amount-${i}`} />
              <Input value={s.label} onChange={(e) => setSettlement(i, { label: e.target.value })} placeholder="Mercedes GLE" className="h-10 rounded-xl border-slate-200 flex-1" data-testid={`${page}-settlement-label-${i}`} />
              <Button variant="outline" size="icon" onClick={() => removeSettlement(i)} className="rounded-lg border-slate-200 shrink-0 h-10 w-10" data-testid={`${page}-settlement-remove-${i}`}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addSettlement} className="rounded-lg" data-testid={`${page}-settlement-add`}>
            <Plus className="h-4 w-4 mr-1" /> Add settlement
          </Button>
        </div>
        <Field label="Disclaimer" value={c.settlements_disclaimer} onChange={f('settlements_disclaimer')} testid={`${page}-settlements-disclaimer`} />
        <Field label="Button label" value={c.settlements_cta} onChange={f('settlements_cta')} testid={`${page}-settlements-cta-input`} />
      </Section>

      <Section title="Headline & Body">
        <Field label="Headline" value={c.headline} onChange={f('headline')} area={2} testid={`${page}-headline-input`} />
        <Field label="Subhead" value={c.subhead} onChange={f('subhead')} area={3} testid={`${page}-subhead-input`} />
        <ListEditor label="Body paragraphs" items={c.body} onChange={f('body')} area testid={`${page}-body`} />
      </Section>

      <Section title="Pull-quote">
        <Field label="Quote" value={c.callout_quote} onChange={f('callout_quote')} area={3} testid={`${page}-callout-quote`} />
        <Field label="Button label" value={c.callout_cta} onChange={f('callout_cta')} testid={`${page}-callout-cta-input`} />
      </Section>

      <Section title="How Do I Qualify">
        <Field label="Heading" value={c.qualify_heading} onChange={f('qualify_heading')} testid={`${page}-qualify-heading`} />
        <Field label="Intro" value={c.qualify_intro} onChange={f('qualify_intro')} area={3} testid={`${page}-qualify-intro`} />
        <ListEditor label="Qualify bullets" items={c.qualify_items} onChange={f('qualify_items')} testid={`${page}-qualify-items`} />
      </Section>

      <Section title="Steps & Final CTA">
        <Field label="Step 1 label" value={c.step1_label} onChange={f('step1_label')} testid={`${page}-step1-label`} />
        <Field label="Step 2 label" value={c.step2_label} onChange={f('step2_label')} testid={`${page}-step2-label`} />
        <Field label="Step 2 text" value={c.step2_text} onChange={f('step2_text')} area={3} testid={`${page}-step2-text`} />
        <Field label="Final button label" value={c.final_cta} onChange={f('final_cta')} testid={`${page}-final-cta-input`} />
      </Section>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="rounded-xl bg-[#0F1B3D]" data-testid={`${page}-content-save-bottom`}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save & Publish'}
          </Button>
        </div>
      )}
    </div>
  );
}
