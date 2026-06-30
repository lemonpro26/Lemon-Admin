import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Phone, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { COMPANY } from '@/lib/siteContent';
import { trackPhoneCallConversion } from '@/lib/analytics';
import { STEP_IDS, getActiveStepIds } from '@/lib/funnel';
import { useFunnel } from '@/context/FunnelContext';
import { tr } from '@/lib/i18n';

/**
 * Bindright-style navy header. Logo is absolutely centered so the side widths
 * never shift it. Funnel-aware: shows a Back control + a thin progress bar while
 * the visitor is inside the funnel; otherwise shows the "safe & secure" line.
 * The phone number (right) fires the click-to-call conversion.
 */
export const SiteHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, answers } = useFunnel();
  const t = tr(lang);
  const home = lang === 'es' ? '/sp' : '/';
  const phone = lang === 'es' ? COMPANY.phoneEs : COMPANY.phone;
  const phoneHref = lang === 'es' ? COMPANY.phoneHrefEs : COMPANY.phoneHref;

  const match = location.pathname.match(/^\/flow\/(.+)$/);
  const stepId = match ? match[1] : null;
  const stepIds = getActiveStepIds(answers);
  const index = stepId ? stepIds.indexOf(stepId) : -1;
  const inFunnel = index >= 0;
  const total = stepIds.length;
  const pct = inFunnel ? Math.round(((index + 1) / total) * 100) : 0;

  const goBack = () => {
    if (index > 0) navigate(`/flow/${stepIds[index - 1]}`);
    else navigate(home);
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
          <ChevronLeft className="h-5 w-5" /> {t.header.back}
        </button>
      ) : (
        <div className="hidden sm:flex items-center gap-2 text-sm sm:text-base font-semibold text-white min-w-0">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{t.header.secure}</span>
        </div>
      )}
      {!inFunnel && (
        <div className="sm:hidden flex items-center gap-1.5 text-xs font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{t.header.secureShort}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate(home)}
        data-testid="site-header-logo"
        aria-label="Lemon Pros home"
        className="static translate-x-0 translate-y-0 whitespace-nowrap sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 focus:outline-none"
      >
        <span className="sm:hidden"><Logo size="xs" light hideSubtitle={lang === 'es'} /></span>
        <span className="hidden sm:inline-flex"><Logo size="md" light /></span>
      </button>

      <a
        href={phoneHref}
        onClick={trackPhoneCallConversion}
        data-testid="header-call-link"
        aria-label={`Call Lemon Pros at ${phone}`}
        className="flex flex-col items-center justify-center leading-none rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white px-2.5 py-1.5 sm:px-5 sm:py-2 transition-colors shadow-sm"
      >
        <span className="flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-xl font-extrabold whitespace-nowrap">
          <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
          <span>{phone}</span>
        </span>
        <span
          data-testid="header-call-now-label"
          className="mt-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.15em] text-white/90"
        >
          {t.header.callNow}
        </span>
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
