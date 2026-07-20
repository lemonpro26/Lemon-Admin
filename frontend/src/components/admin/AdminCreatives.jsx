import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Film, Image as ImageIcon, Clock, CheckCircle2, XCircle, User, Palette, Calendar as CalendarIcon,
  StickyNote, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, TOKEN_KEY, canEdit as canEditFn } from '@/lib/api';
import { API as API_BASE } from '@/lib/creatorApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

export const DISPLAY_SIZES = ['300x250', '728x90', '160x600', '300x600', '320x50', '970x250', '336x280'];

const STATUS_META = {
  pending: { label: 'Pending review', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  rejected: { label: 'Needs changes', cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
};

const adminFileUrl = (id) => `${API_BASE}/creatives/${id}/file?auth=${localStorage.getItem(TOKEN_KEY) || ''}`;

// Local YYYY-MM-DD (respects the viewer's timezone). Used everywhere we
// bucket by "day" so a lead uploaded at 11pm PT stays in that day and
// isn't shoved forward by UTC conversion.
function ymd(d) {
  if (!d) return '';
  const t = new Date(d);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  const { Icon } = m;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}

function Thumb({ item }) {
  const url = adminFileUrl(item.id);
  if (item.type === 'video') {
    return (
      <div className="relative aspect-video w-full rounded-xl bg-slate-900 overflow-hidden">
        <video src={url} className="h-full w-full object-contain" controls preload="metadata" />
      </div>
    );
  }
  return (
    <div className="relative aspect-video w-full rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden">
      <img src={url} alt={item.title} className="h-full w-full object-contain" />
      <span className="absolute bottom-2 right-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{item.size}</span>
    </div>
  );
}

// Inline "Notes" editor per creative — reviewer-only text, saved when the
// user clicks Save (no per-keystroke server chatter).
function AdminNotesEditor({ s, canEdit, onSaved }) {
  const [text, setText] = useState(s.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const dirty = text !== (s.admin_notes || '');
  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/admin/creatives/${s.id}/admin-notes`, { admin_notes: text });
      onSaved(res.data);
      toast.success('Notes saved.');
    } catch (e) {
      toast.error('Could not save notes.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-3" data-testid={`admin-creative-notes-${s.id}`}>
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
        <StickyNote className="h-3 w-3" /> Reviewer notes
      </label>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add reviewer notes (visible to admins only)…"
        disabled={!canEdit || saving}
        rows={2}
        className="text-xs resize-y min-h-[54px]"
        data-testid={`admin-creative-notes-input-${s.id}`}
      />
      {dirty && canEdit && (
        <div className="flex justify-end mt-1.5">
          <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1 bg-slate-800 hover:bg-slate-900 text-white text-[11px]" data-testid={`admin-creative-notes-save-${s.id}`}>
            <Save className="h-3 w-3" /> {saving ? 'Saving…' : 'Save notes'}
          </Button>
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ s, canEdit, onStatus, onNotesSaved }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 hover:shadow-md transition-shadow" data-testid={`admin-creative-card-${s.id}`}>
      <Thumb item={s} />
      <div className="p-1 pt-3">
        <div className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {s.type === 'video' ? <><Film className="h-3 w-3" /> Video</> : <><ImageIcon className="h-3 w-3" /> {s.size}</>}
        </div>
        <h3 className="font-semibold text-slate-900 leading-snug">{s.title}</h3>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
          <User className="h-3 w-3" /> {s.creator_name || '—'} · {s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}
        </div>
        {s.notes && <p className="text-xs text-slate-500 mt-2 line-clamp-2" title={s.notes}>{s.notes}</p>}
        <div className="mt-3"><StatusBadge status={s.status} /></div>
        {canEdit && (
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              disabled={s.status === 'approved'}
              onClick={() => onStatus(s, 'approved')}
              data-testid={`admin-creative-approve-${s.id}`}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              disabled={s.status === 'rejected'}
              onClick={() => onStatus(s, 'rejected')}
              data-testid={`admin-creative-reject-${s.id}`}
            >
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        )}
        <AdminNotesEditor s={s} canEdit={canEdit} onSaved={onNotesSaved} />
      </div>
    </div>
  );
}

function Grid({ items, empty, canEdit, onStatus, onNotesSaved }) {
  if (!items.length) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm">{empty}</div>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => <SubmissionCard key={s.id} s={s} canEdit={canEdit} onStatus={onStatus} onNotesSaved={onNotesSaved} />)}
    </div>
  );
}

// Compact date-picker pill — opens a shadcn Calendar in a popover. The user
// can pick any day; "All dates" clears the filter.
function DateFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-slate-300"
          data-testid="admin-creatives-date-trigger"
        >
          <CalendarIcon className="h-4 w-4 text-indigo-600" />
          {value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'All dates'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2" data-testid="admin-creatives-date-popover">
        <Calendar
          mode="single"
          selected={value ? new Date(`${value}T12:00:00`) : undefined}
          onSelect={(d) => { onChange(d ? ymd(d) : ''); setOpen(false); }}
          initialFocus
        />
        <div className="flex items-center justify-between mt-2 px-1 pb-1">
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-900"
            data-testid="admin-creatives-date-clear"
          >
            Clear
          </button>
          <button
            onClick={() => { onChange(ymd(new Date())); setOpen(false); }}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
            data-testid="admin-creatives-date-today"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AdminCreatives() {
  const canEdit = canEditFn();
  const [tab, setTab] = useState('videos');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Default to today's date so the view is scoped to "today's uploads" out of
  // the box (per the user's request "only show me by date"). Cleared string
  // means "no date filter — show all".
  const [dateFilter, setDateFilter] = useState(ymd(new Date()));
  const [creatorFilter, setCreatorFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/creatives');
      setItems(res.data.creatives || []);
    } catch (e) {
      toast.error('Failed to load creatives.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onStatus = async (s, status) => {
    try {
      const res = await api.post(`/admin/creatives/${s.id}/status`, { status });
      setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...res.data } : x)));
      toast.success(status === 'approved' ? 'Approved.' : 'Marked as needs changes.');
    } catch (e) {
      toast.error('Could not update status.');
    }
  };

  const onNotesSaved = (updated) => {
    setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
  };

  // Full list of unique creators (for the user-name filter dropdown). Sort
  // alphabetically so it's easy to scan.
  const creators = useMemo(() => {
    const set = new Map();
    for (const c of items) {
      const name = (c.creator_name || '').trim();
      if (name && !set.has(name)) set.set(name, (c.creator_id || name));
    }
    return Array.from(set.keys()).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Apply the date + creator filters ONCE — then split by type + size below.
  const filtered = useMemo(() => items.filter((s) => {
    if (dateFilter && ymd(s.created_at) !== dateFilter) return false;
    if (creatorFilter !== 'all' && (s.creator_name || '').trim() !== creatorFilter) return false;
    return true;
  }), [items, dateFilter, creatorFilter]);

  const videos = filtered.filter((s) => s.type === 'video');
  const allDisplays = filtered.filter((s) => s.type === 'display');
  const displays = allDisplays.filter((s) => sizeFilter === 'all' || s.size === sizeFilter);

  // Per-size counts (parenthesized pill counts, e.g. "300x250 (3)").
  const sizeCounts = useMemo(() => {
    const c = {};
    for (const d of allDisplays) {
      if (d.size) c[d.size] = (c[d.size] || 0) + 1;
    }
    return c;
  }, [allDisplays]);

  const pendingCount = items.filter((s) => s.status === 'pending').length;

  return (
    <div className="space-y-5" data-testid="admin-creatives">
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
        <Palette className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-sky-900">
          <span className="font-semibold">Creative submissions from the Creator Portal.</span>{' '}
          {pendingCount} awaiting review.
        </div>
      </div>

      {/* Global filters — date & creator. Apply to both tabs. */}
      <div className="flex items-center gap-3 flex-wrap" data-testid="admin-creatives-global-filters">
        <DateFilter value={dateFilter} onChange={setDateFilter} />
        <div className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-slate-200 bg-white text-sm">
          <User className="h-4 w-4 text-slate-400" />
          <select
            value={creatorFilter}
            onChange={(e) => setCreatorFilter(e.target.value)}
            className="bg-transparent text-slate-700 font-semibold outline-none pr-2 cursor-pointer text-sm"
            data-testid="admin-creatives-creator-filter"
          >
            <option value="all">All creators</option>
            {creators.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {(dateFilter || creatorFilter !== 'all') && (
          <button
            onClick={() => { setDateFilter(''); setCreatorFilter('all'); }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline underline-offset-2"
            data-testid="admin-creatives-clear-filters"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500 tabular-nums" data-testid="admin-creatives-total">
          {filtered.length} of {items.length} showing
        </span>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm" data-testid="admin-creatives-loading">Loading…</div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="videos" data-testid="admin-creatives-tab-videos"><Film className="h-4 w-4 mr-2" /> Videos ({videos.length})</TabsTrigger>
            <TabsTrigger value="display" data-testid="admin-creatives-tab-display"><ImageIcon className="h-4 w-4 mr-2" /> Display Ads ({allDisplays.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="mt-5">
            <Grid items={videos} empty={dateFilter ? 'No video submissions on this date.' : 'No video submissions yet.'} canEdit={canEdit} onStatus={onStatus} onNotesSaved={onNotesSaved} />
          </TabsContent>

          <TabsContent value="display" className="mt-5">
            <div className="flex items-center gap-2 flex-wrap mb-4" data-testid="admin-creatives-size-filters">
              <button
                onClick={() => setSizeFilter('all')}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${sizeFilter === 'all' ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                data-testid="admin-creatives-size-all"
              >
                All sizes <span className={`ml-1 text-xs font-bold rounded-full px-1.5 py-0.5 ${sizeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>({allDisplays.length})</span>
              </button>
              {DISPLAY_SIZES.map((s) => {
                const n = sizeCounts[s] || 0;
                return (
                  <button
                    key={s}
                    onClick={() => setSizeFilter(s)}
                    disabled={n === 0}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${sizeFilter === s ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                    data-testid={`admin-creatives-size-${s}`}
                  >
                    {s}
                    {' '}
                    <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${sizeFilter === s ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`} data-testid={`admin-creatives-size-count-${s}`}>({n})</span>
                  </button>
                );
              })}
            </div>
            <Grid items={displays} empty={dateFilter ? 'No display ads on this date for this size.' : 'No display ads for this size.'} canEdit={canEdit} onStatus={onStatus} onNotesSaved={onNotesSaved} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
