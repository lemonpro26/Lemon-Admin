import React, { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { api } from '@/lib/api';

export const AdminPhoneNumbers = () => {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/phone-numbers')
      .then((r) => setNumbers(r.data?.numbers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="grid gap-4" data-testid="admin-phone-numbers">
      <p className="text-sm text-slate-500 flex items-center gap-2">
        <Phone className="h-4 w-4" /> Your tracked call numbers and the landing pages that display each. Calls are grouped by the number dialed.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {loading ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : numbers.map((n) => (
          <div key={n.key} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`phone-number-${n.key}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-slab font-bold text-slate-900 text-lg tracking-tight" data-testid={`phone-number-display-${n.key}`}>{n.display}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-indigo-50 text-indigo-700 px-2 py-1">{n.label}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(n.pages || []).map((p) => (
                <span key={p} className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
