import React, { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Copy, Check, Trophy, Play, Square, Trash2, Plus, X, Beaker, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BUILTIN_PAGES = [
  { label: 'Home (Main)', path: '/' },
  { label: 'PA Advertorial', path: '/pa' },
  { label: 'Spanish', path: '/sp' },
];

const STATUS_STYLE = {
  running: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  stopped: 'bg-amber-50 text-amber-700 border-amber-200',
};

function VariantStatsRow({ v, isWinner }) {
  return (
    <div className={`grid grid-cols-[1.4fr_repeat(4,1fr)] gap-2 items-center px-3 py-2 rounded-lg ${isWinner ? 'bg-emerald-50' : ''}`} data-testid={`exp-variant-${v.label}`}>
      <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 truncate">
        {isWinner && <Trophy className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
        {v.label} <code className="text-[10px] text-slate-400">{v.path}</code>
      </div>
      <div className="text-center text-sm text-slate-500">{v.weight}%</div>
      <div className="text-center text-sm font-semibold text-slate-900">{v.clicks}</div>
      <div className="text-center text-sm font-semibold text-slate-900">{v.leads}</div>
      <div className={`text-center text-sm font-bold ${isWinner ? 'text-emerald-600' : 'text-[#0F1B3D]'}`}>{v.conversion_rate}%</div>
    </div>
  );
}

function ExperimentCard({ exp, canEdit, onStart, onStop, onDelete, onRename }) {
  const stats = exp.stats || { variants: [], winner: null };
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(exp.name);

  const startEdit = () => { setDraftName(exp.name); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = async () => {
    const next = draftName.trim();
    if (!next || next === exp.name) { setEditing(false); return; }
    await onRename(exp, next);
    setEditing(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid={`experiment-${exp.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                autoFocus
                className="h-9 rounded-lg border-slate-200 w-56"
                data-testid={`exp-name-input-${exp.id}`}
              />
              <Button size="sm" onClick={saveEdit} className="rounded-lg bg-[#0F1B3D] px-2" data-testid={`exp-name-save-${exp.id}`}><Check className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={cancelEdit} className="rounded-lg border-slate-200 px-2" data-testid={`exp-name-cancel-${exp.id}`}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="font-slab font-bold text-slate-900 flex items-center gap-2">
              {exp.name}
              {canEdit && (
                <button onClick={startEdit} className="text-slate-400 hover:text-[#0F1B3D] transition-colors" aria-label="Rename test" data-testid={`exp-rename-${exp.id}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLE[exp.status] || STATUS_STYLE.draft}`} data-testid={`exp-status-${exp.id}`}>
                {exp.status}
              </span>
            </div>
          )}
          <div className="text-xs text-slate-400 mt-0.5">Created {new Date(exp.created_at).toLocaleDateString()}</div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {exp.status !== 'running' ? (
              <Button size="sm" onClick={() => onStart(exp)} className="rounded-lg bg-emerald-600 hover:bg-emerald-700" data-testid={`exp-start-${exp.id}`}>
                <Play className="h-3.5 w-3.5 mr-1" /> Start
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onStop(exp)} className="rounded-lg border-amber-200 text-amber-700" data-testid={`exp-stop-${exp.id}`}>
                <Square className="h-3.5 w-3.5 mr-1" /> Stop
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onDelete(exp)} className="rounded-lg border-red-200 text-red-600 px-2" data-testid={`exp-delete-${exp.id}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] gap-2 px-3 pb-1 text-[11px] uppercase tracking-wide text-slate-400 font-bold">
          <div>Page</div><div className="text-center">Split</div><div className="text-center">Visits</div><div className="text-center">Leads</div><div className="text-center">Conv.</div>
        </div>
        <div className="space-y-1">
          {stats.variants.map((v) => (
            <VariantStatsRow key={v.label} v={v} isWinner={stats.winner && stats.winner === v.label} />
          ))}
        </div>
        {stats.winner === 'tie' && <p className="mt-2 px-3 text-xs text-amber-600">Variants are tied so far.</p>}
        {!stats.winner && <p className="mt-2 px-3 text-xs text-slate-400">Need traffic on 2+ variants to call a winner. Stats count only visitors routed through /split.</p>}
      </div>
    </div>
  );
}

export function AdminSplitTest() {
  const canEdit = canEditFn();
  const [experiments, setExperiments] = useState([]);
  const [pages, setPages] = useState(BUILTIN_PAGES);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [variants, setVariants] = useState([
    { label: 'Home (Main)', path: '/', weight: 50 },
    { label: 'PA Advertorial', path: '/pa', weight: 50 },
  ]);
  const [creating, setCreating] = useState(false);

  const splitUrl = `${window.location.origin}/split`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ex, pg] = await Promise.all([
        api.get('/admin/experiments'),
        api.get('/admin/pages').catch(() => ({ data: { custom_pages: [] } })),
      ]);
      setExperiments(ex.data.experiments || []);
      const custom = (pg.data.custom_pages || []).map((p) => ({ label: p.label, path: p.path }));
      setPages([...BUILTIN_PAGES, ...custom]);
    } catch (e) {
      toast.error('Failed to load experiments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyUrl = () => {
    navigator.clipboard.writeText(splitUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const setVariant = (i, patch) => setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addVariant = () => setVariants((prev) => [...prev, { label: pages[0].label, path: pages[0].path, weight: 0 }]);
  const removeVariant = (i) => setVariants((prev) => prev.filter((_, idx) => idx !== i));

  const createTest = async () => {
    if (variants.length < 2) { toast.error('Add at least 2 pages to test.'); return; }
    setCreating(true);
    try {
      await api.post('/admin/experiments', { name: name.trim() || 'Untitled test', variants });
      toast.success('Test created');
      setName('');
      load();
    } catch (e) {
      toast.error('Failed to create test');
    } finally {
      setCreating(false);
    }
  };

  const startExp = async (exp) => {
    try { await api.put(`/admin/experiments/${exp.id}`, { status: 'running' }); toast.success(`"${exp.name}" is live on /split`); load(); }
    catch (e) { toast.error('Failed to start'); }
  };
  const stopExp = async (exp) => {
    try { await api.put(`/admin/experiments/${exp.id}`, { status: 'stopped' }); toast.success('Test stopped'); load(); }
    catch (e) { toast.error('Failed to stop'); }
  };
  const renameExp = async (exp, newName) => {
    try { await api.put(`/admin/experiments/${exp.id}`, { name: newName }); toast.success('Test renamed'); load(); }
    catch (e) { toast.error('Failed to rename'); }
  };
  const deleteExp = async (exp) => {
    if (!window.confirm(`Delete "${exp.name}"? Its results will be lost.`)) return;
    try { await api.delete(`/admin/experiments/${exp.id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error('Failed to delete'); }
  };

  const running = experiments.filter((e) => e.status === 'running');

  return (
    <div className="space-y-6" data-testid="admin-split-test">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" /> A/B test any of your pages. Stats below count ONLY visitors routed through /split.
        </p>
        <div className="flex items-center gap-2">
          <code className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800" data-testid="split-url">{splitUrl}</code>
          <Button variant="outline" onClick={copyUrl} className="rounded-xl" data-testid="split-copy-button">
            {copied ? <Check className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />}{copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      {!loading && running.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700" data-testid="split-no-running">
          No test is currently running — everyone who hits <code>/split</code> goes to Home. Start a test below to begin routing.
        </div>
      )}

      {/* Create test */}
      {canEdit && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="split-create-card">
          <div className="font-slab font-bold text-slate-900 mb-3 flex items-center gap-2"><Beaker className="h-4 w-4" /> New Test</div>
          <div className="mb-4">
            <Label className="text-xs text-slate-500">Test name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home vs PA — June" className="mt-1 h-10 rounded-xl border-slate-200 max-w-md" data-testid="split-name-input" />
          </div>
          <Label className="text-xs text-slate-500">Pages & traffic split</Label>
          <div className="mt-1 space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`split-variant-row-${i}`}>
                <select
                  value={v.path}
                  onChange={(e) => {
                    const pg = pages.find((p) => p.path === e.target.value) || { label: e.target.value, path: e.target.value };
                    setVariant(i, { path: pg.path, label: pg.label });
                  }}
                  className="flex-1 h-10 rounded-xl border border-slate-200 px-3 text-sm bg-white"
                  data-testid={`split-variant-page-${i}`}
                >
                  {pages.map((p) => <option key={p.path} value={p.path}>{p.label} ({p.path})</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} value={v.weight} onChange={(e) => setVariant(i, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20 h-10 rounded-xl border-slate-200" data-testid={`split-variant-weight-${i}`} />
                  <span className="text-sm text-slate-400">%</span>
                </div>
                {variants.length > 2 && (
                  <Button variant="outline" size="sm" onClick={() => removeVariant(i)} className="rounded-lg border-slate-200 px-2" data-testid={`split-variant-remove-${i}`}><X className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addVariant} className="rounded-lg" data-testid="split-add-variant"><Plus className="h-4 w-4 mr-1" /> Add page</Button>
            <Button onClick={createTest} disabled={creating} className="rounded-xl bg-[#0F1B3D]" data-testid="split-create-button">{creating ? 'Creating…' : 'Create test'}</Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Weights are relative — they don't have to add to 100. Start a test to make it live on /split (only one runs at a time).</p>
        </div>
      )}

      {/* Experiments list / history */}
      <div>
        <div className="font-slab font-bold text-slate-900 mb-3">Tests & Results</div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : experiments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm" data-testid="experiments-empty">No tests yet. Create one above to get started.</div>
        ) : (
          <div className="space-y-4">
            {experiments.map((exp) => (
              <ExperimentCard key={exp.id} exp={exp} canEdit={canEdit} onStart={startExp} onStop={stopExp} onDelete={deleteExp} onRename={renameExp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
