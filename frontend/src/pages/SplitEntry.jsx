import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { getSessionId } from '@/lib/tracking';

// Split-test entry point. Point a Google Ads campaign at `/split` and visitors
// are routed to Home `/` or the PA advertorial `/pa` per the admin-set weight.
// Tracking query params (gclid, tg_ref, etc.) are preserved on the redirect so
// attribution is never lost. Decision is stable per visitor (seeded by session).
export default function SplitEntry() {
  const navigate = useNavigate();

  useEffect(() => {
    const search = window.location.search || '';
    const go = (target) => {
      const path = target === 'pa' ? '/pa' : '/';
      navigate(`${path}${search}`, { replace: true });
    };
    api
      .get('/split/decide', { params: { session: getSessionId() } })
      .then((res) => go(res.data?.target || 'home'))
      .catch(() => go('home'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center bg-white"
      data-testid="split-entry"
    >
      <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-[#0F1B3D] animate-spin" />
    </div>
  );
}
