import React, { useEffect, useState, useCallback } from 'react';
import { Mail, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const TOKENS = ['{first_name}', '{last_name}', '{service}', '{issue}', '{address}', '{city}', '{state}'];

export const AdminEmailTemplate = ({ canEdit }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/email-template');
      setSubject(res.data.thank_you_subject || '');
      setBody(res.data.thank_you_body || '');
    } catch (e) {
      toast.error('Failed to load the email template.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/email-template', { thank_you_subject: subject, thank_you_body: body });
      toast.success('Thank-you email saved.');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo.trim())) { toast.error('Enter a valid email.'); return; }
    setSending(true);
    try {
      await api.post('/admin/email-template/test', { to: testTo.trim() });
      toast.success(`Test thank-you email sent to ${testTo.trim()}.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Test failed.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-slate-500">Loading template\u2026</div>;

  return (
    <div className="grid gap-6" data-testid="admin-email-template">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
          <Mail className="h-5 w-5 text-[#EF4444]" /> Customer Thank-You Email
        </h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">This is the confirmation email customers receive after submitting the funnel.</p>

        <div className="grid gap-4">
          <div>
            <Label className="text-xs text-slate-600">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} className="mt-1 h-11 rounded-xl border-slate-200" data-testid="email-subject-input" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit} rows={12} className="mt-1 rounded-xl border-slate-200 font-mono text-sm leading-relaxed" data-testid="email-body-input" />
            <p className="text-xs text-slate-500 mt-2">
              Available tokens:{' '}
              {TOKENS.map((t) => (
                <code key={t} className="mx-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{t}</code>
              ))}
              . Blank lines become new paragraphs.
            </p>
          </div>
          {canEdit && (
            <div>
              <Button onClick={save} disabled={saving} className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="email-save-button">
                <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving\u2026' : 'Save Template'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-slab font-bold text-base text-slate-900 flex items-center gap-2">
            <Send className="h-4 w-4 text-[#EF4444]" /> Send a Test
          </h3>
          <p className="text-sm text-slate-500 mt-1 mb-3">Sends this thank-you email (with sample data) to an address you choose.</p>
          <div className="flex gap-2">
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@email.com" className="h-11 rounded-xl border-slate-200" data-testid="email-test-input" />
            <Button onClick={sendTest} disabled={sending} variant="outline" className="h-11 rounded-xl border-slate-200 shrink-0" data-testid="email-test-button">
              {sending ? 'Sending\u2026' : 'Send Test'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
