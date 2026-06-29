import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ShieldCheck, CheckCircle2, Scale, Clock, ArrowRight, Star, Award, GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { captureTracking, getSessionId } from '@/lib/tracking';
import { useFunnel } from '@/context/FunnelContext';
import { trackPhoneCallConversion } from '@/lib/analytics';
import { COMPANY } from '@/lib/siteContent';
import { Logo } from '@/components/Logo';
import { CAR_MAKES, makeLogo } from '@/lib/carData';

const ATTORNEY_PHOTO = 'https://customer-assets.emergentagent.com/job_lemon-checker/artifacts/bijulyp5_attorney.jpg';
const HERO_PA = 'https://images.unsplash.com/photo-1504203640717-b7d237a3dc84?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200';
const LOT_PA = 'https://images.pexels.com/photos/29566906/pexels-photo-29566906.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=1200';

const SETTLEMENTS = [
  { amount: '$107,500', label: 'Mercedes GLE' },
  { amount: '$98,000', label: 'Tesla Model Y' },
  { amount: '$94,500', label: 'Ford F-150' },
  { amount: '$89,000', label: 'Jeep Grand Cherokee' },
  { amount: '$85,200', label: 'Chevy Silverado' },
  { amount: '$79,800', label: 'Hyundai Tucson' },
  { amount: '$76,500', label: 'Kia Sorento' },
];

// Spanish advertorial copy — defaults; live overrides come from /spa-content.
const SPA_DEFAULTS = {
  attorney_eyebrow: 'Conozca a Su Abogado',
  attorney_name: 'Michael Saeedian, Esq.',
  attorney_title: 'Abogado Fundador · The Lemon Pros · Colegio de Abogados de CA #265470',
  attorney_award: 'National Trial Lawyers — Top 40 Menores de 40',
  attorney_bio:
    'Michael Saeedian es un abogado de la Ley Limón de California a quien los fabricantes de autos temen. Graduado de UCLA con un Doctorado en Derecho de Loyola Law School, se dedica exclusivamente a la Ley Limón — luchando para conseguir el máximo reembolso, reemplazo o acuerdo en efectivo para los conductores atrapados con vehículos defectuosos. Cuando envía su caso, trabaja directamente con un abogado licenciado y galardonado, no con un centro de llamadas.',
  attorney_badges: ['Top 100 Abogados Litigantes', 'Calificación 5 Estrellas en Yelp', 'Lead Counsel Rated', 'Si No Gana, No Paga'],
  attorney_school: 'UCLA · Doctorado en Derecho, Loyola Law School, Los Ángeles',
  settlements_eyebrow: 'Acuerdos Recientes',
  settlements: SETTLEMENTS,
  settlements_disclaimer: 'Los resultados anteriores no garantizan un resultado similar.',
  settlements_cta: 'Vea Si Mi Auto Califica',
  headline: '¿Atrapado con un Vehículo Defectuoso? Podría Tener Derecho a un Reembolso, un Auto Nuevo o Dinero en Efectivo.',
  subhead:
    'Miles de conductores siguen pagando autos que pasan más tiempo en el taller que en la carretera. Así es como las Leyes Limón de hoy pueden obligar al fabricante a pagarle — sin ningún costo para usted.',
  body: [
    'Si su vehículo ha estado en el taller una y otra vez por el mismo problema — y todavía está bajo la garantía del fabricante — las Leyes Limón federales y estatales podrían darle derecho a un reembolso completo, un vehículo de reemplazo o un acuerdo en efectivo considerable.',
    'La mayoría de los consumidores no tienen idea de que estas protecciones existen. Los fabricantes están obligados por ley a responder por sus vehículos, y cuando no pueden reparar un defecto recurrente en un número razonable de intentos, la responsabilidad recae sobre ellos — no sobre usted. Eso puede significar recuperar todo lo que ha pagado, incluyendo su pago inicial y sus mensualidades.',
    'Recomendamos encarecidamente a cualquier conductor con problemas persistentes de motor, transmisión, sistema eléctrico, frenos o seguridad que verifique si califica. No hay costo ni obligación para averiguarlo, y todo el proceso toma menos de 60 segundos para empezar.',
  ],
  callout_quote:
    'Si su auto sigue fallando bajo garantía, el fabricante podría estar legalmente obligado a recomprarlo — y usted podría tener derecho a miles de dólares.',
  callout_cta: 'Vea Si Mi Auto Califica',
  qualify_heading: '¿Cómo Califico?',
  qualify_intro:
    'La red de The Lemon Pros ha ayudado a innumerables consumidores a responsabilizar a los fabricantes. Si puede responder sí a cualquiera de las siguientes, debería verificar su caso hoy:',
  qualify_items: [
    'Mi vehículo ha sido reparado varias veces por el mismo problema',
    'El problema comenzó mientras todavía estaba bajo la garantía del fabricante',
    'Mi auto ha pasado semanas en el taller o no es seguro para conducir',
    'Sigo pagando un vehículo en el que no puedo confiar',
  ],
  step1_label: 'Seleccione la Marca de Su Vehículo',
  step2_label: 'Responda unas preguntas rápidas',
  step2_text:
    'Averigüe en menos de 60 segundos si califica para un reembolso, reemplazo o compensación en efectivo. Es gratis y no hay ninguna obligación.',
  final_cta: 'Verifique Si Su Auto Califica',
};

