import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ShieldCheck, CheckCircle2, Scale, Clock, ArrowRight, Star, Award, GraduationCap, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { captureTracking, getSessionId } from '@/lib/tracking';
import { useFunnel } from '@/context/FunnelContext';
import { trackPhoneCallConversion } from '@/lib/analytics';
import { COMPANY } from '@/lib/siteContent';
import { Logo } from '@/components/Logo';
import { CAR_MAKES, makeLogo } from '@/lib/carData';

// Drop the attorney's real headshot URL here to replace the monogram placeholder.
const ATTORNEY_PHOTO = 'https://customer-assets.emergentagent.com/job_lemon-checker/artifacts/bijulyp5_attorney.jpg';

const HERO_PA =
  'https://images.unsplash.com/photo-1504203640717-b7d237a3dc84?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200';
const LOT_PA =
  'https://images.pexels.com/photos/29566906/pexels-photo-29566906.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=1200';

const SETTLEMENTS = [
  { amount: '$107,500', label: 'Mercedes GLE' },
  { amount: '$98,000', label: 'Tesla Model Y' },
  { amount: '$94,500', label: 'Ford F-150' },
  { amount: '$89,000', label: 'Jeep Grand Cherokee' },
  { amount: '$85,200', label: 'Chevy Silverado' },
  { amount: '$79,800', label: 'Hyundai Tucson' },
  { amount: '$76,500', label: 'Kia Sorento' },
];

// Default copy — mirrors backend DEFAULT_PA_CONTENT. The page fetches /pa-content
// (admin "PA Page" tab overrides) and falls back to this so it never breaks.
const PA_DEFAULTS = {
  attorney_eyebrow: 'Meet Your Attorney',
  attorney_name: 'Michael Saeedian, Esq.',
  attorney_title: 'Founding Attorney · The Lemon Pros · CA State Bar #265470',
  attorney_award: 'National Trial Lawyers — Top 40 Under 40',
  attorney_bio:
    'Michael Saeedian is a California Lemon Law attorney that auto manufacturers fear. A UCLA graduate with a Juris Doctorate from Loyola Law School, fighting to secure the maximum refund, replacement, or cash settlement for drivers stuck with defective vehicles. When you submit your case, you work directly with a licensed, award-winning attorney, not a call center.',
  attorney_badges: ['Top 100 Trial Lawyers', '5-Star Rated on Yelp', 'Lead Counsel Rated', 'No Win, No Fee'],
  attorney_school: 'UCLA · J.D., Loyola Law School, Los Angeles',
  settlements_eyebrow: 'Recent Settlements',
  settlements: SETTLEMENTS,
  settlements_disclaimer: 'Prior results do not guarantee a similar outcome.',
  settlements_cta: 'See If My Car Qualifies',
  headline: 'Stuck With a Defective Vehicle? You May Be Owed a Refund, a New Car, or Cash.',
  subhead:
    "Thousands of drivers are stuck making payments on cars that spend more time in the shop than on the road. Here's how today's Lemon Laws can force the manufacturer to pay you back — at no cost to you.",
  body: [
    "If your vehicle has been in the shop again and again for the same problem — and it's still under the manufacturer's warranty — federal and state Lemon Laws may entitle you to a full refund, a replacement vehicle, or a substantial cash settlement.",
    "Most consumers have no idea these protections exist. Automakers are required by law to stand behind their vehicles, and when they can't fix a recurring defect within a reasonable number of attempts, the burden shifts to them — not you. That can mean getting back everything you've paid, including your down payment and monthly payments.",
    'We strongly urge any driver dealing with persistent engine, transmission, electrical, braking, or safety problems to check if they qualify. There is no cost and no obligation to find out, and the entire process takes less than 60 seconds to start.',
  ],
  callout_quote:
    'If your car keeps breaking down under warranty, the manufacturer may be legally required to buy it back — and you could be owed thousands.',
  callout_cta: 'See If My Car Qualifies',
  qualify_heading: 'How Do I Qualify?',
  qualify_intro:
    'The Lemon Pros has helped countless consumers hold manufacturers accountable. If you can answer yes to any of the following, you should check your case today:',
  qualify_items: [
    'My vehicle has been repaired multiple times for the same issue',
    'The problem started while it was still under the manufacturer warranty',
    'My car has spent weeks in the shop or is unsafe to drive',
    "I'm still making payments on a vehicle I can't rely on",
  ],
  step1_label: "Select Your Vehicle's Make",
  step2_label: 'Answer a few quick questions',
  step2_text:
    "Find out in under 60 seconds if you qualify for a refund, replacement, or cash compensation. It's free and there's no obligation.",
  final_cta: 'Check If Your Car Qualifies',
};

