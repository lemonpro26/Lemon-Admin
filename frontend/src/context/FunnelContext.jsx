import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'osgd_funnel_answers';
const FunnelContext = createContext(null);

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function FunnelProvider({ children }) {
  const [answers, setAnswers] = useState(loadInitial);

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

  return (
    <FunnelContext.Provider value={{ answers, setAnswer, resetAnswers }}>
      {children}
    </FunnelContext.Provider>
  );
}

export function useFunnel() {
  const ctx = useContext(FunnelContext);
  if (!ctx) throw new Error('useFunnel must be used within FunnelProvider');
  return ctx;
}
