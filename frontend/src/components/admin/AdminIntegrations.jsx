import React, { useEffect, useState } from 'react';
import { Webhook, CheckCircle2, XCircle, Mail, Zap, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

function StatusPill({ live }) {
  return live ? (
    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 gap-1" data-testid="integration-status-live">
      <CheckCircle2 className="h-3.5 w-3.5" /> Live
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-500 border border-slate-200 gap-1" data-testid="integration-status-off">
      <XCircle className="h-3.5 w-3.5" /> Not configured
    </Badge>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className={`text-sm text-slate-900 text-right break-all ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

export const AdminIntegrations = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/admin/integrations')
      .then((res) => setData(res.data))
      .catch(() => toast.error('Failed to load integration status.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading integrations…</div>;
  if (!data) return null;

  const lp = data.lead_posting;
  const em = data.email;

  const copyFields = async () => {
    try {
      await navigator.clipboard.writeText((lp.fields || []).join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) { /* noop */ }
  };

  return (
    <div className="grid gap-5" data-testid="admin-integrations">
      {/* Lead posting / CRM webhook */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" data-testid="integration-lead-posting">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            {lp.provider === 'Zapier' ? <Zap className="h-5 w-5 text-[#EF4444]" /> : <Webhook className="h-5 w-5 text-[#EF4444]" />}
            Lead Posting {lp.provider ? `· ${lp.provider}` : ''}
          </h2>
          <StatusPill live={lp.live} />
        </div>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Every completed funnel lead is POSTed in real time to your webhook. Runs in the background — it
          never slows the visitor, and if the webhook is down the lead is still saved here.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-1">
          <Row label="Endpoint" value={lp.url_masked || '—'} mono />
          <Row label="Method" value={lp.method} />
          <Row label="Source tag" value={<code className="px-1.5 py-0.5 bg-yellow-50 border border-yellow-200 rounded">{lp.source_tag}</code>} />
          <Row label="Leads received" value={lp.total_leads} />
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fields sent</span>
            <button onClick={copyFields} className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-900" data-testid="integration-copy-fields">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(lp.fields || []).map((f) => (
              <span key={f} className="text-xs font-mono px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Email service */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" data-testid="integration-email">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-slab font-bold text-lg text-slate-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#EF4444]" /> Email Service (SMTP)
          </h2>
          <StatusPill live={em.live} />
        </div>
        {em.live ? (
          <>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              Lead-alert and thank-you emails are sending through your mail server.
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-1">
              <Row label="SMTP host" value={em.host} mono />
              <Row label="Port" value={em.port} />
              <Row label="From" value={`${em.sender_name} <${em.sender_email}>`} />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 mt-1">
            Not connected yet. Provide your website email (SMTP) credentials and emails will start sending
            automatically — leads are still captured and posted to your webhook in the meantime.
          </p>
        )}
      </div>
    </div>
  );
};
