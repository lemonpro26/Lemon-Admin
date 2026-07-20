import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, MapPin, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { captureTracking, getSessionId } from '@/lib/tracking';
import { useFunnel } from '@/context/FunnelContext';

// Native-advertorial style presell modeled on the fetchapro.com/roofing/pa
// article layout. Deliberately looks like editorial content (news-serif
// headline, byline, read time, block-quote pull, numbered benefits, ZIP
// widget, model-year tile grid) rather than a branded funnel — the whole
// point of an advertorial is to feel like a story you clicked on, not an ad.
// The tile grid enforces vehicles 2021+ (older vehicles fall outside the
// California Lemon Law statute window in most cases).

const HERO =
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=compress&cs=srgb&fm=jpg&q=85&w=1200';

// 4 model-year buckets shown as a clickable tile grid, mirroring the
// fetchapro square-footage tiles. Each maps to a specific year we seed
// into the funnel so the user lands in the flow with year already selected.
const YEAR_TILES = [
  {
    key: '2025',
    label: '2025 – 2026',
    caption: 'Newest models',
    year: '2025',
    img: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=compress&cs=srgb&fm=jpg&q=85&w=600',
  },
  {
    key: '2024',
    label: '2024',
    caption: 'Model year 2024',
    year: '2024',
    img: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=compress&cs=srgb&fm=jpg&q=85&w=600',
  },
  {
    key: '2023',
    label: '2023',
    caption: 'Model year 2023',
    year: '2023',
    img: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=compress&cs=srgb&fm=jpg&q=85&w=600',
  },
  {
    key: '2021-2022',
    label: '2021 – 2022',
    caption: 'Still under warranty',
    year: '2022',
    img: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=compress&cs=srgb&fm=jpg&q=85&w=600',
  },
];

