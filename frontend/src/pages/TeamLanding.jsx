import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, Scale, Star, DollarSign, ShieldCheck, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { captureTracking, getSessionId } from '@/lib/tracking';
import { useFunnel } from '@/context/FunnelContext';
import { trackPhoneCallConversion } from '@/lib/analytics';
import { COMPANY } from '@/lib/siteContent';
import { Logo } from '@/components/Logo';

// Real attorney team photos (full group — never cropped so every attorney shows).
const TEAM_PHOTO_STONE =
  'https://customer-assets.emergentagent.com/job_lemon-checker/artifacts/ig42ohpr_2-final-raw_DSC_2637.webp';
const TEAM_PHOTO_CORRIDOR =
  'https://customer-assets.emergentagent.com/job_lemon-checker/artifacts/xjft40qq_2-final-raw_DSC_2651.webp';

// Shared behaviour: capture tracking on mount + a helper to start the funnel.
function useTeamFunnel({ sourcePage, phone, phoneHref }) {
  const navigate = useNavigate();
  const { setAnswer, resetAnswers } = useFunnel();

  useEffect(() => {
    const t = captureTracking(window.location.search);
    api.post('/track/click', {
      session_id: getSessionId(),
      landing_path: window.location.pathname,
      source_page: sourcePage,
      campaign_id: t.campaign_id, adgroup_id: t.adgroup_id, ad_id: t.ad_id,
      keyword: t.keyword, gclid: t.gclid, gbraid: t.gbraid, wbraid: t.wbraid,
      referrer: t.referrer, feeditemid: t.feeditemid, extensionid: t.extensionid,
      split_experiment_id: t.split_experiment_id, split_variant: t.split_variant,
      params: t.params,
    }).catch(() => {});
  }, [sourcePage]);

  const start = () => {
    resetAnswers();
    setAnswer('started', '1');
    setAnswer('source_page', sourcePage);
    setAnswer('entry_phone', phone);
    setAnswer('entry_phone_href', phoneHref);
    api.post('/track/engage', { session_id: getSessionId() }).catch(() => {});
    navigate('/flow/year');
  };

  return { start, navigate };
}

const TRUST = [
  { icon: Scale, top: 'NO WIN', bottom: 'NO FEE' },
  { icon: Star, top: '5-STAR', bottom: 'RATED' },
  { icon: DollarSign, top: 'MILLIONS', bottom: 'RECOVERED' },
];

