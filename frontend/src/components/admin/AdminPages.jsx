import React, { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, Copy, Check, ExternalLink, Plus, Trash2, Save, Home as HomeIcon, FileText, Languages, FlaskConical, Link as LinkIcon, Pencil, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminPAContent } from '@/components/admin/AdminPAContent';
import { AdminPageContent } from '@/components/admin/AdminPageContent';

// Built-in pages that ship with the app (real routes), organized into groups.
// `editor` marks pages with an inline content CMS (preview + publish).
const PAGE_GROUPS = [
  {
    title: 'Home Pages',
    pages: [
      { key: 'home', label: 'Home (Main Landing)', path: '/', icon: HomeIcon, desc: 'Primary English landing page.', editor: 'home' },
      { key: 'sp', label: 'Spanish Landing', path: '/sp', icon: Languages, desc: 'Full Spanish funnel (source = sp).', editor: 'sp' },
    ],
  },
  {
    title: 'PA Pages',
    pages: [
      { key: 'pa', label: 'PA Advertorial (English)', path: '/pa', icon: FileText, desc: 'Presell / advertorial page (source = lapa).', editor: 'pa' },
      { key: 'spa', label: 'PA Advertorial (Spanish)', path: '/spa', icon: Languages, desc: 'Spanish presell / advertorial page (source = laspa).', editor: 'spa' },
    ],
  },
  {
    title: 'Demand Gen Pages',
    pages: [
      { key: 'dg', label: 'Demand Gen Video Calls (English)', path: '/dg', icon: FileText, desc: 'Demand Gen video-calls advertorial · calls (833) 240-9312 · source = dg.', editor: 'dg' },
      { key: 'dgs', label: 'Demand Gen Spanish Video Calls', path: '/dgs', icon: Languages, desc: 'Spanish Demand Gen video-calls advertorial · calls (833) 868-1802 · source = dgs.', editor: 'dgs' },
    ],
  },
  {
    title: 'Split Tests',
    pages: [
      { key: 'split', label: 'A/B Split Test Entry', path: '/split', icon: FlaskConical, desc: 'Routes visitors between pages by your split weight (managed in the Split Test tab).' },
    ],
  },
];

const AD_EDITORS = ['pa', 'spa', 'dg', 'dgs'];

function PageRow({ icon: Icon, label, desc, path, origin, onDelete, onEdit, canEdit, testid }) {
  const [copied, setCopied] = useState(false);
  const url = `${origin}${path}`;
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 ${onEdit ? 'cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all' : ''}`}
      onClick={onEdit || undefined}
      data-testid={testid}
    >
      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-[#0F1B3D]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-slab font-bold text-slate-900 truncate flex items-center gap-2">
          {label}
          {onEdit && <span className="text-[10px] font-sans font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">Editable</span>}
        </div>
        {desc && <div className="text-xs text-slate-500 truncate">{desc}</div>}
        <code className="text-xs text-slate-600 break-all">{url}</code>
      </div>
      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {onEdit && canEdit && (
          <Button variant="outline" size="sm" className="rounded-lg border-slate-200" onClick={onEdit} data-testid={`${testid}-edit`}>
            <Pencil className="h-4 w-4 mr-1.5" /> Edit
          </Button>
        )}
        <Button variant="outline" size="sm" className="rounded-lg border-slate-200" onClick={copy} data-testid={`${testid}-copy`}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
        <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50" data-testid={`${testid}-open`} title="Open page">
          <ExternalLink className="h-4 w-4" />
        </a>
        {onDelete && (
          <Button variant="outline" size="sm" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 px-2" onClick={onDelete} data-testid={`${testid}-delete`} title="Remove page">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function AdminPages() {
  const canEdit = canEditFn();
  const origin = window.location.origin;
  const [custom, setCustom] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [editing, setEditing] = useState(null); // BUILTINS entry being edited

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/pages');
      setCustom(res.data.custom_pages || []);
    } catch (e) {
      toast.error('Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = async (pages) => {
    setSaving(true);
    try {
      const res = await api.put('/admin/pages', { pages: pages.map((p) => ({ label: p.label, path: p.path })) });
      setCustom(res.data.custom_pages || []);
      toast.success('Pages saved');
    } catch (e) {
      toast.error('Failed to save pages');
    } finally {
      setSaving(false);
    }
  };

  const addPage = () => {
    if (!newPath.trim() && !newLabel.trim()) return;
    const next = [...custom, { label: newLabel.trim() || newPath.trim(), path: newPath.trim() || '/' }];
    setNewLabel('');
    setNewPath('');
    persist(next);
  };

  const removePage = (id) => persist(custom.filter((p) => p.id !== id));

  // ---- Editor sub-view ----
  if (editing) {
    return (
      <div className="space-y-5" data-testid="admin-pages-editor">
        <button
          onClick={() => setEditing(null)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          data-testid="pages-editor-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back to all pages
        </button>
        <div className="font-slab font-bold text-xl text-slate-900 flex items-center gap-2">
          <editing.icon className="h-5 w-5 text-[#0F1B3D]" /> Editing: {editing.label}
        </div>
        {AD_EDITORS.includes(editing.editor)
          ? <AdminPAContent page={editing.editor} />
          : <AdminPageContent page={editing.editor} />}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-pages">
      <p className="text-sm text-slate-500 flex items-center gap-2">
        <LayoutGrid className="h-4 w-4" /> Edit a page's content, copy its URL for Google Ads, or save extra links.
      </p>

      {/* Built-in pages, grouped */}
      {PAGE_GROUPS.map((group) => (
        <div key={group.title} data-testid={`page-group-${group.title.replace(/\s+/g, '-').toLowerCase()}`}>
          <div className="font-slab font-bold text-slate-900 mb-3">{group.title}</div>
          <div className="grid gap-3">
            {group.pages.map((p) => (
              <PageRow
                key={p.key}
                icon={p.icon}
                label={p.label}
                desc={p.desc}
                path={p.path}
                origin={origin}
                canEdit={canEdit}
                onEdit={p.editor ? () => setEditing(p) : null}
                testid={`page-builtin-${p.key}`}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Custom pages */}
      <div>
        <div className="font-slab font-bold text-slate-900 mb-3">Your Saved Pages</div>
        {loading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : custom.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-slate-400 text-sm" data-testid="pages-empty">
            No saved pages yet. Add any page URL below to keep it handy.
          </div>
        ) : (
          <div className="grid gap-3">
            {custom.map((p) => (
              <PageRow
                key={p.id}
                icon={LinkIcon}
                label={p.label}
                path={p.path}
                origin={origin}
                onDelete={canEdit ? () => removePage(p.id) : null}
                testid={`page-custom-${p.id}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add page */}
      {canEdit && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="pages-add-card">
          <div className="font-slab font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add a Page
          </div>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs text-slate-500">Label</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. California Campaign" className="mt-1 h-10 rounded-xl border-slate-200" data-testid="pages-new-label" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Path</Label>
              <Input value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/ca" className="mt-1 h-10 rounded-xl border-slate-200" data-testid="pages-new-path" />
            </div>
            <Button onClick={addPage} disabled={saving} className="h-10 rounded-xl bg-[#0F1B3D]" data-testid="pages-add-button">
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Add'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Enter the path that comes after your domain (e.g. <code>/pa</code>). The full URL is built automatically from <code>{origin}</code>.</p>
        </div>
      )}
    </div>
  );
}
