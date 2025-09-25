'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { normalizeLocale } from './i18n';

const LocaleContext = createContext('en-US');

function getBrowserLocale(fallback: string): string {
  if (typeof navigator === 'undefined') {
    return fallback;
  }

  const languages = Array.isArray(navigator.languages)
    ? navigator.languages
    : [];
  const preferred = languages.find((lang) => typeof lang === 'string' && lang.length > 0);
  const candidate = preferred ?? navigator.language;
  const normalizedFallback = normalizeLocale(fallback);
  const normalizedCandidate = normalizeLocale(candidate, normalizedFallback);

  if (!candidate) {
    return normalizedFallback;
  }

  const fallbackLower = normalizedFallback.toLowerCase();
  const candidateLower = normalizedCandidate.toLowerCase();

  if (fallbackLower !== 'en-us' && fallbackLower !== candidateLower) {
    const fallbackBase = fallbackLower.split('-')[0] ?? fallbackLower;
    const candidateBase = candidateLower.split('-')[0] ?? candidateLower;
    if (fallbackBase === candidateBase) {
      return normalizedFallback;
    }
  }

  return normalizedCandidate;
}

interface ProviderProps {
  locale: string;
  children: React.ReactNode;
}

export function LocaleProvider({ locale, children }: ProviderProps) {
  const [currentLocale, setCurrentLocale] = useState(() => normalizeLocale(locale));

  useEffect(() => {
    setCurrentLocale((prev) => {
      const normalized = normalizeLocale(locale);
      return prev === normalized ? prev : normalized;
    });
  }, [locale]);

  useEffect(() => {
    const applyBrowserLocale = () => {
      const browserLocale = getBrowserLocale(locale);
      setCurrentLocale((prev) => (prev === browserLocale ? prev : browserLocale));
    };

    applyBrowserLocale();

    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('languagechange', applyBrowserLocale);
    return () => {
      window.removeEventListener('languagechange', applyBrowserLocale);
    };
  }, [locale]);

  return <LocaleContext.Provider value={currentLocale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): string {
  return useContext(LocaleContext);
}