const POPULAR = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Hyundai', 'Kia', 'Ram', 'BMW', 'Mercedes-Benz'];
const TOP_MAKES = POPULAR.map((name) => CAR_MAKES.find((m) => m.name === name)).filter(Boolean);

export default function PresellSPA() {
  const navigate = useNavigate();
  const { setAnswer, resetAnswers, setLang } = useFunnel();
  const goLegal = (to) => navigate(to);
  const [c, setC] = useState(SPA_DEFAULTS);

  useEffect(() => {
    api.get('/spa-content')
      .then((res) => setC({ ...SPA_DEFAULTS, ...(res.data || {}) }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const tracking = captureTracking(window.location.search);
    api
      .post('/track/click', {
        session_id: getSessionId(),
        landing_path: window.location.pathname,
        source_page: 'laspa',
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
        lang: 'es',
        params: tracking.params,
      })
      .catch(() => {});
  }, []);

  const start = (make) => {
    resetAnswers();
    setLang('es');
    setAnswer('started', '1');
    setAnswer('source_page', 'laspa');
    if (make) setAnswer('car_make', make);
    api.post('/track/engage', { session_id: getSessionId() }).catch(() => {});
    navigate('/flow/year');
  };

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-slate-800" data-testid="presell-spa-page">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <a
            href={COMPANY.phoneHrefEs}
            onClick={trackPhoneCallConversion}
            data-testid="spa-header-call"
            className="flex flex-col items-center justify-center leading-none rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white px-2.5 py-1.5 sm:px-5 sm:py-2 transition-colors shadow-sm"
          >
            <span className="flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-xl font-extrabold whitespace-nowrap">
              <Phone className="h-4 w-4 sm:h-5 sm:w-5" /> {COMPANY.phoneEs}
            </span>
            <span className="mt-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.15em] text-white/90">
              Llame Ahora
            </span>
          </a>
        </div>
      </header>

      <div className="bg-slate-100 border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-400 text-center">
          Publicidad de Abogado
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-7" data-testid="spa-attorney">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <img src={ATTORNEY_PHOTO} alt="Michael Saeedian, Esq." className="h-32 w-32 rounded-2xl object-cover ring-2 ring-[#E0A800] shrink-0" data-testid="spa-attorney-photo" />
            <div className="text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.2em] text-[#E0A800] font-bold">{c.attorney_eyebrow}</p>
              <h2 className="font-slab font-extrabold text-slate-900 text-2xl mt-1">{c.attorney_name}</h2>
              <p className="text-slate-500 text-sm">{c.attorney_title}</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0B2545] text-white px-4 py-1.5 font-bold text-sm" data-testid="spa-attorney-award">
                <Award className="h-4 w-4 text-[#FACC15]" />
                {c.attorney_award}
              </div>
              <p className="mt-3 text-slate-700 leading-relaxed">{c.attorney_bio}</p>
              <div className="mt-4 flex flex-wrap sm:flex-nowrap justify-center sm:justify-start gap-2">
                {c.attorney_badges.map((b) => (
                  <span key={b} className="text-xs font-semibold rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 whitespace-nowrap">{b}</span>
                ))}
              </div>
              <p className="mt-3 text-xs font-bold text-slate-600 flex items-center justify-center sm:justify-start gap-1.5">
                <GraduationCap className="h-4 w-4" /> {c.attorney_school}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-7" data-testid="spa-settlements">
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
          <button onClick={() => start()} className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold px-6 py-3.5 shadow-md shadow-red-500/20 transition-colors" data-testid="spa-settlements-cta">
            {c.settlements_cta} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <h1 className="font-slab font-extrabold text-slate-900 leading-tight text-3xl sm:text-4xl lg:text-5xl" data-testid="spa-headline">{c.headline}</h1>
        <p className="mt-4 text-lg text-slate-600" data-testid="spa-subhead">{c.subhead}</p>

        <button onClick={() => start()} className="block w-full mt-6 rounded-2xl overflow-hidden shadow-lg group" data-testid="spa-hero-image-cta">
          <img src={HERO_PA} alt="Conductor varado con un vehículo averiado" className="w-full h-56 sm:h-80 object-cover transition-transform duration-500 group-hover:scale-105" />
        </button>

        <div className="mt-8 space-y-5 text-[17px] leading-relaxed text-slate-700">
          {c.body.map((para, i) => (
            <p key={i} className={i === 0 ? 'font-semibold text-slate-900' : ''}>{para}</p>
          ))}
        </div>

        <div className="my-8 rounded-2xl border-l-4 border-[#E0A800] bg-amber-50 p-6" data-testid="spa-callout">
          <p className="text-lg font-semibold text-slate-900">“{c.callout_quote}”</p>
          <button onClick={() => start()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold px-6 py-3 transition-colors" data-testid="spa-callout-cta">
            {c.callout_cta} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <h2 className="font-slab font-extrabold text-slate-900 text-2xl sm:text-3xl mt-10" data-testid="spa-section-qualify">{c.qualify_heading}</h2>
        <p className="mt-3 text-[17px] text-slate-700 leading-relaxed">{c.qualify_intro}</p>
        <ul className="mt-4 space-y-3">
          {c.qualify_items.map((t) => (
            <li key={t} className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
              <span className="text-slate-800">{t}</span>
            </li>
          ))}
        </ul>

        <img src={LOT_PA} alt="Fila de vehículos en un concesionario" className="w-full h-44 sm:h-56 object-cover rounded-2xl shadow-md mt-6" />

        <div className="mt-10">
          <p className="font-bold text-slate-900 text-lg"><span className="text-[#E0A800]">Paso 1:</span> {c.step1_label}</p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="spa-make-grid">
            {TOP_MAKES.map((m) => (
              <button key={m.slug} onClick={() => start(m.name)} data-testid={`spa-make-${m.slug}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-[#E0A800] hover:shadow-md transition-all text-left">
                <img src={makeLogo(m.slug)} alt={m.name} className="h-7 w-7 object-contain" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                <span className="font-semibold text-slate-800">{m.name}</span>
              </button>
            ))}
            <button onClick={() => start()} data-testid="spa-make-other" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-[#E0A800] hover:shadow-md transition-all font-semibold text-slate-700">
              Otra Marca <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-10 rounded-2xl bg-[#0B2545] text-white p-7 text-center" data-testid="spa-final-cta-block">
          <p className="font-bold text-lg"><span className="text-[#FACC15]">Paso 2:</span> {c.step2_label}</p>
          <p className="mt-2 text-slate-200">{c.step2_text}</p>
          <button onClick={() => start()} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] hover:bg-[#dc2f2f] text-white font-bold text-lg px-8 py-4 transition-colors w-full sm:w-auto" data-testid="spa-final-cta">
            {c.final_cta} <ArrowRight className="h-5 w-5" />
          </button>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-300">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> 100% Gratis y Confidencial</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-emerald-400" /> Toma 60 Segundos</span>
            <span className="flex items-center gap-1.5"><Scale className="h-4 w-4 text-emerald-400" /> Si No Gana, No Paga</span>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1 text-amber-400" data-testid="spa-stars">
          {[...Array(5)].map((_, i) => (<Star key={i} className="h-5 w-5 fill-amber-400" />))}
          <span className="ml-2 text-sm text-slate-500">Con la confianza de conductores en todo el país</span>
        </div>
      </article>

      <footer className="border-t border-slate-200 bg-[#0B2545] text-slate-300 mt-6">
        <div className="max-w-3xl mx-auto px-4 py-9 text-center space-y-4">
          <div className="flex flex-col items-center gap-1">
            <p className="font-slab font-extrabold text-white text-lg">The Lemon Pros</p>
            <p className="text-sm text-slate-300">{COMPANY.address}</p>
            <a href={COMPANY.phoneHrefEs} onClick={trackPhoneCallConversion} className="text-sm font-semibold text-[#FACC15] hover:text-white" data-testid="spa-footer-call">{COMPANY.phoneEs}</a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
            <button type="button" onClick={() => goLegal('/terms')} className="hover:text-white transition-colors" data-testid="spa-footer-terms">Términos de Uso</button>
            <button type="button" onClick={() => goLegal('/do-not-sell')} className="hover:text-white transition-colors" data-testid="spa-footer-dns">No Vender Mi Información</button>
            <button type="button" onClick={() => goLegal('/privacy')} className="hover:text-white transition-colors" data-testid="spa-footer-privacy">Privacidad</button>
            <button type="button" onClick={() => goLegal('/contact')} className="hover:text-white transition-colors" data-testid="spa-footer-contact">Contáctenos</button>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl mx-auto" data-testid="spa-disclaimer">
            Publicidad de Abogado. Este sitio web tiene fines informativos generales y no constituye asesoría legal. Contactar a The Lemon Pros no crea una relación abogado-cliente. Los resultados anteriores no garantizan un resultado similar. Las evaluaciones de casos son gratuitas y no hay honorarios a menos que ganemos.
          </p>
          <p className="text-xs text-slate-500" data-testid="spa-footer-copyright">
            ©{new Date().getFullYear()} The Lemon Pros. Todos los derechos reservados. Publicidad de abogado. Michael Saeedian, Esq.
          </p>
        </div>
      </footer>
    </div>
  );
}
