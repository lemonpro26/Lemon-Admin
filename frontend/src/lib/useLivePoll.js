import React, { useEffect, useRef } from 'react';

// Calls `fn` every intervalMs while the browser tab is visible, and once
// immediately whenever the tab regains focus. Used for live-updating the
// admin Calls/Leads lists without a manual refresh.
export function useLivePoll(fn, { intervalMs = 30000, enabled = true } = {}) {
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; });

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => { if (!document.hidden) saved.current(); };
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (!document.hidden) saved.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}

// Small pulsing "Live" indicator.
export const LiveBadge = ({ label = 'Live' }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600" data-testid="live-badge">
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
    {label}
  </span>
);
