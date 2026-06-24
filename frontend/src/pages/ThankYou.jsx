import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Phone, Clock } from 'lucide-react';
import { useFunnel } from '@/context/FunnelContext';
import { trackGenerateLead, trackAdsConversion } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';

export default function ThankYou() {
  const navigate = useNavigate();
  const { resetAnswers, lang } = useFunnel();
  const t = tr(lang);

  useEffect(() => {
    // GA4 lead conversion (reaching Thank-You = a completed lead). No PII sent.
    trackGenerateLead({ lead_type: 'lemon_law_case_review' });
    // Google Ads conversion ("Lead Form Submit") — credits the originating ad click.
    trackAdsConversion({ value: 1.0, currency: 'USD' });
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
          {t.thankyou.title}
        </h1>
        <p className="mt-3 text-slate-600">
          {t.thankyou.body}
        </p>

        <div className="mt-6 grid gap-3 text-left">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <Phone className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-slate-700">{t.thankyou.expectCall}</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <Clock className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-slate-700">{t.thankyou.sameDay}</span>
          </div>
        </div>

        <Button
          onClick={() => navigate(lang === 'es' ? '/sp' : '/')}
          className="mt-7 h-12 w-full rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold transition-colors"
          data-testid="thank-you-home-button"
        >
          {t.thankyou.backHome}
        </Button>
      </div>
    </div>
  );
}
