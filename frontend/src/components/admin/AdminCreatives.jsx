import React, { useState, useEffect, useCallback } from 'react';
import {
  Film, Image as ImageIcon, Clock, CheckCircle2, XCircle, User, Palette,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, TOKEN_KEY, canEdit as canEditFn } from '@/lib/api';
import { API as API_BASE } from '@/lib/creatorApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export const DISPLAY_SIZES = ['300x250', '728x90', '160x600', '300x600', '320x50', '970x250', '336x280'];

const STATUS_META = {
  pending: { label: 'Pending review', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  rejected: { label: 'Needs changes', cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
};

const adminFileUrl = (id) => `${API_BASE}/creatives/${id}/file?auth=${localStorage.getItem(TOKEN_KEY) || ''}`;

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

function SubmissionCard({ s, canEdit, onStatus }) {
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
        {s.notes && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{s.notes}</p>}
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
      </div>
    </div>
  );
}

function Grid({ items, empty, canEdit, onStatus }) {
  if (!items.length) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm">{empty}</div>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => <SubmissionCard key={s.id} s={s} canEdit={canEdit} onStatus={onStatus} />)}
    </div>
  );
}

export function AdminCreatives() {
  const canEdit = canEditFn();
  const [tab, setTab] = useState('videos');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const videos = items.filter((s) => s.type === 'video');
  const allDisplays = items.filter((s) => s.type === 'display');
  const displays = allDisplays.filter((s) => sizeFilter === 'all' || s.size === sizeFilter);
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

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm" data-testid="admin-creatives-loading">Loading…</div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="videos" data-testid="admin-creatives-tab-videos"><Film className="h-4 w-4 mr-2" /> Videos ({videos.length})</TabsTrigger>
            <TabsTrigger value="display" data-testid="admin-creatives-tab-display"><ImageIcon className="h-4 w-4 mr-2" /> Display Ads ({allDisplays.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="mt-5">
            <Grid items={videos} empty="No video submissions yet." canEdit={canEdit} onStatus={onStatus} />
          </TabsContent>

          <TabsContent value="display" className="mt-5">
            <div className="flex items-center gap-2 flex-wrap mb-4" data-testid="admin-creatives-size-filters">
              <button
                onClick={() => setSizeFilter('all')}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${sizeFilter === 'all' ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                data-testid="admin-creatives-size-all"
              >
                All sizes
              </button>
              {DISPLAY_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSizeFilter(s)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${sizeFilter === s ? 'bg-[#0F1B3D] text-white border-[#0F1B3D]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                  data-testid={`admin-creatives-size-${s}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Grid items={displays} empty="No display ads for this size." canEdit={canEdit} onStatus={onStatus} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
