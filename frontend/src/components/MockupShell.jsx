import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Phone, ChevronLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { COMPANY } from '@/lib/siteContent';

export const HERO_IMG =
  'https://static.prod-images.emergentagent.com/jobs/77f40ca2-be7c-4af1-a571-bc3da13d847f/images/949141c21ff080491a9737d4095f5c83e03163b543157750cd79f3ab13857f70.png';

const FOOTER_LINKS = [
  { label: 'Terms of Use', to: '/terms' },
  { label: 'Do Not Sell My Info', to: '/do-not-sell' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Contact Us', to: '/contact' },
];

// Shared navy-header shell for the bindright-style mockup (home + funnel).
// roadHeight controls how much of the highway illustration shows at the bottom.
export const MockupShell = ({ children, onBack, progress = null }) => {
  const navigate = useNavigate();
  const year = new Date().getFullYear();

  return (
    <div className="h-[100dvh] flex flex-col bg-[#A2DBF9] overflow-hidden" data-testid="mockup-shell">
      {/* Navy top bar — logo absolutely centered so side widths never shift it */}
      <header className="relative h-16 bg-[#0F1B3D] text-white flex items-center justify-between px-4 sm:px-8 shrink-0 z-30">
        <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-white min-w-0">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="hidden sm:inline">Your information is safe and secure</span>
          <span className="sm:hidden">Safe &amp; secure</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/mockup')}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
          aria-label="Lemon Pros home"
          data-testid="mockup-logo"
        >
          <Logo size="md" light />
        </button>
        <a
          href={COMPANY.phoneHref}
          className="flex items-center gap-2 text-lg sm:text-2xl font-extrabold text-white hover:text-[#FACC15] transition-colors whitespace-nowrap"
          data-testid="mockup-header-phone"
        >
          <Phone className="h-5 w-5 sm:h-6 sm:w-6" /> {COMPANY.phone}
        </a>
      </header>

      {/* Optional sub-bar: back + progress (funnel) */}
      {(onBack || progress != null) && (
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-8 py-2 bg-white/70 backdrop-blur border-b border-white/60 z-20">
          {onBack ? (
            <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-[#0F1B3D] hover:text-[#EF4444] transition-colors" data-testid="mockup-back">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : <span />}
          {progress != null && (
            <div className="flex items-center gap-2 w-40">
              <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-[#EF4444] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-500 tabular-nums">{progress}%</span>
            </div>
          )}
        </div>
      )}

      {/* Stage: one continuous sky+road scene fills the area, words layer on top */}
      <div className="relative flex-1 overflow-hidden bg-[#A2DBF9]">
        <img
          src={HERO_IMG}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute bottom-0 left-0 w-full h-auto z-0"
        />
        <div className="relative z-10 h-full overflow-y-auto">{children}</div>
      </div>

      {/* Footer — same links as the original site */}
      <footer className="shrink-0 bg-[#0F1B3D] text-slate-300" data-testid="mockup-footer">
        <div className="max-w-6xl mx-auto px-3 min-h-[clamp(34px,5vh,46px)] py-1.5 flex items-center justify-center flex-wrap gap-x-4 gap-y-0.5 text-[11px] sm:text-xs">
          {FOOTER_LINKS.map((l) => (
            <button key={l.to} type="button" onClick={() => navigate(l.to)} className="hover:text-white transition-colors" data-testid={`mockup-footer-${l.to.replace('/', '')}`}>
              {l.label}
            </button>
          ))}
          <span className="text-slate-600" aria-hidden="true">•</span>
          <span className="text-slate-400">©{year} Lemon Pros. All rights reserved. Attorney advertising.</span>
        </div>
      </footer>
    </div>
  );
};
