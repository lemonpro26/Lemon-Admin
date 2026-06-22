import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Star, Scale, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { MockupShell } from '@/components/MockupShell';

// Stand-alone MOCKUP of a bindright.com-style home page (/mockup). The live
// home page (/) is never touched. Awaiting owner approval.
const FALLBACK = {
  hook1: 'Stuck With a Lemon? You May Be Owed Money.',
  hook2: 'Find out in 60 seconds if your defective vehicle qualifies for a refund, replacement, or cash compensation.',
};

export default function MockupHome() {
  const navigate = useNavigate();
  const [hooks, setHooks] = useState(FALLBACK);

  useEffect(() => {
    let mounted = true;
    api.get('/config/public')
      .then((res) => mounted && setHooks({ hook1: res.data.hook1, hook2: res.data.hook2 }))
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  return (
    <MockupShell>
      <div className="max-w-4xl mx-auto px-4 pt-8 sm:pt-14 text-center" data-testid="page-mockup-home">
        <h1
          className="font-mock font-extrabold tracking-tight text-[#0F1B3D] leading-[1.05] text-[clamp(2.3rem,6vw,4.25rem)]"
          data-testid="mockup-hook1"
        >
          {hooks.hook1}
        </h1>
        <p
          className="mt-4 mx-auto max-w-2xl font-semibold text-slate-700 text-[clamp(1.05rem,2.2vw,1.4rem)]"
          data-testid="mockup-hook2"
        >
          {hooks.hook2}
        </p>

        <div className="mt-8 sm:mt-10 mx-auto w-full max-w-xl">
          <div className="relative bg-white rounded-2xl shadow-[0_18px_50px_rgba(15,27,61,0.18)] px-5 pt-7 pb-5">
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#EF4444] text-white text-sm font-bold px-4 py-1.5 rounded-lg whitespace-nowrap shadow-md after:content-[''] after:absolute after:left-1/2 after:-bottom-1.5 after:-translate-x-1/2 after:border-x-8 after:border-x-transparent after:border-t-8 after:border-t-[#EF4444]">
              Takes 60 seconds — see if you qualify!
            </span>
            <button
              onClick={() => navigate('/mockup/funnel')}
              className="group h-14 w-full px-7 rounded-xl font-bold text-lg bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-[0_10px_24px_rgba(239,68,68,0.35)] transition-colors flex items-center justify-center gap-2"
              data-testid="mockup-get-started-button"
            >
              Check If Your Car Qualifies
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs sm:text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><Star className="h-4 w-4 text-amber-400 fill-amber-400" /> 5-Star Rated</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-500" /> 100% Free</span>
              <span className="flex items-center gap-1.5"><Scale className="h-4 w-4 text-blue-500" /> No Win, No Fee</span>
            </div>
          </div>
        </div>
      </div>
    </MockupShell>
  );
}