const POPULAR = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Hyundai', 'Kia', 'Ram', 'BMW', 'Mercedes-Benz'];
const TOP_MAKES = POPULAR
  .map((name) => CAR_MAKES.find((m) => m.name === name))
  .filter(Boolean);

export default function PresellPA({
  contentPath = '/pa-content',
  sourcePage = 'lapa',
  phone = COMPANY.phone,
  phoneHref = COMPANY.phoneHref,
  // Optional Text-us CTA. Pass `textPhone` (display) + `textPhoneHref`
  // (sms: link, typically the same number as `phone`) to enable Text buttons
  // in the header, below the hero, and in a sticky mobile footer bar.
  // Leaving them undefined keeps the classic /pa page (call-only) untouched.
  textPhone = '',
  textPhoneHref = '',
  textMessage = 'Hi, I would like to check if my car qualifies for Lemon Law.',
  rootTestId = 'presell-pa-page',
} = {}) {
  const navigate = useNavigate();
  const { setAnswer, resetAnswers } = useFunnel();
  const goLegal = (to) => navigate(to);
  const [c, setC] = useState(PA_DEFAULTS);

  // Prebuilt sms: href with pre-filled body. iOS/Android both accept
  // `sms:<number>?body=<encoded>`; older iOS versions accept `?&body=` as
  // fallback but modern devices are fine with the standard `?body=`.
  const smsHref = textPhoneHref
    ? `${textPhoneHref}${textPhoneHref.includes('?') ? '&' : '?'}body=${encodeURIComponent(textMessage)}`
    : '';

  useEffect(() => {
    api.get(contentPath)
      .then((res) => setC({ ...PA_DEFAULTS, ...(res.data || {}) }))
      .catch(() => {});
  }, [contentPath]);

  useEffect(() => {
    const tracking = captureTracking(window.location.search);
    const sessionId = getSessionId();
    api
      .post('/track/click', {
        session_id: sessionId,
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
        split_experiment_id: tracking.split_experiment_id,
        split_variant: tracking.split_variant,
        params: tracking.params,
      })
      .catch(() => {});
  }, []);

  const start = (make) => {
    resetAnswers();
    setAnswer('started', '1');
    setAnswer('source_page', sourcePage);
    setAnswer('entry_phone', phone);
    setAnswer('entry_phone_href', phoneHref);
    if (make) { setAnswer('car_make', make); setAnswer('make_locked', '1'); }
    api.post('/track/engage', { session_id: getSessionId() }).catch(() => {});
    navigate('/flow/year');
  };

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-slate-800" data-testid={rootTestId}>
      {/* Top brand bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            {smsHref && (
              <a
                href={smsHref}
                data-testid="pa-header-text"
                className="flex flex-col items-center justify-center leading-none rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 transition-colors shadow-sm"
                title="Text us — faster than a call"
              >
                <span className="flex items-center gap-1.5 text-[13px] sm:text-lg font-extrabold whitespace-nowrap">
                  <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" /> Text
                </span>
                <span className="mt-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.15em] text-white/90">
                  {textPhone}
                </span>
              </a>
            )}
            <a
              href={phoneHref}
              onClick={trackPhoneCallConversion}
              data-testid="pa-header-call"
              className="flex flex-col items-center justify-center leading-none rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white px-2.5 py-1.5 sm:px-5 sm:py-2 transition-colors shadow-sm"
            >
              <span className="flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-xl font-extrabold whitespace-nowrap">
                <Phone className="h-4 w-4 sm:h-5 sm:w-5" /> {phone}
              </span>
              <span className="mt-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.15em] text-white/90">
                Call Now
              </span>
            </a>
          </div>
        </div>
      </header>

      {/* Attorney advertising strip */}
      <div className="bg-slate-100 border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-400 text-center">
          Attorney Advertising
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8">
        {/* Meet your legal team — credibility opener (top) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm mb-7" data-testid="pa-attorney">
          <img
            src="/team-attorneys.jpg"
            alt="The Lemon Pros attorney team"
            className="w-full object-cover rounded-xl shadow-sm"
            data-testid="pa-team-photo"
          />
          <div className="mt-5 text-center sm:text-left">
            <p className="text-xs uppercase tracking-[0.2em] text-[#E0A800] font-bold">Meet Your Legal Team</p>
            <h2 className="font-slab font-extrabold text-slate-900 text-2xl sm:text-3xl mt-1">A Full Team of California Lemon Law Attorneys</h2>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0B2545] text-white px-4 py-1.5 font-bold text-sm" data-testid="pa-attorney-award">
              <Award className="h-4 w-4 text-[#FACC15]" />
              {c.attorney_award}
            </div>
            <p className="mt-3 text-slate-700 leading-relaxed">
              When you call The Lemon Pros, an entire team of experienced attorneys goes to work for you — not a call center. We take on the automakers directly, and you pay <span className="font-semibold text-slate-900">nothing unless we win</span>.
            </p>
            <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
              {c.attorney_badges.map((b) => (
                <span key={b} className="text-xs font-semibold rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 whitespace-nowrap">
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Recent settlements */}
        <div className="mb-7" data-testid="pa-settlements">
          <p className="text-xs uppercase tracking-[0.2em] text-[#E0A800] font-bold mb-3">{c.settlements_eyebrow}</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {c.settlements.map((s) => (
              <div key={s.label + s.amount} className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                <p className="font-slab font-extrabold text-emerald-600 text-lg">{s.amount}</p>
                <p className="text-xs text-slate-600 whitespace-nowrap">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">{c.settlements_disclaimer}</p>
          <button
            onClick={() => start()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold px-6 py-3.5 shadow-md shadow-red-500/20 transition-colors"
            data-testid="pa-settlements-cta"
          >
            {c.settlements_cta} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Headline */}
        <h1
          className="font-slab font-extrabold text-slate-900 leading-tight text-3xl sm:text-4xl lg:text-5xl"
          data-testid="pa-headline"
        >
          {c.headline}
        </h1>
        <p className="mt-4 text-lg text-slate-600" data-testid="pa-subhead">
          {c.subhead}
        </p>

        {/* Hero image */}
        <button
          onClick={() => start()}
          className="block w-full mt-6 rounded-2xl overflow-hidden shadow-lg group"
          data-testid="pa-hero-image-cta"
        >
          <img
            src={HERO_PA}
            alt="Driver stranded with a broken-down vehicle"
            className="w-full h-56 sm:h-80 object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </button>

        {/* Call + Text CTA row — shown only when a text number is configured.
            Positioned right under the hero so the "reach us however you
            like" choice sits at the top of the read. */}
        {smsHref && (
          <div className="mt-5 grid grid-cols-2 gap-3" data-testid="pa-cta-row">
            <a
              href={phoneHref}
              onClick={trackPhoneCallConversion}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-extrabold py-3.5 text-base shadow-md transition-colors"
              data-testid="pa-cta-row-call"
            >
              <Phone className="h-5 w-5" /> Call Us
            </a>
            <a
              href={smsHref}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3.5 text-base shadow-md transition-colors"
              data-testid="pa-cta-row-text"
            >
              <MessageSquare className="h-5 w-5" /> Text Us
            </a>
          </div>
        )}

        {/* Body */}
        <div className="mt-8 space-y-5 text-[17px] leading-relaxed text-slate-700">
          {c.body.map((para, i) => (
            <p key={i} className={i === 0 ? 'font-semibold text-slate-900' : ''}>{para}</p>
          ))}
        </div>

        {/* Pull-quote CTA */}
        <div
          className="my-8 rounded-2xl border-l-4 border-[#E0A800] bg-amber-50 p-6"
          data-testid="pa-callout"
        >
          <p className="text-lg font-semibold text-slate-900">“{c.callout_quote}”</p>
          <button
            onClick={() => start()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold px-6 py-3 transition-colors"
            data-testid="pa-callout-cta"
          >
            {c.callout_cta} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* How do I qualify */}
        <h2 className="font-slab font-extrabold text-slate-900 text-2xl sm:text-3xl mt-10" data-testid="pa-section-qualify">
          {c.qualify_heading}
        </h2>
        <p className="mt-3 text-[17px] text-slate-700 leading-relaxed">
          {c.qualify_intro}
        </p>
        <ul className="mt-4 space-y-3">
          {c.qualify_items.map((t) => (
            <li key={t} className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
              <span className="text-slate-800">{t}</span>
            </li>
          ))}
        </ul>

        <img
          src={LOT_PA}
          alt="Row of vehicles at a dealership"
          className="w-full h-44 sm:h-56 object-cover rounded-2xl shadow-md mt-6"
        />


        {/* Step 1 */}
        <div className="mt-10">
          <p className="font-bold text-slate-900 text-lg">
            <span className="text-[#E0A800]">Step 1:</span> {c.step1_label}
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="pa-make-grid">
            {TOP_MAKES.map((m) => (
              <button
                key={m.slug}
                onClick={() => start(m.name)}
                data-testid={`pa-make-${m.slug}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-[#E0A800] hover:shadow-md transition-all text-left"
              >
                <img
                  src={makeLogo(m.slug)}
                  alt={m.name}
                  className="h-7 w-7 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
                <span className="font-semibold text-slate-800">{m.name}</span>
              </button>
            ))}
            <button
              onClick={() => start()}
              data-testid="pa-make-other"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-[#E0A800] hover:shadow-md transition-all font-semibold text-slate-700"
            >
              Other Make <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Step 2 + final CTA */}
        <div className="mt-10 rounded-2xl bg-[#0B2545] text-white p-7 text-center" data-testid="pa-final-cta-block">
          <p className="font-bold text-lg">
            <span className="text-[#FACC15]">Step 2:</span> {c.step2_label}
          </p>
          <p className="mt-2 text-slate-200">
            {c.step2_text}
          </p>
          <button
            onClick={() => start()}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold text-lg px-8 py-4 transition-colors w-full sm:w-auto"
            data-testid="pa-final-cta"
          >
            {c.final_cta} <ArrowRight className="h-5 w-5" />
          </button>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-300">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> 100% Free &amp; Confidential</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-emerald-400" /> Takes 60 Seconds</span>
            <span className="flex items-center gap-1.5"><Scale className="h-4 w-4 text-emerald-400" /> No Win, No Fee</span>
          </div>
        </div>

        {/* Trust row */}
        <div className="mt-8 flex items-center justify-center gap-1 text-amber-400" data-testid="pa-stars">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-5 w-5 fill-amber-400" />
          ))}
          <span className="ml-2 text-sm text-slate-500">Trusted by drivers nationwide</span>
        </div>
      </article>

      {/* Sticky mobile-only Call / Text bar — always visible while scrolling
          so the user is never more than one tap from reaching us. Desktop
          keeps the header CTAs (no sticky needed). */}
      {smsHref && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 sm:hidden border-t border-slate-200 bg-white/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
          data-testid="pa-sticky-cta"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="max-w-3xl mx-auto px-3 py-2.5 grid grid-cols-2 gap-2">
            <a
              href={phoneHref}
              onClick={trackPhoneCallConversion}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-extrabold py-3 text-sm shadow-sm transition-colors"
              data-testid="pa-sticky-call"
            >
              <Phone className="h-4 w-4" /> Call {phone}
            </a>
            <a
              href={smsHref}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3 text-sm shadow-sm transition-colors"
              data-testid="pa-sticky-text"
            >
              <MessageSquare className="h-4 w-4" /> Text Us
            </a>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-[#0B2545] text-slate-300 mt-6">
        <div className="max-w-3xl mx-auto px-4 py-9 text-center space-y-4">
          <div className="flex flex-col items-center gap-1">
            <p className="font-slab font-extrabold text-white text-lg">The Lemon Pros</p>
            <p className="text-sm text-slate-300">{COMPANY.address}</p>
            <a href={phoneHref} onClick={trackPhoneCallConversion} className="text-sm font-semibold text-[#FACC15] hover:text-white" data-testid="pa-footer-call">
              {phone}
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
            <button type="button" onClick={() => goLegal('/terms')} className="hover:text-white transition-colors" data-testid="pa-footer-terms">Terms of Use</button>
            <button type="button" onClick={() => goLegal('/do-not-sell')} className="hover:text-white transition-colors" data-testid="pa-footer-dns">Do Not Sell My Info</button>
            <button type="button" onClick={() => goLegal('/privacy')} className="hover:text-white transition-colors" data-testid="pa-footer-privacy">Privacy</button>
            <button type="button" onClick={() => goLegal('/contact')} className="hover:text-white transition-colors" data-testid="pa-footer-contact">Contact Us</button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl mx-auto" data-testid="pa-disclaimer">
            Attorney Advertising. This website is for general informational purposes and does not
            constitute legal advice. Contacting The Lemon Pros does not create an attorney-client
            relationship. Prior results do not guarantee a similar outcome. Case evaluations are
            free and there is no fee unless we win.
          </p>
          <p className="text-xs text-slate-500" data-testid="pa-footer-copyright">
            ©{new Date().getFullYear()} The Lemon Pros. All rights reserved. Attorney advertising. Michael Saeedian, Esq.
          </p>
        </div>
      </footer>
    </div>
  );
}
