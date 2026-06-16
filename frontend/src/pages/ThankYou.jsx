import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Phone, Clock } from 'lucide-react';
import { useFunnel } from '@/context/FunnelContext';
import { trackGenerateLead } from '@/lib/analytics';
import { Button } from '@/components/ui/button';

export default function ThankYou() {
  const navigate = useNavigate();
  const { resetAnswers } = useFunnel();

  useEffect(() => {
    // GA4 lead conversion (reaching Thank-You = a completed lead). No PII sent.
    trackGenerateLead({ lead_type: 'lemon_law_case_review' });
    resetAnswers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-full flex items-center justify-center px-4 pt-[clamp(12px,3vh,32px)] pb-[clamp(88px,15vh,170px)]"
      data-testid="page-thank-you"
    >
      <div className="max-w-lg w-full text-center bg-white rounded-2xl border border-slate-200 shadow-[0_12px_36px_rgba(15,23,42,0.10)] p-[clamp(20px,3vh,40px)]">
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <h1 className="mt-5 font-slab font-bold text-[clamp(1.6rem,3.5vw,2rem)] text-slate-900">
          You're all set!
        </h1>
        <p className="mt-3 text-slate-600">
          Thanks for your request. A Lemon Pros case specialist will reach out shortly to review your
          vehicle and explain your options — your consultation is 100% free.
        </p>

        <div className="mt-6 grid gap-3 text-left">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <Phone className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-slate-700">Expect a call from a lemon-law specialist.</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <Clock className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-slate-700">Most case reviews are completed same day.</span>
          </div>
        </div>

        <Button
          onClick={() => navigate('/')}
          className="mt-7 h-12 w-full rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold transition-colors"
          data-testid="thank-you-home-button"
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
