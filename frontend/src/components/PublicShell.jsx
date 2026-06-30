import React from 'react';
import { Outlet } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

// Mint "flowing waves" brand background (matches thelemonpros.com palette).
const MINT_BG =
  'https://static.prod-images.emergentagent.com/jobs/77f40ca2-be7c-4af1-a571-bc3da13d847f/images/2354d67e25ac2009a893eb7ff98795fec2d63e2e564ed117a6805925cb0b29ca.png';

/**
 * Persistent public layout. A soft mint flowing-waves scene fills the stage as
 * one continuous background; page content (Landing / funnel steps) layers on
 * top. Locked to the viewport height so the experience fits one screen.
 */
export default function PublicShell() {
  return (
    <div
      className="h-[100dvh] flex flex-col bg-[#E6F1ED] overflow-hidden safe-top safe-bottom"
      data-testid="public-shell"
    >
      <SiteHeader />

      <div className="relative flex-1 overflow-hidden bg-[#E6F1ED]">
        <img
          src={MINT_BG}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover z-0"
        />
        <div className="relative z-10 h-full overflow-y-auto">
          <Outlet />
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
