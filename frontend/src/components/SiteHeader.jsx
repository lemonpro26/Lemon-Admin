import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Phone, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { COMPANY } from '@/lib/siteContent';
import { trackPhoneCallConversion } from '@/lib/analytics';
import { STEP_IDS } from '@/lib/funnel';

/**
 * Bindright-style navy header. Logo is absolutely centered so the side widths
 * never shift it. Funnel-aware: shows a Back control + a thin progress bar while
 * the visitor is inside the funnel; otherwise shows the "safe & secure" line.
 * The phone number (right) fires the click-to-call conversion.
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
    <header className="relative shrink-0 h-16 bg-[#0F1B3D] text-white flex items-center justify-between px-4 sm:px-8 z-40">
      {inFunnel ? (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          data-testid="header-back-button"
          className="flex items-center gap-1 text-sm font-semibold text-white hover:text-[#FACC15] transition-colors focus:outline-none"
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
      ) : (
        <div className="hidden sm:flex items-center gap-2 text-sm sm:text-base font-semibold text-white min-w-0">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>Your information is safe and secure</span>
        </div>
      )}
      {!inFunnel && (
        <div className="sm:hidden flex items-center gap-1.5 text-xs font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Secure</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        data-testid="site-header-logo"
        aria-label="Lemon Pros home"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
      >
        <Logo size="md" light />
      </button>

      <a
        href={COMPANY.phoneHref}
        onClick={trackPhoneCallConversion}
        data-testid="header-call-link"
        aria-label={`Call Lemon Pros at ${COMPANY.phone}`}
        className="flex items-center gap-2 text-base sm:text-2xl font-extrabold text-white hover:text-[#FACC15] transition-colors whitespace-nowrap"
      >
        <Phone className="h-5 w-5 sm:h-6 sm:w-6" />
        <span className="hidden xs:inline sm:inline">{COMPANY.phone}</span>
      </a>

      {inFunnel && (
        <div
          className="absolute left-0 bottom-0 h-1 bg-[#EF4444] transition-all duration-300"
          style={{ width: `${pct}%` }}
          data-testid="funnel-progress"
        />
      )}
    </header>
  );
};
