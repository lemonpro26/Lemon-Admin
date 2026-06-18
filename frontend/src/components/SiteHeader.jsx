import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Phone } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { COMPANY } from '@/lib/siteContent';
import { trackPhoneCallConversion } from '@/lib/analytics';
import { STEP_IDS } from '@/lib/funnel';

/**
 * Funnel-aware header. On funnel steps it shows a back arrow (top-left) that
 * lets the user step backwards through the funnel (and back to the start), and
 * a progress bar (top-right) that fills as the funnel advances. The logo stays
 * centered. A bottom border separates the header from the content.
 */
export const SiteHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const match = location.pathname.match(/^\/flow\/(.+)$/);
  const stepId = match ? match[1] : null;
  const index = stepId ? STEP_IDS.indexOf(stepId) : -1;
  const inFunnel = index >= 0;
  const total = STEP_IDS.length;
  const pct = inFunnel ? Math.round(((index + 1) / total) * 100) : 0;

  const goBack = () => {
    if (index > 0) navigate(`/flow/${STEP_IDS[index - 1]}`);
    else navigate('/');
  };

  return (
    <header className={`shrink-0 h-[clamp(52px,7.5vh,68px)] bg-white border-b border-slate-200 relative flex items-center px-4 z-40 ${inFunnel ? 'justify-center' : 'justify-start sm:justify-center'}`}>
      {/* Left: back arrow (funnel only) */}
      {inFunnel && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          data-testid="header-back-button"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Center: logo */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex items-center focus:outline-none"
        data-testid="site-header-logo"
        aria-label="Lemon Pros home"
      >
        <Logo size="md" />
      </button>

      {/* Right: progress bar (funnel only) */}
      {inFunnel && (
        <div
          className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 flex items-center gap-2"
          data-testid="header-progress"
        >
          <div className="h-2 w-[clamp(72px,18vw,160px)] rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-[#EF4444] rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
              data-testid="header-progress-fill"
            />
          </div>
          <span className="text-xs font-medium text-slate-400 hidden sm:inline" data-testid="header-progress-label">
            {index + 1}/{total}
          </span>
        </div>
      )}

      {/* Right: click-to-call (landing / non-funnel pages) */}
      {!inFunnel && (
        <a
          href={COMPANY.phoneHref}
          onClick={trackPhoneCallConversion}
          className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold px-3 py-2 text-xs sm:text-sm shadow-[0_6px_16px_rgba(239,68,68,0.30)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          data-testid="header-call-button"
          aria-label={`Call Lemon Pros at ${COMPANY.phone}`}
        >
          <Phone className="h-4 w-4" />
          <span className="whitespace-nowrap">{COMPANY.phone}</span>
        </a>
      )}
    </header>
  );
};
