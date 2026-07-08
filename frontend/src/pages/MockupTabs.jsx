import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, Users, Award, BarChart3, Filter, Share2, Megaphone,
  FlaskConical, Languages, LayoutGrid, Settings, ChevronLeft,
} from 'lucide-react';

const NAVY = '#0F1B3D';

const TABS = [
  { id: 'calls', label: 'Calls', Icon: Phone, count: 26, group: 'Leads & Calls' },
  { id: 'leads', label: 'Leads', Icon: Users, count: 5, group: 'Leads & Calls' },
  { id: 'retained', label: 'Retained', Icon: Award, count: 1, group: 'Leads & Calls' },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3, group: 'Insights' },
  { id: 'funnel', label: 'Funnel Analytics', Icon: Filter, group: 'Insights' },
  { id: 'channels', label: 'Channels', Icon: Share2, group: 'Insights' },
  { id: 'hooks', label: 'Hooks', Icon: Megaphone, group: 'Content' },
  { id: 'split', label: 'Split Test', Icon: FlaskConical, group: 'Content' },
  { id: 'spanish', label: 'Spanish', Icon: Languages, group: 'Content' },
  { id: 'pages', label: 'Pages', Icon: LayoutGrid, group: 'Content' },
  { id: 'settings', label: 'Settings', Icon: Settings, group: 'System' },
];
const GROUPS = ['Leads & Calls', 'Insights', 'Content', 'System'];

const Section = ({ n, title, desc, children }) => (
  <div className="mb-10">
    <div className="flex items-baseline gap-3 mb-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F1B3D] text-white text-sm font-bold">{n}</span>
      <h2 className="text-lg font-extrabold text-[#0F1B3D]">{title}</h2>
      <span className="text-sm text-slate-400">{desc}</span>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,27,61,0.06)]">{children}</div>
  </div>
);

/* ---------- Option A: Pill nav with count badges ---------- */
function OptionPills() {
  const [active, setActive] = useState('calls');
  return (
    <div className="flex flex-wrap gap-2" data-testid="mock-tabs-pills">
      {TABS.map(({ id, label, Icon, count }) => {
        const on = active === id;
        return (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all
              ${on ? 'bg-[#0F1B3D] text-white shadow-[0_8px_20px_rgba(15,27,61,0.25)]'
                   : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:-translate-y-0.5'}`}
          >
            <Icon className={`h-4 w-4 ${on ? 'text-[#FACC15]' : 'text-slate-400'}`} />
            {label}
            {count != null && (
              <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${on ? 'bg-[#FACC15] text-[#0F1B3D]' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Option B: Grouped segmented control ---------- */
function OptionSegmented() {
  const [active, setActive] = useState('calls');
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="mock-tabs-segmented">
      {GROUPS.map((g, gi) => (
        <React.Fragment key={g}>
          {gi > 0 && <span className="mx-1 h-6 w-px bg-slate-200" />}
          <div className="inline-flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
            {TABS.filter((t) => t.group === g).map(({ id, label, Icon, count }) => {
              const on = active === id;
              return (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all
                    ${on ? 'bg-white text-[#0F1B3D] shadow-[0_4px_12px_rgba(15,27,61,0.12)]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Icon className={`h-4 w-4 ${on ? 'text-indigo-600' : 'text-slate-400'}`} />
                  {label}
                  {count != null && (
                    <span className={`text-[11px] font-bold rounded-full px-1.5 ${on ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ---------- Option C: Grouped underline tabs ---------- */
function OptionUnderline() {
  const [active, setActive] = useState('calls');
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4" data-testid="mock-tabs-underline">
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{g}</div>
          <div className="flex flex-wrap gap-1">
            {TABS.filter((t) => t.group === g).map(({ id, label, Icon, count }) => {
              const on = active === id;
              return (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors
                    ${on ? 'text-[#0F1B3D]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Icon className={`h-4 w-4 ${on ? 'text-[#EF4444]' : 'text-slate-400'}`} />
                  {label}
                  {count != null && <span className="text-[11px] font-bold text-slate-400">{count}</span>}
                  {on && <span className="absolute -bottom-0.5 left-2 right-2 h-[3px] rounded-full bg-[#EF4444]" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MockupTabs() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      {/* mock top bar */}
      <div className="h-14 bg-[#0F1B3D] flex items-center px-6 text-white font-bold tracking-wide">
        <button onClick={() => navigate('/admin/dashboard')} className="mr-4 inline-flex items-center gap-1 text-sm font-semibold text-white/70 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        THE LEMON PROS — Admin
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-extrabold text-[#0F1B3D]">Top tabs — design options</h1>
        <p className="mt-1 text-slate-500">Click around each option to see the active/hover states. Mockup only — nothing here changes the real dashboard.</p>

        <div className="mt-8">
          <Section n="A" title="Pill navigation" desc="Rounded pills · yellow accents · count chips">
            <OptionPills />
          </Section>
          <Section n="B" title="Grouped segmented control" desc="Tabs grouped by purpose · iOS-style active card">
            <OptionSegmented />
          </Section>
          <Section n="C" title="Grouped underline tabs" desc="Labelled sections · clean underline for active">
            <OptionUnderline />
          </Section>
        </div>
      </div>
    </div>
  );
}
