import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ShieldCheck, CheckCircle2, Scale, Clock, ArrowRight, Star, Award, GraduationCap } from 'lucide-react';
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

const POPULAR = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Hyundai', 'Kia', 'Ram', 'BMW', 'Mercedes-Benz'];
const TOP_MAKES = POPULAR
  .map((name) => CAR_MAKES.find((m) => m.name === name))
  .filter(Boolean);

export default function PresellPA() {
  const navigate = useNavigate();
  const { setAnswer, resetAnswers } = useFunnel();
  const goLegal = (to) => navigate(to);

  useEffect(() => {
    const tracking = captureTracking(window.location.search);
    const sessionId = getSessionId();
    api
      .post('/track/click', {
        session_id: sessionId,
        landing_path: window.location.pathname,
        source_page: 'lapa',
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
    setAnswer('source_page', 'lapa');
    if (make) setAnswer('car_make', make);
    api.post('/track/engage', { session_id: getSessionId() }).catch(() => {});
    navigate('/flow/year');
  };

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-slate-800" data-testid="presell-pa-page">
      {/* Top brand bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <a
            href={COMPANY.phoneHref}
            onClick={trackPhoneCallConversion}
            data-testid="pa-header-call"
            className="flex flex-col items-end leading-none text-slate-900 hover:text-[#E0A800] transition-colors group"
          >
            <span className="flex items-center gap-1.5 text-sm sm:text-lg font-extrabold">
              <Phone className="h-4 w-4 sm:h-5 sm:w-5" /> {COMPANY.phone}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#E0A800] group-hover:text-slate-900">
              Call Now
            </span>
          </a>
        </div>
      </header>

      {/* Attorney advertising strip */}
      <div className="bg-slate-100 border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-400 text-center">
          Attorney Advertising
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8">
        {/* Meet your attorney — credibility opener (top) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-7" data-testid="pa-attorney">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <img
              src={ATTORNEY_PHOTO}
              alt="Michael Saeedian, Esq."
              className="h-32 w-32 rounded-2xl object-cover ring-2 ring-[#E0A800] shrink-0"
              data-testid="pa-attorney-photo"
            />
            <div className="text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.2em] text-[#E0A800] font-bold">Meet Your Attorney</p>
              <h2 className="font-slab font-extrabold text-slate-900 text-2xl mt-1">Michael Saeedian, Esq.</h2>
              <p className="text-slate-500 text-sm">Founding Attorney · The Lemon Pros · CA State Bar #265470</p>

              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0B2545] text-white px-4 py-1.5 font-bold text-sm" data-testid="pa-attorney-award">
                <Award className="h-4 w-4 text-[#FACC15]" />
                National Trial Lawyers — Top 40 Under 40
              </div>

              <p className="mt-3 text-slate-700 leading-relaxed">
                Michael Saeedian is a California Lemon Law attorney that auto manufacturers fear. A
                UCLA graduate with a Juris Doctorate from Loyola Law School, he{' '}
                <strong>exclusively practices lemon law</strong> — fighting to secure the maximum
                refund, replacement, or cash settlement for drivers stuck with defective vehicles.
                When you submit your case, you work directly with a licensed, award-winning
                attorney, not a call center.
              </p>

              <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
                {['Top 100 Trial Lawyers', '5-Star Rated on Yelp', 'Lead Counsel Rated', 'No Win, No Fee'].map((b) => (
                  <span key={b} className="text-xs font-semibold rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1">
                    {b}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-1.5">
                <GraduationCap className="h-4 w-4" /> UCLA · J.D., Loyola Law School, Los Angeles
              </p>
            </div>
          </div>
        </div>

        {/* Recent settlements */}
        <div className="mb-7" data-testid="pa-settlements">
          <p className="text-xs uppercase tracking-[0.2em] text-[#E0A800] font-bold mb-3">Recent Settlements</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {SETTLEMENTS.map((s) => (
              <div key={s.label} className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                <p className="font-slab font-extrabold text-emerald-600 text-lg">{s.amount}</p>
                <p className="text-xs text-slate-600 whitespace-nowrap">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">Prior results do not guarantee a similar outcome.</p>
          <button
            onClick={() => start()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold px-6 py-3.5 shadow-md shadow-red-500/20 transition-colors"
            data-testid="pa-settlements-cta"
          >
            See If My Car Qualifies <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Headline */}
        <h1
          className="font-slab font-extrabold text-slate-900 leading-tight text-3xl sm:text-4xl lg:text-5xl"
          data-testid="pa-headline"
        >
          Stuck With a Defective Vehicle? You May Be Owed a Refund, a New Car, or Cash.
        </h1>
        <p className="mt-4 text-lg text-slate-600" data-testid="pa-subhead">
          Thousands of drivers are stuck making payments on cars that spend more time in the shop
          than on the road. Here&apos;s how today&apos;s Lemon Laws can force the manufacturer to pay
          you back — at no cost to you.
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

        {/* Body */}
        <div className="mt-8 space-y-5 text-[17px] leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">
            If your vehicle has been in the shop again and again for the same problem — and it&apos;s
            still under the manufacturer&apos;s warranty — federal and state Lemon Laws may entitle
            you to a full refund, a replacement vehicle, or a substantial cash settlement.
          </p>
          <p>
            Most consumers have no idea these protections exist. Automakers are required by law to
            stand behind their vehicles, and when they can&apos;t fix a recurring defect within a
            reasonable number of attempts, the burden shifts to them — not you. That can mean getting
            back everything you&apos;ve paid, including your down payment and monthly payments.
          </p>
          <p>
            We strongly urge any driver dealing with persistent engine, transmission, electrical,
            braking, or safety problems to check if they qualify. There is{' '}
            <strong>no cost and no obligation</strong> to find out, and the entire process takes less
            than 60 seconds to start.
          </p>
        </div>

        {/* Pull-quote CTA */}
        <div
          className="my-8 rounded-2xl border-l-4 border-[#E0A800] bg-amber-50 p-6"
          data-testid="pa-callout"
        >
          <p className="text-lg font-semibold text-slate-900">
            “If your car keeps breaking down under warranty, the manufacturer may be legally required
            to buy it back — and you could be owed thousands.”
          </p>
          <button
            onClick={() => start()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold px-6 py-3 transition-colors"
            data-testid="pa-callout-cta"
          >
            See If My Car Qualifies <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* How do I qualify */}
        <h2 className="font-slab font-extrabold text-slate-900 text-2xl sm:text-3xl mt-10" data-testid="pa-section-qualify">
          How Do I Qualify?
        </h2>
        <p className="mt-3 text-[17px] text-slate-700 leading-relaxed">
          The Lemon Pros network has helped countless consumers hold manufacturers accountable. If you
          can answer <strong>yes</strong> to any of the following, you should check your case today:
        </p>
        <ul className="mt-4 space-y-3">
          {[
            'My vehicle has been repaired multiple times for the same issue',
            'The problem started while it was still under the manufacturer warranty',
            'My car has spent weeks in the shop or is unsafe to drive',
            "I'm still making payments on a vehicle I can't rely on",
          ].map((t) => (
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
            <span className="text-[#E0A800]">Step 1:</span> Select Your Vehicle&apos;s Make
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
            <span className="text-[#FACC15]">Step 2:</span> Answer a few quick questions
          </p>
          <p className="mt-2 text-slate-200">
            Find out in under 60 seconds if you qualify for a refund, replacement, or cash
            compensation. It&apos;s free and there&apos;s no obligation.
          </p>
          <button
            onClick={() => start()}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold text-lg px-8 py-4 transition-colors w-full sm:w-auto"
            data-testid="pa-final-cta"
          >
            Check If Your Car Qualifies <ArrowRight className="h-5 w-5" />
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

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-[#0B2545] text-slate-300 mt-6">
        <div className="max-w-3xl mx-auto px-4 py-9 text-center space-y-4">
          <div className="flex flex-col items-center gap-1">
            <p className="font-slab font-extrabold text-white text-lg">The Lemon Pros</p>
            <p className="text-sm text-slate-300">{COMPANY.address}</p>
            <a href={COMPANY.phoneHref} onClick={trackPhoneCallConversion} className="text-sm font-semibold text-[#FACC15] hover:text-white" data-testid="pa-footer-call">
              {COMPANY.phone}
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
