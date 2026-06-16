import React from 'react';
import { Outlet } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SuburbanBand } from '@/components/SuburbanBand';

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
  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden bg-white safe-top safe-bottom"
      data-testid="public-shell"
    >
      <SiteHeader />

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
