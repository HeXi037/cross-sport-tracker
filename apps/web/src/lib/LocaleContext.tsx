'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  getStoredLocale,
  normalizeLocale,
  parseAcceptLanguage,
  storeLocalePreference,
  NEUTRAL_FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
} from './i18n';
import {
  loadUserSettings,
  USER_SETTINGS_STORAGE_KEY,
  USER_SETTINGS_CHANGED_EVENT,
} from '../app/user-settings';

const LocaleContext = createContext(NEUTRAL_FALLBACK_LOCALE);

function resolveLocaleCandidates(
  fallback: string,
  acceptLanguage?: string | null,
  storedLocale?: string | null,
  preferredLocale?: string | null,
): string[] {
  const normalizedFallback = normalizeLocale(fallback);
  const candidates: string[] = [];
  const normalizedPreferred = normalizeLocale(preferredLocale, '');
  const normalizedStored = normalizeLocale(storedLocale, '');

  if (normalizedPreferred) {
    candidates.push(normalizedPreferred);
  }

  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage, normalizedFallback);
    if (parsed) {
      candidates.push(parsed);
    }
  }

  if (normalizedStored && normalizedStored !== normalizedPreferred) {
    candidates.push(normalizedStored);
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

  return Array.from(new Set(candidates));
}

function pickLocaleCandidate(
  candidates: string[],
  fallback: string,
): string {
  const normalizedFallback = normalizeLocale(fallback, NEUTRAL_FALLBACK_LOCALE);

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate, '');
    if (!normalized) {
      continue;
    }

    if (normalized === normalizedFallback) {
      continue;
    }

    return normalized;
  }

  return normalizedFallback;
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
    if (typeof document === 'undefined') {
      return;
    }
    const normalized = normalizeLocale(currentLocale, NEUTRAL_FALLBACK_LOCALE);
    document.documentElement.lang = normalized;
  }, [currentLocale]);

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
      const preferredSettingsLocale = (() => {
        try {
          const settings = loadUserSettings();
          const normalizedPreferred = normalizeLocale(
            settings.preferredLocale,
            '',
          );
          return normalizedPreferred || null;
        } catch {
          return null;
        }
      })();
      const candidates = resolveLocaleCandidates(
        fallback,
        acceptLanguage,
        storedLocale,
        preferredSettingsLocale,
      );
      const nextLocale = pickLocaleCandidate(candidates, fallback);
      setCurrentLocale((prev) => (prev === nextLocale ? prev : nextLocale));
      storeLocalePreference(nextLocale);
    };

    applyResolvedLocale();

    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('languagechange', applyResolvedLocale);
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, applyResolvedLocale);
    const handleStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === USER_SETTINGS_STORAGE_KEY ||
        event.key === LOCALE_STORAGE_KEY
      ) {
        applyResolvedLocale();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('languagechange', applyResolvedLocale);
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, applyResolvedLocale);
      window.removeEventListener('storage', handleStorage);
    };
  }, [acceptLanguage, locale]);

  return <LocaleContext.Provider value={currentLocale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): string {
  return useContext(LocaleContext);
}
