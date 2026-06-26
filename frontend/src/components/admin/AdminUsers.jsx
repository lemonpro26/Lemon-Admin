import React, { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Trash2, Shield, Eye, KeyRound, Crown, History, LogIn, Pencil, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, getRole, getUsername, setSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const fmtWhen = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
};

const ROLE_META = {
  owner: { label: 'Owner', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Crown },
  editor: { label: 'Editor', cls: 'bg-sky-50 text-sky-700 border-sky-200', icon: Shield },
  view_only: { label: 'View Only', cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: Eye },
};

const RoleBadge = ({ role }) => {
  const m = ROLE_META[role] || ROLE_META.editor;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}><Icon className="h-3 w-3" />{m.label}</Badge>
  );
};

export const AdminUsers = ({ canEdit }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nu, setNu] = useState({ username: '', password: '', role: 'editor' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editPw, setEditPw] = useState('');
  const [editRole, setEditRole] = useState('editor');

  const isOwner = getRole() === 'owner';
  const [oc, setOc] = useState({ current_password: '', new_username: '', new_password: '' });
  const [ocBusy, setOcBusy] = useState(false);

  const [activityUser, setActivityUser] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const openActivity = async (u) => {
    setActivityUser(u);
    setActivity(null);
    setActivityLoading(true);
    try {
      const res = await api.get(`/admin/users/${encodeURIComponent(u.username)}/activity`);
      setActivity(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not load activity.');
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => { setOc((o) => ({ ...o, new_username: getUsername() })); }, []);

  const saveOwnerCreds = async () => {
    if (!oc.current_password) { toast.error('Enter your current password to confirm.'); return; }
    const body = { current_password: oc.current_password };
    const u = (oc.new_username || '').trim();
    if (u && u !== getUsername()) body.new_username = u;
    if (oc.new_password) body.new_password = oc.new_password;
    if (!body.new_username && !body.new_password) { toast.error('Change the username or password first.'); return; }
    setOcBusy(true);
    try {
      const res = await api.put('/admin/owner-credentials', body);
      if (res.data?.token) setSession({ token: res.data.token, role: 'owner', username: res.data.username });
      toast.success('Master admin credentials updated.');
      setOc({ current_password: '', new_username: res.data?.username || getUsername(), new_password: '' });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not update credentials.');
    } finally {
      setOcBusy(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.users || []);
    } catch (e) {
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!nu.username.trim() || !nu.password) { toast.error('Username and password are required.'); return; }
    setBusy(true);
    try {
      await api.post('/admin/users', { username: nu.username.trim(), password: nu.password, role: nu.role });
      toast.success(`User "${nu.username.trim()}" created.`);
      setNu({ username: '', password: '', role: 'editor' });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not create user.');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (u) => { setEditing(u); setEditPw(''); setEditRole(u.role); };

  const saveEdit = async () => {
    const body = {};
    if (editPw) body.password = editPw;
    if (editRole !== editing.role) body.role = editRole;
    if (Object.keys(body).length === 0) { toast.error('Nothing to change.'); return; }
    setBusy(true);
    try {
      await api.put(`/admin/users/${editing.username}`, body);
      toast.success('User updated.');
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"?`)) return;
    try {
      await api.delete(`/admin/users/${u.username}`);
      toast.success(`Removed ${u.username}.`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Delete failed.');
    }
  };

  if (loading) return <div className="py-10 text-center text-slate-500">Loading users\u2026</div>;

  return (
    <div className="grid gap-6" data-testid="admin-users">
      {isOwner && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-6" data-testid="owner-creds-card">
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" /> Master Admin Credentials
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Change your own master login. Enter your current password to confirm. You stay signed in after saving.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs text-slate-600">New username</Label>
              <Input value={oc.new_username} onChange={(e) => setOc({ ...oc, new_username: e.target.value })} placeholder="owner" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="owner-new-username" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">New password (leave blank to keep)</Label>
              <Input type="text" value={oc.new_password} onChange={(e) => setOc({ ...oc, new_password: e.target.value })} placeholder="new password" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="owner-new-password" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Current password</Label>
              <Input type="password" value={oc.current_password} onChange={(e) => setOc({ ...oc, current_password: e.target.value })} placeholder="confirm current" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="owner-current-password" />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={saveOwnerCreds} disabled={ocBusy} className="h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white" data-testid="owner-creds-save">
              <KeyRound className="h-4 w-4 mr-2" /> {ocBusy ? 'Saving\u2026' : 'Update Master Login'}
            </Button>
          </div>
        </div>
      )}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#EF4444]" /> Create User
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">Editors can change everything; View Only users can browse but cannot make changes.</p>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs text-slate-600">Username</Label>
              <Input value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} placeholder="e.g. mike" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="user-new-username" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Password</Label>
              <Input type="text" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="set a password" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="user-new-password" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Role</Label>
              <Select value={nu.role} onValueChange={(v) => setNu({ ...nu, role: v })}>
                <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200" data-testid="user-new-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="view_only">View Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={create} disabled={busy} className="h-10 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="user-create-button">
              {busy ? 'Saving\u2026' : 'Add User'}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-slab font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500" /> Team Members
        </div>
        <div className="divide-y divide-slate-100">
          {users.map((u) => (
            <div
              key={u.username}
              className={`flex items-center justify-between px-5 py-3 ${isOwner ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}`}
              onClick={isOwner ? () => openActivity(u) : undefined}
              data-testid={`user-row-${u.username}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-900">{u.username}</span>
                <RoleBadge role={u.role} />
                {isOwner && <span className="text-xs text-slate-400 hidden sm:inline">· click to view history</span>}
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {canEdit && !u.is_owner && (
                  <>
                    <Button variant="outline" size="sm" className="rounded-lg border-slate-200" onClick={() => openEdit(u)} data-testid={`user-edit-${u.username}`}>
                      <KeyRound className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <button onClick={() => remove(u)} className="text-slate-400 hover:text-red-600 transition-colors" data-testid={`user-delete-${u.username}`} aria-label={`Delete ${u.username}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
                {u.is_owner && <span className="text-xs text-slate-400">Master account</span>}
                {isOwner && <ChevronRight className="h-4 w-4 text-slate-300" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity history (master only) */}
      <Dialog open={!!activityUser} onOpenChange={(o) => !o && setActivityUser(null)}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" data-testid="user-activity-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#0F1B3D]" /> Activity — {activityUser?.username}
            </DialogTitle>
          </DialogHeader>
          {activityLoading ? (
            <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : activity ? (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 p-3 text-center">
                  <div className="text-xs text-slate-500">Logins</div>
                  <div className="text-xl font-extrabold text-[#0F1B3D]" data-testid="activity-login-count">{activity.login_count}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 text-center">
                  <div className="text-xs text-slate-500">Changes</div>
                  <div className="text-xl font-extrabold text-[#0F1B3D]" data-testid="activity-change-count">{activity.change_count}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 text-center">
                  <div className="text-xs text-slate-500">Last login</div>
                  <div className="text-[11px] font-semibold text-slate-700 mt-1">{fmtWhen(activity.last_login)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5">
                  <LogIn className="h-3.5 w-3.5" /> Login History
                </div>
                {activity.logins.length === 0 ? (
                  <p className="text-sm text-slate-400" data-testid="activity-no-logins">No logins recorded yet.</p>
                ) : (
                  <div className="space-y-1.5" data-testid="activity-logins">
                    {activity.logins.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-1.5">
                        <span className="text-slate-700">{fmtWhen(r.at)}</span>
                        <span className="text-xs text-slate-400 truncate max-w-[180px]" title={r.user_agent}>{r.ip || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Change History
                </div>
                {activity.changes.length === 0 ? (
                  <p className="text-sm text-slate-400" data-testid="activity-no-changes">No changes recorded yet.</p>
                ) : (
                  <div className="space-y-1.5" data-testid="activity-changes">
                    {activity.changes.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-1.5">
                        <span className="text-slate-800 font-medium">{r.action}</span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">{fmtWhen(r.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityUser(null)} className="rounded-lg">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="user-edit-dialog">
          <DialogHeader><DialogTitle>Edit {editing?.username}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="text-xs text-slate-600">New password (leave blank to keep)</Label>
              <Input type="text" value={editPw} onChange={(e) => setEditPw(e.target.value)} placeholder="new password" className="mt-1 h-10 rounded-lg border-slate-200" data-testid="user-edit-password" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200" data-testid="user-edit-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="view_only">View Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-lg">Cancel</Button>
            <Button onClick={saveEdit} disabled={busy} className="rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="user-edit-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
