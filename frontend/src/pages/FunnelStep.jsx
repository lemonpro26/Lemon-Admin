import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CarFront } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { FUNNEL_STEPS, STEP_IDS, getStep, getStepIndex } from '@/lib/funnel';
import { CAR_YEARS, CAR_MAKES, getModels, makeLogo } from '@/lib/carData';
import { useFunnel } from '@/context/FunnelContext';
import { getTracking, getSessionId } from '@/lib/tracking';
import { NotchedField } from '@/components/NotchedField';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';

const RED_BTN =
  'h-14 w-full rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-lg shadow-sm transition-colors disabled:opacity-70';

/* ---------------- Year picker ---------------- */
function YearStep({ onSelect }) {
  return (
    <div
      className="mx-auto max-w-2xl grid grid-cols-3 sm:grid-cols-4 gap-[clamp(8px,1.4vh,12px)] max-h-[52vh] overflow-y-auto px-1 pb-2"
      data-testid="year-grid"
    >
      {CAR_YEARS.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => onSelect(y)}
          className="h-14 rounded-xl border border-slate-200 bg-white font-semibold text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-[#FACC15] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.10)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
          data-testid={`year-option-${y}`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Make picker (logo cards) ---------------- */
function MakeStep({ onSelect }) {
  return (
    <div
      className="mx-auto max-w-3xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-[clamp(8px,1.4vh,14px)] max-h-[54vh] overflow-y-auto px-1 pb-2"
      data-testid="make-grid"
    >
      {CAR_MAKES.map((m) => (
        <button
          key={m.slug || m.name}
          type="button"
          onClick={() => onSelect(m.name)}
          className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-[#FACC15] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
          data-testid={`make-option-${m.slug || 'other'}`}
        >
          {m.slug ? (
            <img
              src={makeLogo(m.slug)}
              alt={`${m.name} logo`}
              loading="lazy"
              className="h-10 w-10 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className="h-10 w-10 flex items-center justify-center rounded-full bg-yellow-50 border border-yellow-200">
              <CarFront className="h-5 w-5 text-yellow-600" />
            </span>
          )}
          <span className="text-sm font-semibold text-slate-800 text-center leading-tight">{m.name}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- Model picker ---------------- */
function ModelStep({ make, onSelect }) {
  const models = getModels(make);
  return (
    <div
      className="mx-auto max-w-2xl grid grid-cols-2 sm:grid-cols-3 gap-[clamp(8px,1.4vh,12px)] max-h-[52vh] overflow-y-auto px-1 pb-2"
      data-testid="model-grid"
    >
      {models.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelect(m)}
          className="min-h-14 px-3 py-3 rounded-xl border border-slate-200 bg-white font-semibold text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-[#FACC15] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.10)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
          data-testid={`model-option-${m.replace(/[^a-zA-Z0-9]/g, '-')}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Address step (with verification) ---------------- */
function AddressStep({ answers, setAnswer, onNext, t }) {
  const [street, setStreet] = useState(answers.address || '');
  const [city, setCity] = useState(answers.city || '');
  const [state, setState] = useState(answers.state || '');
  const [zip, setZip] = useState(answers.zip || '');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!street.trim()) {
      setError(t.errors.street);
      return;
    }
    if (!/^\d{5}$/.test(zip.trim())) {
      setError(t.errors.zip);
      return;
    }
    setError('');
    setVerifying(true);
    try {
      if (!city || !state) {
        const g = await api.get(`/geo-zip?zip=${encodeURIComponent(zip)}`);
        if (g.data.found) {
          setCity(g.data.city);
          setState(g.data.state);
        }
      }
    } catch (e2) {
      /* ignore */
    }
    try {
      const res = await api.post('/verify-address', { address: street, city, state, zip });
      setAnswer('address', street.trim());
      setAnswer('city', city);
      setAnswer('state', state);
      setAnswer('zip', zip);
      if (res.data.valid || res.data.soft) {
        onNext();
      } else {
        setError(t.errors.addrUnverified);
      }
    } catch (err) {
      setAnswer('address', street.trim());
      setAnswer('zip', zip);
      onNext();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl w-full grid gap-4">
      <NotchedField
        label={t.fields.street}
        value={street}
        onChange={(e) => setStreet(e.target.value)}
        placeholder={t.fields.streetPh}
        data-testid="address-street-input"
        autoFocus
      />
      <div className="grid grid-cols-3 gap-3">
        <NotchedField label={t.fields.city} value={city} onChange={(e) => setCity(e.target.value)} placeholder={t.fields.cityPh} data-testid="address-city-input" />
        <NotchedField label={t.fields.state} value={state} onChange={(e) => setState(e.target.value)} placeholder={t.fields.statePh} data-testid="address-state-input" />
        <NotchedField
          label={t.fields.zip}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
          placeholder={t.fields.zipPh}
          inputMode="numeric"
          data-testid="address-zip-input"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={verifying} className={`mt-3 ${RED_BTN}`} data-testid="address-continue-button">
        {verifying ? t.buttons.verifying : t.buttons.continue}
      </Button>
    </form>
  );
}

/* ---------------- Name step ---------------- */
function NameStep({ answers, setAnswer, onNext, t }) {
  const [first, setFirst] = useState(answers.first_name || '');
  const [last, setLast] = useState(answers.last_name || '');
  const [errors, setErrors] = useState({});

  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!first.trim()) er.first = t.errors.first;
    if (!last.trim()) er.last = t.errors.last;
    setErrors(er);
    if (Object.keys(er).length) return;
    setAnswer('first_name', first.trim());
    setAnswer('last_name', last.trim());
    onNext();
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl w-full grid gap-4">
      <NotchedField label={t.fields.firstName} value={first} onChange={(e) => setFirst(e.target.value)}
        placeholder={t.fields.firstPh} error={errors.first} data-testid="name-first-input" autoFocus />
      <NotchedField label={t.fields.lastName} value={last} onChange={(e) => setLast(e.target.value)}
        placeholder={t.fields.lastPh} error={errors.last} data-testid="name-last-input" />
      <Button type="submit" className={`mt-3 ${RED_BTN}`} data-testid="name-continue-button">{t.buttons.continue}</Button>
    </form>
  );
}

/* ---------------- Phone step ---------------- */
function PhoneStep({ answers, setAnswer, onNext, t }) {
  const [phone, setPhone] = useState(answers.phone || '');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[0-9+()\-\s]{7,}$/.test(phone.trim())) {
      setError(t.errors.phone);
      return;
    }
    setError('');
    setChecking(true);
    try {
      const res = await api.post('/verify-phone', { phone: phone.trim(), region: 'US' });
      if (res.data.valid) {
        setAnswer('phone', res.data.formatted || phone.trim());
        onNext();
      } else {
        setError(t.errors.phoneReal);
      }
    } catch (err) {
      setAnswer('phone', phone.trim());
      onNext();
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl w-full">
      <NotchedField label={t.fields.phone} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
        placeholder={t.fields.phonePh} error={error} data-testid="phone-input" autoFocus />
      <Button type="submit" disabled={checking} className={`mt-7 ${RED_BTN}`} data-testid="phone-continue-button">
        {checking ? t.buttons.checking : t.buttons.continue}
      </Button>
    </form>
  );
}

/* ---------------- Email step (final → submit) ---------------- */
function EmailStep({ answers, setAnswer, onSubmit, submitting, t }) {
  const [email, setEmail] = useState(answers.email || '');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError(t.errors.email);
      return;
    }
    setError('');
    setChecking(true);
    try {
      const res = await api.post('/verify-email', { email: email.trim() });
      if (!res.data.valid) {
        setError(res.data.reason === 'undeliverable' ? t.errors.emailUndeliverable : t.errors.email);
        setChecking(false);
        return;
      }
      const clean = res.data.normalized || email.trim();
      setEmail(clean);
      setAnswer('email', clean);
      onSubmit(clean);
    } catch (err) {
      setAnswer('email', email.trim());
      onSubmit(email.trim());
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl w-full">
      <NotchedField label={t.fields.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder={t.fields.emailPh} error={error} data-testid="email-input" autoFocus />
      <Button type="submit" disabled={submitting || checking} className={`mt-7 ${RED_BTN}`} data-testid="email-submit-button">
        {submitting || checking ? t.buttons.submitting : t.buttons.submit}
      </Button>
      <p className="mt-6 text-[11px] leading-relaxed text-slate-400 text-center">
        {t.consent}{' '}
        <span className="text-blue-500">{t.consentTerms}</span> {t.consentAnd}{' '}
        <span className="text-blue-500">{t.consentPrivacy}</span>.
      </p>
    </form>
  );
}

/* ---------------- Main ---------------- */
export default function FunnelStep() {
  const { step: stepId } = useParams();
  const navigate = useNavigate();
  const { answers, setAnswer, lang } = useFunnel();
  const t = tr(lang);
  const [submitting, setSubmitting] = useState(false);

  const step = getStep(stepId);
  const index = getStepIndex(stepId);
  const total = STEP_IDS.length;
  const stepText = (t.steps && t.steps[stepId]) || {};

  useEffect(() => {
    if (!answers.started) {
      navigate(lang === 'es' ? '/sp' : '/', { replace: true });
      return;
    }
    if (!step) navigate(`/flow/${STEP_IDS[0]}`, { replace: true });
    window.scrollTo(0, 0);
  }, [stepId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null;

  const goNext = () => {
    if (index < total - 1) navigate(`/flow/${STEP_IDS[index + 1]}`);
  };

  const selectAndNext = (field, value) => {
    setAnswer(field, value);
    setTimeout(goNext, 140);
  };

  const submitLead = async (emailVal) => {
    setSubmitting(true);
    try {
      const tracking = getTracking();
      const payload = {
        car_year: answers.car_year || '',
        car_make: answers.car_make || '',
        car_model: answers.car_model || '',
        address: answers.address || '',
        city: answers.city || '',
        state: answers.state || '',
        zip: answers.zip || '',
        first_name: answers.first_name || '',
        last_name: answers.last_name || '',
        phone: answers.phone || '',
        email: emailVal || answers.email || '',
        session_id: getSessionId(),
        source_page: answers.source_page || 'home',
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
      };
      await api.post('/leads', payload);
      navigate('/thank-you');
    } catch (e) {
      toast.error(t.errors.submit);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-full flex flex-col justify-start px-4 sm:px-6 pt-[clamp(16px,3.5vh,40px)] pb-8"
      data-testid="page-flow"
    >
      <motion.div
        key={stepId}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-3xl mx-auto"
        data-testid="flow-step-container"
      >
        <div className="text-center mb-[clamp(14px,2.5vh,26px)]">
          <h2 className="font-mock font-extrabold text-[clamp(1.6rem,4vw,2.5rem)] text-[#0F1B3D] leading-tight" data-testid="flow-question">
            {stepText.q}
          </h2>
          {stepText.sub && (
            <p className="mt-2 text-[clamp(0.95rem,1.7vw,1.125rem)] font-semibold text-[#EF4444]" data-testid="flow-subtitle">{stepText.sub}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-[0_18px_50px_rgba(15,27,61,0.16)] p-4 sm:p-6">
          {step.type === 'year' && <YearStep onSelect={(v) => selectAndNext('car_year', v)} />}
          {step.type === 'make' && <MakeStep onSelect={(v) => selectAndNext('car_make', v)} />}
          {step.type === 'model' && <ModelStep make={answers.car_make} onSelect={(v) => selectAndNext('car_model', v)} />}
          {step.type === 'name' && <NameStep answers={answers} setAnswer={setAnswer} onNext={goNext} t={t} />}
          {step.type === 'address' && <AddressStep answers={answers} setAnswer={setAnswer} onNext={goNext} t={t} />}
          {step.type === 'phone' && <PhoneStep answers={answers} setAnswer={setAnswer} onNext={goNext} t={t} />}
          {step.type === 'email' && (
            <EmailStep answers={answers} setAnswer={setAnswer} onSubmit={submitLead} submitting={submitting} t={t} />
          )}
        </div>
      </motion.div>
    </div>
  );
}
