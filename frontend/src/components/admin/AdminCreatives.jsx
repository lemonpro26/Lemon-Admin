import React, { useState } from 'react';
import {
  Film, Image as ImageIcon, Play, Clock, CheckCircle2, XCircle, Download, User, Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DISPLAY_SIZES } from '@/pages/CreatorPortal';

// --- Mock submissions (frontend-only mockup; no backend wired yet) ---
const MOCK_SUBMISSIONS = [
  { id: 's1', type: 'video', creator: 'Alex Rivera', title: 'Lemon Law — 30s Explainer', notes: 'Hook: "Is your new car a lemon?"', status: 'pending', date: 'Jun 15, 2026' },
  { id: 's2', type: 'video', creator: 'Jordan Kim', title: 'Testimonial Cut — Maria', notes: 'Real client, signed release on file.', status: 'approved', date: 'Jun 14, 2026' },
  { id: 's3', type: 'video', creator: 'Sam Patel', title: 'Buyback Story — 15s', notes: '', status: 'rejected', date: 'Jun 11, 2026' },
  { id: 's4', type: 'display', creator: 'Alex Rivera', title: 'Retargeting Banner — Blue', size: '300x250', notes: 'Navy + lemon palette.', status: 'pending', date: 'Jun 14, 2026' },
  { id: 's5', type: 'display', creator: 'Taylor Cruz', title: 'Leaderboard — CTA test', size: '728x90', notes: 'Bold "Free case review" CTA.', status: 'pending', date: 'Jun 13, 2026' },
  { id: 's6', type: 'display', creator: 'Jordan Kim', title: 'Skyscraper — Warranty', size: '160x600', notes: '', status: 'approved', date: 'Jun 09, 2026' },
];

const STATUS_META = {
  pending: { label: 'Pending review', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  rejected: { label: 'Needs changes', cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  const { Icon } = m;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}

function Thumb({ type, size }) {
  if (type === 'video') {
    return (
      <div className="relative aspect-video w-full rounded-xl bg-gradient-to-br from-[#0F1B3D] to-[#1E3A8A] flex items-center justify-center overflow-hidden">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[#0F1B3D]">
          <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
        </span>
      </div>
    );
  }
  return (
    <div className="relative aspect-video w-full rounded-xl bg-gradient-to-br from-amber-100 to-amber-300 flex items-center justify-center overflow-hidden">
      <ImageIcon className="h-8 w-8 text-amber-700/70" />
      <span className="absolute bottom-2 right-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{size}</span>
    </div>
  );
}

function SubmissionCard({ s }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 hover:shadow-md transition-shadow" data-testid={`admin-creative-card-${s.id}`}>
      <Thumb type={s.type} size={s.size} />
      <div className="p-1 pt-3">
        <div className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {s.type === 'video' ? <><Film className="h-3 w-3" /> Video</> : <><ImageIcon className="h-3 w-3" /> {s.size}</>}
        </div>
        <h3 className="font-semibold text-slate-900 leading-snug">{s.title}</h3>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
          <User className="h-3 w-3" /> {s.creator} · {s.date}
        </div>
        {s.notes && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{s.notes}</p>}
        <div className="mt-3"><StatusBadge status={s.status} /></div>
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`admin-creative-approve-${s.id}`}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="flex-1 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50" data-testid={`admin-creative-reject-${s.id}`}>
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button size="sm" variant="outline" className="rounded-lg border-slate-200 px-2.5" title="Download">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Grid({ items, empty }) {
  if (!items.length) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm">{empty}</div>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => <SubmissionCard key={s.id} s={s} />)}
    </div>
  );
}

export function AdminCreatives() {
  const [tab, setTab] = useState('videos');
  const [sizeFilter, setSizeFilter] = useState('all');
  const videos = MOCK_SUBMISSIONS.filter((s) => s.type === 'video');
  const displays = MOCK_SUBMISSIONS.filter((s) => s.type === 'display' && (sizeFilter === 'all' || s.size === sizeFilter));
  const pendingCount = MOCK_SUBMISSIONS.filter((s) => s.status === 'pending').length;

  return (
    <div className="space-y-5" data-testid="admin-creatives">
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
        <Palette className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-sky-900">
          <span className="font-semibold">Creative submissions from the Creator Portal.</span>{' '}
          {pendingCount} awaiting review. This is a mockup — approve/reject and uploads aren't live yet.
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="videos" data-testid="admin-creatives-tab-videos"><Film className="h-4 w-4 mr-2" /> Videos ({videos.length})</TabsTrigger>
          <TabsTrigger value="display" data-testid="admin-creatives-tab-display"><ImageIcon className="h-4 w-4 mr-2" /> Display Ads ({MOCK_SUBMISSIONS.filter((s) => s.type === 'display').length})</TabsTrigger>
        </TabsList>

        <TabsContent value="videos" className="mt-5">
          <Grid items={videos} empty="No video submissions yet." />
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
          <Grid items={displays} empty="No display ads for this size." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