const TrustBadges = ({ light = false }) => (
  <div className="flex items-center justify-center gap-6 sm:gap-10" data-testid="team-trust-badges">
    {TRUST.map((b) => {
      const Icon = b.icon;
      return (
        <div key={b.top} className={`flex flex-col items-center justify-center h-20 w-20 sm:h-24 sm:w-24 rounded-full border-2 ${light ? 'border-white/70 text-white' : 'border-[#0B2545]/30 text-[#0B2545]'}`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-[#FACC15]" />
          <span className="mt-1 text-[9px] sm:text-[10px] font-extrabold leading-none tracking-wide text-center">{b.top}</span>
          <span className="text-[9px] sm:text-[10px] font-extrabold leading-none tracking-wide text-center">{b.bottom}</span>
        </div>
      );
    })}
  </div>
);

function TeamFooter({ phone, phoneHref, goLegal }) {
  return (
    <footer className="border-t border-white/10 bg-[#0B2545] text-slate-300">
      <div className="max-w-5xl mx-auto px-4 py-8 text-center space-y-4">
        <p className="font-slab font-extrabold text-white text-lg">The Lemon Pros</p>
        <p className="text-sm text-slate-300">{COMPANY.address}</p>
        <a href={phoneHref} onClick={trackPhoneCallConversion} className="text-sm font-semibold text-[#FACC15] hover:text-white" data-testid="team-footer-call">{phone}</a>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
          <button type="button" onClick={() => goLegal('/terms')} className="hover:text-white transition-colors" data-testid="team-footer-terms">Terms of Use</button>
          <button type="button" onClick={() => goLegal('/do-not-sell')} className="hover:text-white transition-colors" data-testid="team-footer-dns">Do Not Sell My Info</button>
          <button type="button" onClick={() => goLegal('/privacy')} className="hover:text-white transition-colors" data-testid="team-footer-privacy">Privacy</button>
          <button type="button" onClick={() => goLegal('/contact')} className="hover:text-white transition-colors" data-testid="team-footer-contact">Contact Us</button>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl mx-auto">
          Attorney Advertising. This website is for general informational purposes and does not constitute legal advice.
          Contacting The Lemon Pros does not create an attorney-client relationship. Prior results do not guarantee a
          similar outcome. Case evaluations are free and there is no fee unless we win.
        </p>
        <p className="text-xs text-slate-500">©{new Date().getFullYear()} The Lemon Pros. All rights reserved. Attorney advertising.</p>
      </div>
    </footer>
  );
}

const CallButton = ({ phone, phoneHref, dark = false }) => (
  <a
    href={phoneHref}
    onClick={trackPhoneCallConversion}
    data-testid="team-header-call"
    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 sm:px-5 sm:py-2.5 font-bold text-sm sm:text-base transition-colors ${dark ? 'bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/30' : 'bg-[#0B2545] hover:bg-[#0a1e3a] text-white'}`}
  >
    <Phone className="h-4 w-4 text-[#FACC15]" /> Call {phone}
  </a>
);

// ---------------------------------------------------------------------------
// /tm — Full-bleed overlay hero. The team photo renders at natural height
// (w-full h-auto) so EVERY attorney is always visible, never cropped.
// ---------------------------------------------------------------------------
export function TeamOverlay({ sourcePage = 'tm', phone = COMPANY.phone, phoneHref = COMPANY.phoneHref, rootTestId = 'team-overlay-page' } = {}) {
  const { start, navigate } = useTeamFunnel({ sourcePage, phone, phoneHref });
  return (
    <div className="min-h-[100dvh] bg-[#0B2545] font-sans" data-testid={rootTestId}>
      <div className="relative">
        {/* Full team photo — natural aspect, so nobody is cut off */}
        <img src={TEAM_PHOTO_STONE} alt="The Lemon Pros attorney team" className="w-full h-auto object-contain bg-[#0B2545]" data-testid="team-overlay-photo" />
        {/* Gradient for text legibility (bottom + left) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B2545] via-[#0B2545]/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B2545]/80 via-transparent to-transparent" />

        {/* Header */}
        <header className="absolute top-0 inset-x-0 z-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
            <Logo size="sm" light />
            <CallButton phone={phone} phoneHref={phoneHref} dark />
          </div>
        </header>

        {/* Hero text */}
        <div className="absolute inset-x-0 bottom-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-6 sm:pb-10">
            <h1 className="font-slab font-extrabold uppercase text-white leading-[0.95] text-4xl sm:text-6xl lg:text-7xl tracking-tight" data-testid="team-overlay-headline">
              We Fight<br />For You
            </h1>
            <div className="h-1.5 w-40 sm:w-56 bg-[#FACC15] rounded-full mt-2" />
            <p className="mt-4 text-white/90 text-lg sm:text-2xl max-w-xl font-medium">
              California's dedicated lemon law team — no fees unless we win.
            </p>
            <button
              onClick={start}
              data-testid="team-overlay-cta"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FACC15] hover:bg-[#eabf08] text-[#0B2545] font-extrabold text-lg px-8 py-4 shadow-lg shadow-black/20 transition-colors"
            >
              See If You Qualify <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Trust strip */}
      <div className="bg-[#0B2545] py-8">
        <TrustBadges light />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-300 px-4">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> 100% Free &amp; Confidential</span>
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-emerald-400" /> Takes 60 Seconds</span>
          <span className="flex items-center gap-1.5"><Scale className="h-4 w-4 text-emerald-400" /> No Win, No Fee</span>
        </div>
      </div>

      <TeamFooter phone={phone} phoneHref={phoneHref} goLegal={navigate} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// /tm2 — Split layout. Navy copy panel on the left, team photo on the right.
// object-cover only trims ceiling/floor, so all attorneys stay in frame.
// ---------------------------------------------------------------------------
export function TeamSplit({ sourcePage = 'tm2', phone = COMPANY.phone, phoneHref = COMPANY.phoneHref, rootTestId = 'team-split-page' } = {}) {
  const { start, navigate } = useTeamFunnel({ sourcePage, phone, phoneHref });
  const NAV = ['About', 'Results', 'Cases'];
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans flex flex-col" data-testid={rootTestId}>
      {/* Top bar: navy logo block + white nav */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto flex items-stretch">
          <div className="bg-[#0B2545] px-5 sm:px-7 py-4 flex items-center">
            <Logo size="sm" light />
          </div>
          <nav className="flex-1 flex items-center justify-end gap-5 sm:gap-8 px-4 sm:px-6">
            {NAV.map((n) => (
              <button key={n} onClick={start} className="hidden sm:inline text-slate-700 font-semibold hover:text-[#0B2545] transition-colors" data-testid={`team-nav-${n.toLowerCase()}`}>{n}</button>
            ))}
            <CallButton phone={phone} phoneHref={phoneHref} />
          </nav>
        </div>
      </header>

      {/* Split hero */}
      <section className="flex-1">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 items-stretch bg-white md:rounded-b-3xl overflow-hidden shadow-sm">
          {/* Left navy panel */}
          <div className="bg-[#0B2545] text-white px-6 sm:px-10 py-10 sm:py-16 flex flex-col justify-center">
            <h1 className="font-slab font-extrabold uppercase leading-[0.95] text-4xl sm:text-5xl lg:text-6xl tracking-tight" data-testid="team-split-headline">
              We Fight<br />
              <span className="inline-block bg-[#FACC15] text-[#0B2545] px-2 leading-tight mt-1">For You</span>
            </h1>
            <p className="mt-6 text-white/90 text-lg sm:text-xl max-w-md">
              Meet the attorney team taking on the automakers for California drivers.
            </p>
            <button
              onClick={start}
              data-testid="team-split-cta"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#FACC15] hover:bg-[#eabf08] text-[#0B2545] font-extrabold text-lg px-8 py-4 shadow-lg shadow-black/20 transition-colors w-fit"
            >
              Check Your Vehicle <ArrowRight className="h-5 w-5" />
            </button>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> 100% Free</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-emerald-400" /> 60 Seconds</span>
              <span className="flex items-center gap-1.5"><Scale className="h-4 w-4 text-emerald-400" /> No Win, No Fee</span>
            </div>
          </div>
          {/* Right team photo — all attorneys stay in frame (cover trims only floor/ceiling) */}
          <div className="relative min-h-[280px] md:min-h-[520px] bg-slate-100">
            <img src={TEAM_PHOTO_CORRIDOR} alt="The Lemon Pros attorney team" className="absolute inset-0 h-full w-full object-cover object-center" data-testid="team-split-photo" />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <div className="bg-slate-50 py-10">
        <TrustBadges />
      </div>

      <TeamFooter phone={phone} phoneHref={phoneHref} goLegal={navigate} />
    </div>
  );
}
