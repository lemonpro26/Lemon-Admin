import React, { useState, useEffect, useCallback } from 'react';
import {
  Upload, Video, Image as ImageIcon, Play, Clock, CheckCircle2, XCircle,
  Plus, LogOut, Palette, Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Logo } from '@/components/Logo';
import {
  creatorApi, getCreatorToken, setCreatorToken, clearCreatorToken, creativeFileUrl,
} from '@/lib/creatorApi';

// Standard IAB display ad sizes offered in the upload dropdown.
export const DISPLAY_SIZES = ['300x250', '728x90', '160x600', '300x600', '320x50', '970x250', '336x280'];

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

function Thumb({ item }) {
  const url = creativeFileUrl(item.id);
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

function AuthView({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const path = mode === 'login' ? '/creator/login' : '/creator/register';
      const body = mode === 'login' ? { email, password } : { name, email, password };
      const res = await creatorApi.post(path, body);
      setCreatorToken(res.data.token);
      onAuthed(res.data.creator);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" data-testid="page-creator-portal-auth">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Logo size="lg" /></div>
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
                className={`h-9 rounded-lg text-sm font-semibold transition-colors ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                data-testid={`creator-auth-tab-${m}`}
              >
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="grid gap-4">
            {mode === 'register' && (
              <div>
                <Label className="text-slate-700">Full name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-name-input" />
              </div>
            )}
            <div>
              <Label className="text-slate-700">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-email-input" />
            </div>
            <div>
              <Label className="text-slate-700">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-password-input" />
            </div>
            <Button type="submit" disabled={loading} className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold transition-colors disabled:opacity-70" data-testid="creator-auth-submit">
              {loading ? 'Please wait…' : (mode === 'login' ? 'Log In' : 'Create Account')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function UploadDialog({ open, onOpenChange, onUploaded }) {
  const [type, setType] = useState('video');
  const [size, setSize] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setType('video'); setSize(''); setTitle(''); setNotes(''); setFile(null); setProgress(0); };

  const submit = async () => {
    if (!title.trim()) { toast.error('Please add a title.'); return; }
    if (type === 'display' && !size) { toast.error('Please pick an ad size.'); return; }
    if (!file) { toast.error('Please choose a file.'); return; }
    setUploading(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      fd.append('title', title.trim());
      fd.append('notes', notes.trim());
      if (type === 'display') fd.append('size', size);
      await creatorApi.post('/creator/creatives', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total) setProgress(Math.round((e.loaded / e.total) * 100)); },
      });
      toast.success('Submitted for review!');
      reset();
      onOpenChange(false);
      onUploaded();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploading) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-lg" data-testid="creator-upload-dialog">
        <DialogHeader><DialogTitle className="font-slab">Upload a creative</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {[{ k: 'video', label: 'Video Ad', Icon: Film }, { k: 'display', label: 'Display Ad', Icon: ImageIcon }].map(({ k, label, Icon }) => (
              <button
                key={k}
                onClick={() => { setType(k); setFile(null); }}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${type === k ? 'border-[#EF4444] bg-red-50 text-[#DC2626]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                data-testid={`creator-upload-type-${k}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {type === 'display' && (
            <div>
              <Label className="text-slate-700">Ad size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-upload-size"><SelectValue placeholder="Select a size" /></SelectTrigger>
                <SelectContent>
                  {DISPLAY_SIZES.map((s) => <SelectItem key={s} value={s} data-testid={`creator-size-${s}`}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-slate-700">Title / name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'video' ? 'e.g. 30s Explainer' : 'e.g. Retargeting Banner — Blue'} className="mt-1.5 h-11 rounded-xl border-slate-200" data-testid="creator-upload-title" />
          </div>
          <div>
            <Label className="text-slate-700">Notes / description</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the reviewer should know…" className="mt-1.5 rounded-xl border-slate-200" data-testid="creator-upload-notes" />
          </div>

          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center cursor-pointer hover:border-[#EF4444]/50 transition-colors" data-testid="creator-upload-dropzone">
            <input
              type="file"
              className="hidden"
              accept={type === 'video' ? 'video/*' : 'image/*'}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              data-testid="creator-upload-file-input"
            />
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#EF4444] shadow-sm">
              {type === 'video' ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </span>
            <span className="text-sm font-semibold text-slate-700">{file ? file.name : `Choose your ${type === 'video' ? 'video' : 'image'} file`}</span>
            <span className="text-xs text-slate-400">{type === 'video' ? 'MP4, MOV, WEBM — no size limit' : 'PNG, JPG, GIF, WEBP'}</span>
          </label>

          {uploading && (
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden" data-testid="creator-upload-progress">
              <div className="h-full rounded-full bg-[#EF4444] transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <Button onClick={submit} disabled={uploading} className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold disabled:opacity-70" data-testid="creator-upload-submit">
            <Upload className="h-4 w-4 mr-2" /> {uploading ? `Uploading… ${progress}%` : 'Submit for review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DashboardView({ creator, onLogout }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await creatorApi.get('/creator/creatives');
      setItems(res.data.creatives || []);
    } catch (e) {
      if (e?.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  const counts = {
    total: items.length,
    approved: items.filter((u) => u.status === 'approved').length,
    pending: items.filter((u) => u.status === 'pending').length,
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="page-creator-portal-dashboard">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="font-slab font-bold text-slate-900 hidden sm:inline border-l border-slate-200 pl-3">Creator Portal</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-slate-500" data-testid="creator-email">{creator?.email}</span>
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
          <Button onClick={() => setUploadOpen(true)} className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold" data-testid="creator-upload-open">
            <Plus className="h-4 w-4 mr-2" /> Upload creative
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total uploads', value: counts.total, cls: 'text-slate-900' },
            { label: 'Approved', value: counts.approved, cls: 'text-emerald-600' },
            { label: 'Pending', value: counts.pending, cls: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm" data-testid="creator-uploads-loading">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm" data-testid="creator-uploads-empty">
            No uploads yet. Click "Upload creative" to submit your first video or display ad.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="creator-uploads-grid">
            {items.map((u) => (
              <div key={u.id} className="rounded-2xl border border-slate-200 bg-white p-3 hover:shadow-md transition-shadow" data-testid={`creator-upload-card-${u.id}`}>
                <Thumb item={u} />
                <div className="p-1 pt-3">
                  <div className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {u.type === 'video' ? <><Film className="h-3 w-3" /> Video</> : <><ImageIcon className="h-3 w-3" /> Display · {u.size}</>}
                  </div>
                  <h3 className="font-semibold text-slate-900 leading-snug">{u.title}</h3>
                  {u.notes && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{u.notes}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <StatusBadge status={u.status} />
                    <span className="text-[11px] text-slate-400">{u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={load} />
    </div>
  );
}

export default function CreatorPortal() {
  const [creator, setCreator] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!getCreatorToken()) { setChecking(false); return; }
    creatorApi.get('/creator/me')
      .then((res) => setCreator(res.data))
      .catch(() => clearCreatorToken())
      .finally(() => setChecking(false));
  }, []);

  const logout = () => { clearCreatorToken(); setCreator(null); };

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">Loading…</div>;
  }
  return creator
    ? <DashboardView creator={creator} onLogout={logout} />
    : <AuthView onAuthed={setCreator} />;
}
