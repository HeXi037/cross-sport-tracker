'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { normalizeLocale, parseAcceptLanguage } from './i18n';

const LocaleContext = createContext('en-US');

function resolveLocaleCandidates(
  fallback: string,
  acceptLanguage?: string | null,
): string[] {
  const normalizedFallback = normalizeLocale(fallback);
  const candidates: string[] = [];

  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage, normalizedFallback);
    if (parsed) {
      candidates.push(parsed);
    }
  }

  if (typeof navigator !== 'undefined') {
    const browserLanguages = Array.isArray(navigator.languages)
      ? navigator.languages.filter(
          (lang): lang is string => typeof lang === 'string' && lang.length > 0,
        )
      : [];
    candidates.push(...browserLanguages);

    if (typeof navigator.language === 'string' && navigator.language.length > 0) {
      candidates.push(navigator.language);
    }
  }

  candidates.push(normalizedFallback);

  return candidates;
}

interface ProviderProps {
  locale: string;
  acceptLanguage?: string | null;
  children: React.ReactNode;
}

export function LocaleProvider({ locale, acceptLanguage, children }: ProviderProps) {
  const [currentLocale, setCurrentLocale] = useState(() => normalizeLocale(locale));

  useEffect(() => {
    setCurrentLocale((prev) => {
      const normalized = normalizeLocale(locale);
      return prev === normalized ? prev : normalized;
    });
  }, [locale]);

  useEffect(() => {
    const applyResolvedLocale = () => {
      const fallback = normalizeLocale(locale);
      const candidates = resolveLocaleCandidates(fallback, acceptLanguage);
      const nextLocale = normalizeLocale(candidates[0], fallback);
      setCurrentLocale((prev) => (prev === nextLocale ? prev : nextLocale));
    };

    applyResolvedLocale();

    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('languagechange', applyResolvedLocale);
    return () => {
      window.removeEventListener('languagechange', applyResolvedLocale);
    };
  }, [acceptLanguage, locale]);

  return <LocaleContext.Provider value={currentLocale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): string {
  return useContext(LocaleContext);
}
