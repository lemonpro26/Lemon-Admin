import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CarFront, BadgeCheck, ShieldCheck, XCircle, CheckCircle2, ArrowRight, RotateCcw } from 'lucide-react';
import { MockupShell } from '@/components/MockupShell';

const RED_BTN =
  'h-14 w-full rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-lg shadow-[0_10px_24px_rgba(239,68,68,0.35)] transition-colors';

// Big tappable choice card used for New/Used and Yes/No.
const Choice = ({ Icon, title, sub, onClick, testid, tone = 'default' }) => {
  const toneCls = tone === 'danger'
    ? 'hover:border-rose-300 hover:shadow-[0_12px_28px_rgba(244,63,94,0.16)]'
    : 'hover:border-[#FACC15] hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)]';
  const iconWrap = tone === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-yellow-50 border-yellow-200 text-yellow-600';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 ${toneCls}`}
    >
      <span className={`h-14 w-14 flex items-center justify-center rounded-full border ${iconWrap}`}>
        <Icon className="h-7 w-7" />
      </span>
      <span className="text-xl font-extrabold text-[#0F1B3D]">{title}</span>
      {sub && <span className="text-sm font-medium text-slate-500 leading-snug">{sub}</span>}
    </button>
  );
};

export default function MockupCondition() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState('condition'); // condition | cpo | disqualify | qualify
  const [path, setPath] = useState([]); // for the "how they got here" trail

  const go = (s, label) => { setScreen(s); if (label) setPath((p) => [...p, label]); };
  const restart = () => { setScreen('condition'); setPath([]); };

  const back = () => {
    if (screen === 'condition') return navigate('/mockup');
    if (screen === 'cpo') return restart();
    // disqualify / qualify → back to the CPO question (if they came via Used) or restart
    return go('cpo');
  };

  const progressMap = { condition: 55, cpo: 70, disqualify: 70, qualify: 85 };

  const Question = ({ q, sub }) => (
    <div className="text-center mb-7">
      <h1 className="font-mock font-extrabold text-[#0F1B3D] leading-tight text-[clamp(1.7rem,4.4vw,2.6rem)]" data-testid="mockup-condition-question">
        {q}
      </h1>
      {sub && <p className="mt-2 font-semibold text-[#EF4444] text-[clamp(0.95rem,1.7vw,1.15rem)]">{sub}</p>}
    </div>
  );

  return (
    <MockupShell onBack={back} progress={progressMap[screen] || 55}>
      <div className="max-w-2xl mx-auto px-4 pt-7 sm:pt-10" data-testid="page-mockup-condition">

        {/* STEP 1 — New or Used */}
        {screen === 'condition' && (
          <>
            <Question q="Is your vehicle new or used?" sub="This helps us confirm your lemon-law eligibility" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="mockup-condition-grid">
              <Choice
                Icon={Sparkles}
                title="New"
                sub="Bought or leased new from a dealer"
                onClick={() => go('qualify', 'New')}
                testid="mockup-choice-new"
              />
              <Choice
                Icon={CarFront}
                title="Used"
                sub="Pre-owned / second-hand"
                onClick={() => go('cpo', 'Used')}
                testid="mockup-choice-used"
              />
            </div>
          </>
        )}

        {/* STEP 2 — Certified Pre-Owned? (only for Used) */}
        {screen === 'cpo' && (
          <>
            <Question q="Is it a Certified Pre-Owned (CPO) vehicle?" sub="A manufacturer-backed certified used car" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="mockup-cpo-grid">
              <Choice
                Icon={BadgeCheck}
                title="Yes, it's CPO"
                sub="Certified by the manufacturer"
                onClick={() => go('qualify', 'CPO: Yes')}
                testid="mockup-choice-cpo-yes"
              />
              <Choice
                Icon={XCircle}
                title="No / Not sure"
                sub="A regular used vehicle"
                onClick={() => go('disqualify', 'CPO: No')}
                testid="mockup-choice-cpo-no"
                tone="danger"
              />
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">
              CPO vehicles come with a manufacturer warranty, which is what makes them eligible.
            </p>
          </>
        )}

        {/* OUTCOME — Qualifies, continue */}
        {screen === 'qualify' && (
          <div className="bg-white rounded-2xl shadow-[0_18px_50px_rgba(15,27,61,0.16)] p-8 text-center" data-testid="mockup-condition-qualify">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <ShieldCheck className="h-9 w-9 text-emerald-500" />
            </div>
            <h1 className="mt-5 font-mock font-extrabold text-[#0F1B3D] text-[clamp(1.7rem,4.4vw,2.4rem)] leading-tight">
              Good news — you may qualify!
            </h1>
            <p className="mt-3 font-semibold text-slate-700 text-lg">
              Let's continue with a few quick questions about your vehicle.
            </p>
            <button className={`mt-8 ${RED_BTN} max-w-xs mx-auto flex items-center justify-center gap-2`} onClick={() => go('condition')} data-testid="mockup-qualify-continue">
              Continue <ArrowRight className="h-5 w-5" />
            </button>
            <p className="mt-4 text-xs text-slate-400">In the real funnel this proceeds to the Year → Make → Model → contact steps.</p>
          </div>
        )}

        {/* OUTCOME — Does not qualify */}
        {screen === 'disqualify' && (
          <div className="bg-white rounded-2xl shadow-[0_18px_50px_rgba(15,27,61,0.16)] p-8 text-center" data-testid="mockup-condition-disqualify">
            <div className="mx-auto h-16 w-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
              <XCircle className="h-9 w-9 text-rose-500" />
            </div>
            <h1 className="mt-5 font-mock font-extrabold text-[#0F1B3D] text-[clamp(1.7rem,4.4vw,2.4rem)] leading-tight">
              You likely won't qualify
            </h1>
            <p className="mt-3 font-semibold text-slate-700 text-lg">
              Lemon-law protection generally applies to new and Certified Pre-Owned vehicles under a manufacturer warranty. A standard used car usually isn't covered.
            </p>
            <button className="mt-8 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:border-slate-300 mx-auto" onClick={restart} data-testid="mockup-disqualify-restart">
              <RotateCcw className="h-4 w-4" /> Start over
            </button>
            <p className="mt-4 text-xs text-slate-400">(Copy is placeholder — final wording is up to you.)</p>
          </div>
        )}

        {/* Flow trail helper */}
        {path.length > 0 && (
          <p className="mt-8 text-center text-[11px] text-slate-400" data-testid="mockup-condition-trail">
            Path: {path.join('  →  ')}
          </p>
        )}
        <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-500">Mockup preview — nothing is saved</p>
      </div>
    </MockupShell>
  );
}
