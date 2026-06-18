import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SuburbanBand } from '@/components/SuburbanBand';
import { COMPANY } from '@/lib/siteContent';
import { trackPhoneCallConversion } from '@/lib/analytics';
import { STEP_IDS } from '@/lib/funnel';

/**
 * Persistent public layout. The SuburbanBand (houses illustration) lives here
 * so it stays FIXED and never re-renders / moves as the visitor advances
 * through the funnel steps. The whole shell is locked to the viewport height
 * (100dvh) so Landing + every funnel step fit on one screen without page
 * scroll on both desktop and mobile.
 *
 * Background is pure white. A thin divider line sits above the houses band to
 * separate the decorative footer scene from the content area.
 */
export default function PublicShell() {
  const location = useLocation();
  const m = location.pathname.match(/^\/flow\/(.+)$/);
  const inFunnel = !!(m && STEP_IDS.includes(m[1]));

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden bg-white safe-top safe-bottom"
      data-testid="public-shell"
    >
      <SiteHeader />

      {/* Click-to-call strip — sits just under the header divider line during the funnel. */}
      {inFunnel && (
        <div className="shrink-0 flex justify-end items-center px-4 sm:px-5 py-1.5 bg-white border-b border-slate-100">
          <a
            href={COMPANY.phoneHref}
            onClick={trackPhoneCallConversion}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#EF4444] hover:text-[#DC2626] transition-colors focus:outline-none"
            data-testid="flow-call-link"
            aria-label={`Call Lemon Pros at ${COMPANY.phone}`}
          >
            <Phone className="h-3.5 w-3.5" /> Call {COMPANY.phone}
          </a>
        </div>
      )}

      {/* Stage: holds the fixed houses band and the scrollable page content. */}
      <div className="relative flex-1 overflow-hidden bg-white">
        {/* Fixed houses band: smaller on mobile via clamp, stays put across steps.
            The top border is the divider line that separates it from content. */}
        <SuburbanBand className="pointer-events-none absolute bottom-0 left-0 w-full h-[clamp(72px,13vh,150px)] border-t border-slate-200 z-0" />

        {/* Page content (overlays band). Scroll-safety only if content truly overflows. */}
        <div className="relative z-10 h-full overflow-y-auto">
          <Outlet />
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
