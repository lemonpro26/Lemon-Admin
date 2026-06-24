import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'osgd_funnel_answers';
const LANG_KEY = 'osgd_lang';
const FunnelContext = createContext(null);

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function loadLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
  } catch (e) {
    return 'en';
  }
}

export function FunnelProvider({ children }) {
  const [answers, setAnswers] = useState(loadInitial);
  const [lang, setLangState] = useState(loadLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
    } catch (e) {
      // ignore
    }
  }, [answers]);

  const setAnswer = (key, value) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const resetAnswers = () => {
    setAnswers({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  };

  const setLang = (l) => {
    const next = l === 'es' ? 'es' : 'en';
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch (e) {
      // ignore
    }
  };

  return (
    <FunnelContext.Provider value={{ answers, setAnswer, resetAnswers, lang, setLang }}>
      {children}
    </FunnelContext.Provider>
  );
}

export function useFunnel() {
  const ctx = useContext(FunnelContext);
  if (!ctx) throw new Error('useFunnel must be used within FunnelProvider');
  return ctx;
}
