import React from 'react';
import { Outlet } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { HERO_IMG } from '@/components/MockupShell';

/**
 * Persistent public layout (bindright-style). The smooth highway+sky scene fills
 * the stage as one continuous background; page content (Landing / funnel steps)
 * layers on top. Locked to the viewport height so the experience fits one screen.
 */
export default function PublicShell() {
  return (
    <div
      className="h-[100dvh] flex flex-col bg-[#86CFFD] overflow-hidden safe-top safe-bottom"
      data-testid="public-shell"
    >
      <SiteHeader />

      <div className="relative flex-1 overflow-hidden bg-[#86CFFD]">
        <img
          src={HERO_IMG}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-bottom z-0"
        />
        <div className="relative z-10 h-full overflow-y-auto">
          <Outlet />
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
