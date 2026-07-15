import React, { useState } from 'react';
import {
  Upload, Video, Image as ImageIcon, Play, Clock, CheckCircle2, XCircle,
  Plus, LogOut, Palette, Film, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Logo } from '@/components/Logo';

// Standard IAB display ad sizes offered in the upload dropdown.
export const DISPLAY_SIZES = ['300x250', '728x90', '160x600', '300x600', '320x50', '970x250', '336x280'];

// --- Mock data (frontend-only mockup; no backend wired yet) ---
const MOCK_UPLOADS = [
  { id: 'u1', type: 'video', title: 'Lemon Law — 30s Explainer', notes: 'Hook: "Is your new car a lemon?"', status: 'approved', date: 'Jun 12, 2026' },
  { id: 'u2', type: 'display', title: 'Retargeting Banner — Blue', size: '300x250', notes: 'Uses the navy + lemon palette.', status: 'pending', date: 'Jun 14, 2026' },
  { id: 'u3', type: 'video', title: 'Testimonial Cut — Maria', notes: '', status: 'pending', date: 'Jun 15, 2026' },
  { id: 'u4', type: 'display', title: 'Leaderboard — CTA test', size: '728x90', notes: 'Bold "Get a free case review" CTA.', status: 'rejected', date: 'Jun 10, 2026' },
  { id: 'u5', type: 'display', title: 'Skyscraper — Warranty', size: '160x600', notes: '', status: 'approved', date: 'Jun 09, 2026' },
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
    <Badge variant="outline" className={`gap-1 ${m.cls}`} data-testid={`creative-status-${status}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}

// Small colored thumbnail placeholder (mockup — no real files yet).
function Thumb({ type, size }) {
  if (type === 'video') {
    return (
      <div className="relative aspect-video w-full rounded-xl bg-gradient-to-br from-[#0F1B3D] to-[#1E3A8A] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_30%,white,transparent_60%)]" />
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

function AuthView({ onEnter }) {
  const [mode, setMode] = useState('login');
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" data-testid="page-creator-portal-auth">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.10)] p-7">
          <div className="flex items-center gap-2 mb-1">
            <Palette className="h-5 w-5 text-[#EF4444]" />
            <h1 className="font-slab font-bold text-xl text-slate-900">Creator Portal</h1>
          </div>
          <p className="text-sm text-slate-500 mb-5">Upload your video &amp; display ads and track their review status.</p>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 mb-5">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`h-9 rounded-lg text-sm font-semibold capitalize transition-colors ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                data-testid={`creator-auth-tab-${m}`}
              >
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); onEnter(); }} className="grid gap-4">
            {mode === 'register' && (
              <div>
                <Label className="text-slate-700">Full name</Label>
                <Input placeholder="Your name" className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-name-input" />
              </div>
            )}
            <div>
              <Label className="text-slate-700">Email</Label>
              <Input type="email" placeholder="you@studio.com" className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-email-input" />
            </div>
            <div>
              <Label className="text-slate-700">Password</Label>
              <Input type="password" placeholder="Enter password" className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-password-input" />
            </div>
            <Button
              type="submit"
              className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold transition-colors"
              data-testid="creator-auth-submit"
            >
              {mode === 'login' ? 'Log In' : 'Create Account'}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Mockup preview — accounts are not live yet.</p>
      </div>
    </div>
  );
}

function UploadDialog({ open, onOpenChange }) {
  const [type, setType] = useState('video');
  const [size, setSize] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="creator-upload-dialog">
        <DialogHeader>
          <DialogTitle className="font-slab">Upload a creative</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { k: 'video', label: 'Video Ad', Icon: Film },
              { k: 'display', label: 'Display Ad', Icon: ImageIcon },
            ].map(({ k, label, Icon }) => (
              <button
                key={k}
                onClick={() => setType(k)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${type === k ? 'border-[#EF4444] bg-red-50 text-[#DC2626]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                data-testid={`creator-upload-type-${k}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {/* Size dropdown (display only) */}
          {type === 'display' && (
            <div>
              <Label className="text-slate-700">Ad size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-upload-size">
                  <SelectValue placeholder="Select a size" />
                </SelectTrigger>
                <SelectContent>
                  {DISPLAY_SIZES.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`creator-size-${s}`}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-slate-700">Title / name</Label>
            <Input placeholder={type === 'video' ? 'e.g. 30s Explainer' : 'e.g. Retargeting Banner — Blue'} className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-upload-title" />
          </div>

          <div>
            <Label className="text-slate-700">Notes / description</Label>
            <Textarea rows={3} placeholder="Anything the reviewer should know…" className="mt-1.5 rounded-xl border-slate-200" data-testid="creator-upload-notes" />
          </div>

          {/* Dropzone (mock) */}
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center cursor-pointer hover:border-[#EF4444]/50 transition-colors" data-testid="creator-upload-dropzone">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#EF4444] shadow-sm">
              {type === 'video' ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </span>
            <span className="text-sm font-semibold text-slate-700">Drop your {type === 'video' ? 'video' : 'image'} here or click to browse</span>
            <span className="text-xs text-slate-400">{type === 'video' ? 'MP4, MOV — no size limit' : 'PNG, JPG, GIF, HTML5'}</span>
          </label>

          <Button
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold"
            data-testid="creator-upload-submit"
          >
            <Upload className="h-4 w-4 mr-2" /> Submit for review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DashboardView({ onLogout }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50" data-testid="page-creator-portal-dashboard">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="font-slab font-bold text-slate-900 hidden sm:inline border-l border-slate-200 pl-3">Creator Portal</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-slate-500">alex@studio.com</span>
          <Button variant="outline" onClick={onLogout} className="rounded-xl border-slate-200" data-testid="creator-logout">
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="font-slab font-bold text-2xl text-slate-900">Your creatives</h1>
            <p className="text-sm text-slate-500 mt-0.5">Everything you've uploaded and where it stands in review.</p>
          </div>
          <Button
            onClick={() => setUploadOpen(true)}
            className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold"
            data-testid="creator-upload-open"
          >
            <Plus className="h-4 w-4 mr-2" /> Upload creative
          </Button>
        </div>

        {/* Quick stat row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total uploads', value: MOCK_UPLOADS.length, cls: 'text-slate-900' },
            { label: 'Approved', value: MOCK_UPLOADS.filter((u) => u.status === 'approved').length, cls: 'text-emerald-600' },
            { label: 'Pending', value: MOCK_UPLOADS.filter((u) => u.status === 'pending').length, cls: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Uploads grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="creator-uploads-grid">
          {MOCK_UPLOADS.map((u) => (
            <div key={u.id} className="rounded-2xl border border-slate-200 bg-white p-3 hover:shadow-md transition-shadow" data-testid={`creator-upload-card-${u.id}`}>
              <Thumb type={u.type} size={u.size} />
              <div className="p-1 pt-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {u.type === 'video' ? <><Film className="h-3 w-3" /> Video</> : <><ImageIcon className="h-3 w-3" /> Display · {u.size}</>}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 leading-snug">{u.title}</h3>
                {u.notes && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{u.notes}</p>}
                <div className="flex items-center justify-between mt-3">
                  <StatusBadge status={u.status} />
                  <span className="text-[11px] text-slate-400">{u.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

export default function CreatorPortal() {
  const [loggedIn, setLoggedIn] = useState(false);
  return loggedIn
    ? <DashboardView onLogout={() => setLoggedIn(false)} />
    : <AuthView onEnter={() => setLoggedIn(true)} />;
}
