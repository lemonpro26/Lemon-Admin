import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CarFront, CheckCircle2, Phone } from 'lucide-react';
import { MockupShell } from '@/components/MockupShell';
import { FUNNEL_STEPS, STEP_IDS } from '@/lib/funnel';
import { CAR_YEARS, CAR_MAKES, getModels, makeLogo } from '@/lib/carData';
import { COMPANY } from '@/lib/siteContent';

const RED_BTN =
  'h-14 w-full rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-lg shadow-[0_10px_24px_rgba(239,68,68,0.35)] transition-colors disabled:opacity-70';

const Field = ({ label, ...props }) => (
  <label className="block text-left">
    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
    <input
      {...props}
      className="mt-1 h-12 w-full rounded-xl border border-slate-200 px-4 text-slate-900 font-medium outline-none focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-200 transition"
    />
  </label>
);

export default function MockupFunnel() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [a, setA] = useState({});
  const set = (k, v) => setA((p) => ({ ...p, [k]: v }));
  const step = FUNNEL_STEPS[i];
  const total = STEP_IDS.length;
  const done = i >= total;
  const progress = Math.round(((Math.min(i, total) + 0) / total) * 100);

  const next = () => setI((x) => x + 1);
  const back = () => (i === 0 ? navigate('/mockup') : setI((x) => x - 1));
  const pick = (k, v) => { set(k, v); setTimeout(next, 130); };

  // ---- Thank-you (mock; no lead is created) ----
  if (done) {
    return (
      <MockupShell roadHeight="clamp(120px,22vh,300px)" onBack={() => setI(total - 1)}>
        <div className="max-w-xl mx-auto px-4 pt-12 text-center" data-testid="mockup-thankyou">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
          </div>
          <h1 className="mt-5 font-mock font-extrabold text-[#0F1B3D] text-[clamp(1.9rem,5vw,3rem)] leading-tight">
            You're all set, {a.first_name || 'friend'}!
          </h1>
          <p className="mt-3 font-semibold text-slate-700 text-lg">
            A lemon-law specialist will review your {a.car_year} {a.car_make} {a.car_model} and reach out shortly — free of charge.
          </p>
          <a href={COMPANY.phoneHref} className={`mt-8 inline-flex items-center justify-center gap-2 ${RED_BTN} max-w-xs mx-auto px-8`}>
            <Phone className="h-5 w-5" /> Call {COMPANY.phone}
          </a>
          <p className="mt-4 text-xs text-slate-400">(Mockup preview — no information was submitted.)</p>
        </div>
      </MockupShell>
    );
  }

  return (
    <MockupShell roadHeight="clamp(110px,18vh,240px)" onBack={back} progress={progress}>
      <div className="max-w-3xl mx-auto px-4 pt-7 sm:pt-10" data-testid="page-mockup-funnel">
        <div className="text-center mb-6">
          <h1 className="font-mock font-extrabold text-[#0F1B3D] leading-tight text-[clamp(1.7rem,4.4vw,2.75rem)]" data-testid="mockup-question">
            {step.question}
          </h1>
          {step.subtitle && <p className="mt-2 font-semibold text-[#EF4444] text-[clamp(0.95rem,1.7vw,1.15rem)]">{step.subtitle}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-[0_18px_50px_rgba(15,27,61,0.16)] p-4 sm:p-6">
          {step.type === 'year' && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[46vh] overflow-y-auto px-0.5" data-testid="mockup-year-grid">
              {CAR_YEARS.map((y) => (
                <button key={y} onClick={() => pick('car_year', y)} className="h-14 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 hover:border-[#FACC15] hover:-translate-y-0.5 hover:shadow-md transition-all">
                  {y}
                </button>
              ))}
            </div>
          )}

          {step.type === 'make' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[48vh] overflow-y-auto px-0.5" data-testid="mockup-make-grid">
              {CAR_MAKES.map((m) => (
                <button key={m.slug || m.name} onClick={() => pick('car_make', m.name)} className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 hover:border-[#FACC15] hover:-translate-y-0.5 hover:shadow-md transition-all">
                  {m.slug ? (
                    <img src={makeLogo(m.slug)} alt={m.name} loading="lazy" className="h-10 w-10 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <span className="h-10 w-10 flex items-center justify-center rounded-full bg-yellow-50 border border-yellow-200"><CarFront className="h-5 w-5 text-yellow-600" /></span>
                  )}
                  <span className="text-sm font-bold text-slate-800 text-center leading-tight">{m.name}</span>
                </button>
              ))}
            </div>
          )}

          {step.type === 'model' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[46vh] overflow-y-auto px-0.5" data-testid="mockup-model-grid">
              {getModels(a.car_make).map((m) => (
                <button key={m} onClick={() => pick('car_model', m)} className="min-h-14 px-3 py-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 hover:border-[#FACC15] hover:-translate-y-0.5 hover:shadow-md transition-all">
                  {m}
                </button>
              ))}
            </div>
          )}

          {step.type === 'name' && (
            <form onSubmit={(e) => { e.preventDefault(); if (a.first_name && a.last_name) next(); }} className="grid gap-4 max-w-md mx-auto">
              <Field label="First Name" value={a.first_name || ''} onChange={(e) => set('first_name', e.target.value)} placeholder="John" autoFocus required />
              <Field label="Last Name" value={a.last_name || ''} onChange={(e) => set('last_name', e.target.value)} placeholder="Smith" required />
              <button type="submit" className={`mt-2 ${RED_BTN}`}>Continue</button>
            </form>
          )}

          {step.type === 'address' && (
            <form onSubmit={(e) => { e.preventDefault(); if (a.address && /^\d{5}$/.test(a.zip || '')) next(); }} className="grid gap-4 max-w-md mx-auto">
              <Field label="Street Address" value={a.address || ''} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St" autoFocus required />
              <div className="grid grid-cols-3 gap-3">
                <Field label="City" value={a.city || ''} onChange={(e) => set('city', e.target.value)} placeholder="City" />
                <Field label="State" value={a.state || ''} onChange={(e) => set('state', e.target.value)} placeholder="CA" />
                <Field label="ZIP" value={a.zip || ''} onChange={(e) => set('zip', e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} placeholder="90015" inputMode="numeric" />
              </div>
              <button type="submit" className={`mt-2 ${RED_BTN}`}>Continue</button>
            </form>
          )}

          {step.type === 'phone' && (
            <form onSubmit={(e) => { e.preventDefault(); if (/^[0-9+()\-\s]{7,}$/.test(a.phone || '')) next(); }} className="grid gap-4 max-w-md mx-auto">
              <Field label="Phone Number" type="tel" value={a.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 123-4567" autoFocus required />
              <button type="submit" className={`mt-2 ${RED_BTN}`}>Continue</button>
            </form>
          )}

          {step.type === 'email' && (
            <form onSubmit={(e) => { e.preventDefault(); if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email || '')) next(); }} className="grid gap-4 max-w-md mx-auto">
              <Field label="Email" type="email" value={a.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" autoFocus required />
              <button type="submit" className={`mt-2 ${RED_BTN}`}>See If I Qualify</button>
              <p className="text-[11px] leading-relaxed text-slate-400 text-center">
                By continuing you authorize Lemon Pros and its affiliated law firms to contact you by phone, text, and email. This is legal advertising and not a guarantee of any outcome.
              </p>
            </form>
          )}
        </div>
      </div>
    </MockupShell>
  );
}
