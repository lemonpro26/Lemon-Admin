import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { getSessionId } from '@/lib/tracking';

// Split-test entry point. Point a campaign at `/split` (or `/split2`, `/split3`,
// or a custom slug) and visitors are routed to one of that test's variant pages
// per its weights (stable per visitor). The chosen experiment id + variant are
// appended as `se`/`sv` so the destination page stamps them on the click/lead —
// that's how Split Test stats count ONLY traffic that came through here.
export default function SplitEntry() {
  const navigate = useNavigate();
  const { splitSlug } = useParams();
  const slug = (splitSlug || 'split').toLowerCase();

  useEffect(() => {
    const go = (target, se, sv) => {
      const params = new URLSearchParams(window.location.search || '');
      if (se) params.set('se', se);
      if (sv) params.set('sv', sv);
      const qs = params.toString();
      let path = target && target.startsWith('/') ? target : '/';
      if (!path.endsWith('/')) path += '/';  // land on /tm2/?... for URL consistency
      navigate(`${path}${qs ? `?${qs}` : ''}`, { replace: true });
    };
    api
      .get('/split/decide', { params: { slug, session: getSessionId() } })
      .then((res) => go(res.data?.target || '/', res.data?.experiment_id, res.data?.variant))
      .catch(() => go('/'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-white" data-testid="split-entry">
      <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-[#0F1B3D] animate-spin" />
    </div>
  );
}