export default function PresellAdvertorial({
  sourcePage = 'lapa',
  rootTestId = 'presell-advertorial-page',
} = {}) {
  const navigate = useNavigate();
  const { setAnswer, resetAnswers } = useFunnel();
  const [zip, setZip] = useState('');

  // Track click / attribution the same way the other presells do so the
  // Analytics tab can measure this mockup independently once it goes live.
  useEffect(() => {
    const tracking = captureTracking(window.location.search);
    api.post('/track/click', {
      session_id: getSessionId(),
      landing_path: window.location.pathname,
      source_page: sourcePage,
      campaign_id: tracking.campaign_id,
      adgroup_id: tracking.adgroup_id,
      ad_id: tracking.ad_id,
      keyword: tracking.keyword,
      gclid: tracking.gclid,
      gbraid: tracking.gbraid,
      wbraid: tracking.wbraid,
      referrer: tracking.referrer,
      feeditemid: tracking.feeditemid,
      extensionid: tracking.extensionid,
      params: tracking.params,
    }).catch(() => {});
  }, [sourcePage]);

  // Enter the funnel with year (and optionally ZIP) pre-set. Year is
  // required by the funnel; ZIP is captured as a soft signal.
  const startFunnel = (year) => {
    resetAnswers();
    setAnswer('started', '1');
    setAnswer('source_page', sourcePage);
    if (year) {
      setAnswer('car_year', year);
      setAnswer('year_locked', '1');
    }
    if (zip.trim()) setAnswer('zip', zip.trim());
    api.post('/track/engage', { session_id: getSessionId() }).catch(() => {});
    navigate('/flow/make');
  };

  const primaryCta = () => startFunnel('');

  return (
    <div
      className="min-h-[100dvh] bg-white text-slate-800"
      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      data-testid={rootTestId}
    >
      {/* Editorial masthead — deliberately generic (no big lemon logo) so
          the page reads as an article, not a brand ad. */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <a
            href="/"
            className="text-[13px] tracking-[0.25em] uppercase font-bold text-slate-900"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            data-testid="adv-masthead"
          >
            Consumer<span className="text-amber-500">Report</span>Daily
          </a>
          <span
            className="text-[10px] uppercase tracking-[0.2em] text-slate-400"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            Attorney Advertising
          </span>
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-5 pt-8 pb-16">
        {/* Category eyebrow */}
        <p
          className="text-[11px] uppercase tracking-[0.3em] text-amber-600 font-bold mb-3"
          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          data-testid="adv-eyebrow"
        >
          Consumer Rights · California
        </p>

        {/* Article headline — big serif, editorial */}
        <h1
          className="text-3xl sm:text-[42px] leading-[1.1] font-bold text-slate-900 tracking-tight"
          data-testid="adv-headline"
        >
          California Drivers Get Help Replacing Defective Vehicles With New 2026 Lemon Law Program
        </h1>

        {/* Subhead */}
        <h2
          className="mt-4 text-lg sm:text-xl leading-snug text-slate-600 font-normal"
          data-testid="adv-subhead"
        >
          Owners of 2021 – 2026 vehicles that keep breaking down under warranty may qualify for a full buyback, replacement, or cash settlement — at no cost to them.
        </h2>

        {/* Byline */}
        <div
          className="mt-5 flex items-center gap-3 text-sm text-slate-500 border-y border-slate-100 py-3"
          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          data-testid="adv-byline"
        >
          <span className="h-8 w-8 rounded-full bg-slate-200 grid place-items-center text-slate-500 font-bold text-xs">LN</span>
          <div className="flex-1">
            <div className="text-slate-800 font-semibold">By Lee Nguyen</div>
            <div className="text-xs">Staff writer · Updated today</div>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Clock className="h-3.5 w-3.5" /> 3 min read
          </div>
        </div>

        {/* Clickable hero image */}
        <button
          type="button"
          onClick={primaryCta}
          className="mt-6 w-full block overflow-hidden rounded-lg border border-slate-200 group"
          data-testid="adv-hero"
        >
          <img
            src={HERO}
            alt="Driver checking under the hood of a car"
            className="w-full aspect-[16/9] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </button>

        {/* Lead paragraph */}
        <p className="mt-6 text-[19px] leading-[1.6] text-slate-800" data-testid="adv-lead">
          <strong>For years, drivers stuck with defective cars have been left paying monthly notes on vehicles that spend more time in the shop than on the road. Many put up with recurring problems until the warranty runs out. But now, a</strong>{' '}
          <button
            type="button"
            onClick={primaryCta}
            className="underline decoration-amber-400 underline-offset-2 text-amber-700 hover:text-amber-800 font-bold"
            data-testid="adv-inline-cta-1"
          >
            new lemon law program
          </button>{' '}
          <strong>is making it possible for California owners of 2021+ vehicles to get a full refund, a brand-new replacement, or a cash settlement — without paying a dollar in legal fees.</strong>
        </p>

        {/* Pull quote / callout */}
        <blockquote
          className="mt-6 border-l-4 border-amber-400 bg-amber-50/60 pl-5 pr-4 py-4 rounded-r-lg italic text-slate-700 text-lg leading-snug"
          data-testid="adv-pullquote"
        >
          “Drivers are recovering the full price of their car — plus payments, taxes, and fees — and the manufacturer is required by law to pay the attorney bill.”{' '}
          <button
            type="button"
            onClick={primaryCta}
            className="not-italic font-bold underline text-amber-700 hover:text-amber-800"
            data-testid="adv-inline-cta-2"
          >
            See if you qualify »
          </button>
        </blockquote>

        <p className="mt-6 text-[17px] leading-[1.65] text-slate-800">
          When California drivers visit{' '}
          <button
            type="button"
            onClick={primaryCta}
            className="underline text-amber-700 hover:text-amber-800 font-semibold"
            data-testid="adv-inline-cta-3"
          >
            The Lemon Pros
          </button>{' '}
          to see how much they can recover, many are shocked at how quickly cases move. You can check your case in under 60 seconds by entering your vehicle year, make, and model — the tool will tell you in real time whether your car may qualify.
        </p>

        {/* Numbered benefits */}
        <h3
          className="mt-10 text-2xl sm:text-[26px] font-bold text-slate-900"
          data-testid="adv-benefits-heading"
        >
          Why are so many California drivers rushing to check?
        </h3>

        <div className="mt-4 space-y-4 text-[17px] leading-[1.6] text-slate-800" data-testid="adv-benefits">
          <p>
            <strong>1. No upfront legal fees.</strong> California Lemon Law requires the manufacturer to pay the driver’s attorney fees when the case is won. That means qualified drivers pay nothing out of pocket — win or lose.
          </p>
          <p>
            <strong>2. Buyback, replacement, or cash.</strong> If your vehicle keeps breaking down under warranty for the same issue, the manufacturer may be forced to buy it back at the original price (including your down payment and every monthly payment made), give you a brand-new replacement, or write you a cash settlement to keep the car.
          </p>
          <p>
            <strong>3. Cases move fast.</strong> Because the law is on the driver’s side, most manufacturers settle within weeks rather than fight in court. Many drivers see resolution in 60–90 days.
          </p>
        </div>

        {/* ZIP tool — mimics the fetchapro "Find Qualified Pros In Your Area"
            block. It doesn't actually route by ZIP (we cover CA statewide),
            but it captures the ZIP as a soft signal and launches the funnel. */}
        <section
          className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6"
          data-testid="adv-zip-widget"
        >
          <h4
            className="text-xl font-bold text-slate-900 flex items-center gap-2"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <MapPin className="h-5 w-5 text-amber-500" /> Find Qualified Lemon Law Attorneys In Your Area
          </h4>
          <p className="mt-1 text-sm text-slate-600" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            Enter your ZIP code to see if your vehicle qualifies.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); startFunnel(''); }}
            className="mt-4 flex gap-2"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="e.g. 90001"
                className="w-full pl-9 pr-3 py-3 rounded-lg border border-slate-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none text-base"
                data-testid="adv-zip-input"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold px-5 py-3 text-sm shadow-sm transition-colors"
              data-testid="adv-zip-submit"
            >
              Check My ZIP
            </button>
          </form>
        </section>

        {/* Step-by-step */}
        <h3
          className="mt-10 text-2xl sm:text-[26px] font-bold text-slate-900"
          data-testid="adv-steps-heading"
        >
          Want to see if you qualify? Here’s how:
        </h3>

        <div className="mt-4 space-y-3 text-[17px] leading-[1.6] text-slate-800">
          <p>
            <strong>Step 1:</strong>{' '}
            <button
              type="button"
              onClick={primaryCta}
              className="underline text-amber-700 hover:text-amber-800 font-semibold"
              data-testid="adv-step1-cta"
            >
              Click here
            </button>{' '}
            or select your vehicle’s model year below.
          </p>
          <p>
            <strong>Step 2:</strong> Answer a few quick questions about your car and its repair history. In under 60 seconds you’ll know whether you qualify for a buyback, replacement, or cash settlement — free and no obligation.
          </p>
        </div>

        {/* Model-year tile grid — 2021+ only per your requirement */}
        <p
          className="mt-8 text-[15px] font-bold uppercase tracking-[0.15em] text-slate-500 text-center"
          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          data-testid="adv-tiles-label"
        >
          Select Your Vehicle’s Model Year
        </p>

        <div
          className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3"
          data-testid="adv-year-tiles"
        >
          {YEAR_TILES.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => startFunnel(t.year)}
              className="group text-left rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-amber-400 hover:shadow-md transition-all"
              data-testid={`adv-year-tile-${t.key}`}
              style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            >
              <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                <img
                  src={t.img}
                  alt={t.label}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="p-3">
                <div className="font-bold text-slate-900 text-base">{t.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.caption}</div>
              </div>
            </button>
          ))}
        </div>

        <p
          className="mt-3 text-center text-xs text-slate-500"
          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          Vehicles from model year 2021 and newer may qualify. Older vehicles typically fall outside the California Lemon Law warranty window.
        </p>

        {/* Final CTA button — the "sticky" fetchapro-style bottom CTA */}
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={primaryCta}
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-lg px-8 py-4 shadow-lg transition-colors"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            data-testid="adv-final-cta"
          >
            Check If My Car Qualifies <ChevronRight className="h-5 w-5" />
          </button>
          <p
            className="mt-2 text-xs text-slate-400"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            Free · No obligation · Under 60 seconds
          </p>
        </div>
      </article>

      {/* Editorial footer — kept minimal so the article-feel doesn’t break */}
      <footer
        className="border-t border-slate-200 bg-slate-50"
        style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
      >
        <div className="max-w-2xl mx-auto px-5 py-6 text-xs text-slate-500 space-y-2">
          <p>
            <strong>Attorney Advertising Notice.</strong> The content on this page is a paid advertisement. Prior results do not guarantee a similar outcome. Reading this article does not create an attorney-client relationship.
          </p>
          <p>© {new Date().getFullYear()} The Lemon Pros. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
