import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ShieldCheck, Clock, Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { captureTracking, getSessionId } from '@/lib/tracking';
import { useFunnel } from '@/context/FunnelContext';
import { Button } from '@/components/ui/button';

export default function Landing() {
  const navigate = useNavigate();
  const { setAnswer, resetAnswers } = useFunnel();
  const [hooks, setHooks] = useState({ hook1: '', hook2: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Capture Google Ads attribution params + record a (de-duped) click.
    const tracking = captureTracking(window.location.search);
    const sessionId = getSessionId();
    api
      .post('/track/click', {
        session_id: sessionId,
        landing_path: window.location.pathname,
        campaign_id: tracking.campaign_id,
        adgroup_id: tracking.adgroup_id,
        ad_id: tracking.ad_id,
        keyword: tracking.keyword,
        gclid: tracking.gclid,
        params: tracking.params,
      })
      .catch(() => {});

    const qs = new URLSearchParams({
      campaign: tracking.campaign_id || '',
      adgroup: tracking.adgroup_id || '',
      ad: tracking.ad_id || '',
      session: sessionId || '',
    }).toString();
    api
      .get(`/config/public?${qs}`)
      .then((res) => {
        if (mounted) setHooks({ hook1: res.data.hook1, hook2: res.data.hook2 });
      })
      .catch(() => {
        if (mounted)
          setHooks({
            hook1: 'Stuck With a Lemon? You May Be Owed Money.',
            hook2:
              'Find out in 60 seconds if your defective vehicle qualifies for a refund, replacement, or cash compensation — at no cost to you.',
          });
      })
      .finally(() => mounted && setLoaded(true));
    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    resetAnswers();
    setAnswer('started', '1');
    navigate('/flow/year');
  };

  return (
    <div
      className="min-h-full flex flex-col items-center justify-start text-center px-4 pt-[clamp(24px,6vh,72px)] pb-[clamp(88px,15vh,170px)]"
      data-testid="page-landing"
    >
      <div
        className={`w-full max-w-3xl mx-auto transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      >
        <h1
          className="font-slab font-bold tracking-tight text-slate-900 leading-[1.07] text-[clamp(1.9rem,5.2vw,3.6rem)]"
          data-testid="hero-hook1"
        >
          {hooks.hook1 || '\u00a0'}
        </h1>
        <p
          className="mt-[clamp(8px,1.6vh,18px)] text-slate-600 max-w-2xl mx-auto text-[clamp(0.95rem,1.7vw,1.125rem)]"
          data-testid="hero-hook2"
        >
          {hooks.hook2 || '\u00a0'}
        </p>
      </div>

      <div className="mt-[clamp(16px,3vh,40px)] w-full max-w-md">
        <Button
          onClick={start}
          className="h-14 w-full px-7 rounded-xl font-bold text-lg bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-[0_10px_24px_rgba(239,68,68,0.35)] transition-colors"
          data-testid="hero-get-started-button"
        >
          Check If Your Car Qualifies
        </Button>
      </div>

      <div
        className="mt-[clamp(20px,4vh,40px)] flex items-center justify-center gap-2 text-sm font-medium text-blue-600"
        data-testid="hero-trust-line"
      >
        <Clock className="h-4 w-4" />
        <span>Takes 60 seconds — no obligation</span>
      </div>

      <div className="mt-[clamp(16px,3vh,30px)] flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" /> 5-Star Rated
        </span>
        <span className="flex items-center gap-1.5" data-testid="hero-badge-free-consultation">
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> 100% Free Consultation
        </span>
        <span className="flex items-center gap-1.5">
          <Scale className="h-4 w-4 text-blue-500" /> No Win, No Fee
        </span>
      </div>
    </div>
  );
}
