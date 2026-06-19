import React, { useEffect, useState, useCallback } from 'react';
import { Phone, RefreshCw, Trash2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, canEdit as canEditFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { DateRangeFilter, todayRange } from '@/components/admin/DateRangeFilter';

const fmtDuration = (s) => {
  const n = Number(s) || 0;
  const m = Math.floor(n / 60);
  const sec = n % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export const AdminCalls = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(todayRange());
  const editable = canEditFn();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/calls', { params: { start: range.start, end: range.end } });
      setCalls(res.data?.calls || []);
    } catch (e) {
      toast.error('Failed to load calls.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const deleteCall = async (c) => {
    if (!window.confirm(`Delete call from ${c.caller_number || 'unknown'}?`)) return;
    try {
      await api.delete(`/admin/calls/${c.id}`);
      toast.success('Call deleted.');
      load();
    } catch (e) {
      toast.error('Could not delete call.');
    }
  };

  return (
    <div className="grid gap-4" data-testid="admin-calls">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Phone className="h-4 w-4" /> Inbound calls from CallTrackingMetrics, with ad attribution.
        </p>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <Button variant="outline" size="sm" onClick={load} className="rounded-xl border-slate-200" data-testid="calls-refresh">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Caller</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="hidden md:table-cell">Campaign</TableHead>
              <TableHead className="hidden md:table-cell">Keyword</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">Loading…</TableCell></TableRow>
            ) : calls.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10" data-testid="calls-empty">No calls in this period yet.</TableCell></TableRow>
            ) : calls.map((c) => (
              <TableRow key={c.id} data-testid={`call-row-${c.id}`}>
                <TableCell className="font-medium text-slate-900">{c.caller_name || '—'}</TableCell>
                <TableCell className="text-slate-700">{c.caller_number || '—'}</TableCell>
                <TableCell className="text-slate-700">{fmtDuration(c.duration)}</TableCell>
                <TableCell className="hidden md:table-cell text-slate-600">{c.campaign || '—'}</TableCell>
                <TableCell className="hidden md:table-cell text-slate-600">{c.keyword || '—'}</TableCell>
                <TableCell className="hidden lg:table-cell text-slate-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</TableCell>
                <TableCell className="text-slate-600 whitespace-nowrap">{fmtDate(c.called_at || c.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {c.recording_url && (
                      <a href={c.recording_url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800" title="Play recording" data-testid={`call-recording-${c.id}`}>
                        <PlayCircle className="h-5 w-5" />
                      </a>
                    )}
                    {editable && (
                      <Button variant="outline" size="sm" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 px-2" onClick={() => deleteCall(c)} data-testid={`call-delete-${c.id}`} title="Delete call">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
