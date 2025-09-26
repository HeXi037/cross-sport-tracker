'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  getStoredLocale,
  normalizeLocale,
  parseAcceptLanguage,
  storeLocalePreference,
  NEUTRAL_FALLBACK_LOCALE,
} from './i18n';

const LocaleContext = createContext(NEUTRAL_FALLBACK_LOCALE);

function resolveLocaleCandidates(
  fallback: string,
  acceptLanguage?: string | null,
  storedLocale?: string | null,
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

  const normalizedStored = normalizeLocale(storedLocale, '');
  if (normalizedStored) {
    candidates.push(normalizedStored);
  }

  candidates.push(normalizedFallback);

  return Array.from(new Set(candidates));
}

function pickLocaleCandidate(
  candidates: string[],
  fallback: string,
  storedLocale?: string | null,
): string {
  const normalizedStored = normalizeLocale(storedLocale, '');
  const normalizedFallback = normalizeLocale(fallback, NEUTRAL_FALLBACK_LOCALE);

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate, '');
    if (!normalized) {
      continue;
    }

    if (normalizedStored && normalized === normalizedStored) {
      continue;
    }

    if (normalized === normalizedFallback) {
      continue;
    }

    return normalized;
  }

  if (normalizedStored) {
    return normalizedStored;
  }

  return normalizedFallback;
}

function shouldStoreLocale(nextLocale: string, storedLocale?: string | null): boolean {
  const normalizedStored = normalizeLocale(storedLocale, '');
  return nextLocale !== normalizedStored;
}

interface ProviderProps {
  locale: string;
  acceptLanguage?: string | null;
  children: React.ReactNode;
}

export function LocaleProvider({ locale, acceptLanguage, children }: ProviderProps) {
  const [currentLocale, setCurrentLocale] = useState(() =>
    normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE),
  );

  useEffect(() => {
    setCurrentLocale((prev) => {
      const normalized = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
      return prev === normalized ? prev : normalized;
    });
  }, [locale]);

  useEffect(() => {
    const applyResolvedLocale = () => {
      const fallback = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
      const storedLocale = getStoredLocale();
      const candidates = resolveLocaleCandidates(fallback, acceptLanguage, storedLocale);
      const nextLocale = pickLocaleCandidate(candidates, fallback, storedLocale);
      setCurrentLocale((prev) => (prev === nextLocale ? prev : nextLocale));
      if (shouldStoreLocale(nextLocale, storedLocale)) {
        storeLocalePreference(nextLocale);
      }
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
