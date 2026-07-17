import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ShieldCheck, Scale, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { captureTracking, getSessionId } from '@/lib/tracking';
import { useFunnel } from '@/context/FunnelContext';
import { tr } from '@/lib/i18n';

// Shared landing page. Renders the English home (`/`) or the Spanish page (`/sp`)
// based on props. `sourcePage` tags clicks/leads ('home' vs 'sp'); `pageLang`
// drives all copy + the funnel language.
export default function Landing({ sourcePage = 'home', pageLang = 'en' }) {
  const navigate = useNavigate();
  const { setAnswer, resetAnswers, setLang } = useFunnel();
  const t = tr(pageLang);
  const [loaded, setLoaded] = useState(false);
  const [hooks, setHooks] = useState({
    hook1: t.landing.defaultHook1,
    hook2: t.landing.defaultHook2,
  });
  const [content, setContent] = useState({
    tooltip: t.landing.tooltip,
    cta: t.landing.cta,
    rated: t.landing.rated,
    free_consult: t.landing.freeConsult,
    no_win_no_fee: t.landing.noWinNoFee,
  });

  useEffect(() => {
    let mounted = true;
    setLang(pageLang);

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

    const qs = new URLSearchParams({
      campaign: tracking.campaign_id || '',
      adgroup: tracking.adgroup_id || '',
      ad: tracking.ad_id || '',
      session: sessionId || '',
      lang: pageLang === 'es' ? 'es' : '',
    }).toString();
    api
      .get(`/config/public?${qs}`)
      .then((res) => {
        if (mounted) {
          setHooks({ hook1: res.data.hook1, hook2: res.data.hook2 });
          setLoaded(true);
        }
      })
      .catch(() => {
        if (mounted) setLoaded(true);
      });
    api
      .get(`/page-content/${sourcePage === 'sp' ? 'sp' : 'home'}`)
      .then((res) => { if (mounted && res.data) setContent((prev) => ({ ...prev, ...res.data })); })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    resetAnswers();
    setLang(pageLang);
    setAnswer('started', '1');
    setAnswer('source_page', sourcePage);
    api.post('/track/engage', { session_id: getSessionId() }).catch(() => {});
    navigate('/flow/year');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-8 sm:pt-14 text-center" data-testid="page-landing">
      {/* Hero paints IMMEDIATELY with default hooks — no opacity gate on the API
          response. LCP used to wait for /config/public to return (~2-4s on 3G)
          which tanked mobile Lighthouse LCP to 11+ seconds. Now the fallback
          copy renders synchronously and admin-configured hooks swap in the
          moment they arrive (no visible flash — same font, same layout). */}
      <div>
        <h1
          className="font-mock font-extrabold tracking-tight text-[#0F1B3D] leading-[1.05] text-[clamp(2.1rem,5.6vw,4rem)]"
          data-testid="hero-hook1"
        >
          {hooks.hook1}
        </h1>
        <p
          className="mt-4 mx-auto max-w-2xl font-semibold text-slate-700 text-[clamp(1.02rem,2.1vw,1.35rem)]"
          data-testid="hero-hook2"
        >
          {hooks.hook2}
        </p>
      </div>

      <div className="mt-7 sm:mt-9 mx-auto w-full max-w-xl">
        <div className="relative bg-white rounded-2xl shadow-[0_18px_50px_rgba(15,27,61,0.18)] px-5 pt-7 pb-5">
          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#EF4444] text-white text-sm font-bold px-4 py-1.5 rounded-lg whitespace-nowrap shadow-md after:content-[''] after:absolute after:left-1/2 after:-bottom-1.5 after:-translate-x-1/2 after:border-x-8 after:border-x-transparent after:border-t-8 after:border-t-[#EF4444]">
            {content.tooltip}
          </span>
          <button
            onClick={start}
            className="group h-14 w-full px-7 rounded-xl font-bold text-lg bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-[0_10px_24px_rgba(239,68,68,0.35)] transition-colors flex items-center justify-center gap-2"
            data-testid="hero-get-started-button"
          >
            {content.cta}
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs sm:text-sm text-slate-500" data-testid="hero-trust-line">
            <span className="flex items-center gap-1.5"><Star className="h-4 w-4 text-amber-400 fill-amber-400" /> {content.rated}</span>
            <span className="flex items-center gap-1.5" data-testid="hero-badge-free-consultation"><ShieldCheck className="h-4 w-4 text-emerald-500" /> {content.free_consult}</span>
            <span className="flex items-center gap-1.5"><Scale className="h-4 w-4 text-blue-500" /> {content.no_win_no_fee}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
