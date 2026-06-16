import React, { useEffect, useState, useCallback } from 'react';
import { Mail, Trash2, Plus, Send, Save, CheckCircle2, AlertTriangle, Bell, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

export const AdminNotifications = ({ canEdit = true }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/notifications');
      setData(res.data);
      setTestEmail((res.data.notification_emails || [])[0] || res.data.sender_email || '');
    } catch (e) {
      toast.error('Failed to load notification settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = async (next) => {
    setSaving(true);
    try {
      const res = await api.put('/admin/notifications', {
        notification_emails: next.notification_emails,
        notify_team: next.notify_team,
        send_thank_you: next.send_thank_you,
      });
      setData((p) => ({ ...p, ...res.data }));
      return true;
    } catch (e) {
      toast.error('Could not save settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addEmail = async () => {
    const e = newEmail.trim().toLowerCase();
    if (!isEmail(e)) { toast.error('Enter a valid email address.'); return; }
    if (data.notification_emails.includes(e)) { toast.error('That email is already on the list.'); return; }
    const next = { ...data, notification_emails: [...data.notification_emails, e] };
    if (await persist(next)) { setNewEmail(''); toast.success(`Added ${e}`); }
  };

  const removeEmail = async (e) => {
    const next = { ...data, notification_emails: data.notification_emails.filter((x) => x !== e) };
    if (await persist(next)) toast.success(`Removed ${e}`);
  };

  const toggle = async (key) => {
    const next = { ...data, [key]: !data[key] };
    setData(next);
    if (await persist(next)) toast.success('Settings saved.');
  };

  const sendTest = async () => {
    if (!isEmail(testEmail)) { toast.error('Enter a valid test email.'); return; }
    setSendingTest(true);
    try {
      await api.post('/admin/notifications/test', { to: testEmail });
      toast.success(`Test email sent to ${testEmail}. Check the inbox (and spam).`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Test email failed to send.');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading || !data) {
    return <div className="py-10 text-center text-slate-500">Loading notification settings...</div>;
  }

  return (
    <div className="grid gap-6" data-testid="admin-notifications">
      {/* SMTP status */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-2 text-sm ${data.smtp_configured ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        {data.smtp_configured ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {data.smtp_configured
          ? <span>Email is connected. Sending from <strong>{data.sender_email}</strong>.</span>
          : <span>Email is not configured on the server.</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recipients */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#EF4444]" /> Lead Notification Recipients
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">Everyone here gets an email the moment a new lead is submitted.</p>

          <div className="flex gap-2 mb-4">
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEmail()}
              placeholder="name@email.com"
              disabled={!canEdit}
              className="h-11 rounded-xl border-slate-200"
              data-testid="notif-new-email-input"
            />
            <Button onClick={addEmail} disabled={saving || !canEdit} className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white shrink-0" data-testid="notif-add-email-button">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          <div className="grid gap-2" data-testid="notif-recipients-list">
            {data.notification_emails.length === 0 ? (
              <p className="text-sm text-slate-400 py-3 text-center">No recipients yet. Add one above.</p>
            ) : (
              data.notification_emails.map((e) => (
                <div key={e} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" data-testid={`notif-recipient-${e}`}>
                  <span className="text-sm text-slate-800 truncate">{e}</span>
                  <button onClick={() => removeEmail(e)} disabled={!canEdit} className="text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40 disabled:hover:text-slate-400" data-testid={`notif-remove-${e}`} aria-label={`Remove ${e}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Toggles + test */}
        <div className="grid gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid gap-4">
            <h2 className="font-slab font-bold text-lg text-slate-900">Email Settings</h2>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-slate-500 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900 text-sm">Notify my team on new leads</p>
                  <p className="text-xs text-slate-500">Sends lead details to the recipients list.</p>
                </div>
              </div>
              <Switch checked={data.notify_team} disabled={!canEdit} onCheckedChange={() => toggle('notify_team')} data-testid="notif-toggle-team" />
            </div>
            <div className="border-t border-slate-100" />
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <UserCheck className="h-5 w-5 text-slate-500 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900 text-sm">Send thank-you email to customer</p>
                  <p className="text-xs text-slate-500">Confirmation email to the lead after they submit.</p>
                </div>
              </div>
              <Switch checked={data.send_thank_you} disabled={!canEdit} onCheckedChange={() => toggle('send_thank_you')} data-testid="notif-toggle-thankyou" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
              <Send className="h-5 w-5 text-[#EF4444]" /> Send a Test Email
            </h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">Sends a sample lead notification so you can confirm delivery.</p>
            <div className="flex gap-2">
              <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@email.com" className="h-11 rounded-xl border-slate-200" data-testid="notif-test-input" />
              <Button onClick={sendTest} disabled={sendingTest} variant="outline" className="h-11 rounded-xl border-slate-200 shrink-0" data-testid="notif-send-test-button">
                {sendingTest ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
