'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  getStoredLocale,
  normalizeLocale,
  parseAcceptLanguage,
  storeLocalePreference,
  NEUTRAL_FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  resolveTimeZone,
  storeTimeZonePreference,
  DEFAULT_TIME_ZONE,
  normalizeTimeZone,
  TIME_ZONE_STORAGE_KEY,
} from './i18n';
import {
  loadUserSettings,
  USER_SETTINGS_STORAGE_KEY,
  USER_SETTINGS_CHANGED_EVENT,
} from '../app/user-settings';

const LocaleContext = createContext(NEUTRAL_FALLBACK_LOCALE);
const TimeZoneContext = createContext(DEFAULT_TIME_ZONE);

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

  if (normalizedStored && normalizedStored !== normalizedPreferred) {
    candidates.push(normalizedStored);
  }

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
  timeZone?: string | null;
  children: React.ReactNode;
}

export function LocaleProvider({
  locale,
  acceptLanguage,
  timeZone,
  children,
}: ProviderProps) {
  const [currentLocale, setCurrentLocale] = useState(() =>
    normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE),
  );
  const [currentTimeZone, setCurrentTimeZone] = useState(() =>
    resolveTimeZone(timeZone),
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
    const applyResolvedPreferences = () => {
      const fallbackLocale = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
      const storedLocale = getStoredLocale();
      const preferredSettings = (() => {
        try {
          return loadUserSettings();
        } catch {
          return null;
        }
      })();
      const preferredSettingsLocale = normalizeLocale(
        preferredSettings?.preferredLocale,
        '',
      );
      const candidates = resolveLocaleCandidates(
        fallbackLocale,
        acceptLanguage,
        storedLocale,
        preferredSettingsLocale,
      );
      const nextLocale = pickLocaleCandidate(candidates, fallbackLocale);
      setCurrentLocale((prev) => (prev === nextLocale ? prev : nextLocale));
      storeLocalePreference(nextLocale);

      const cookieTimeZone = normalizeTimeZone(timeZone, '');
      const preferredSettingsTimeZone = normalizeTimeZone(
        preferredSettings?.preferredTimeZone,
        '',
      );
      const nextTimeZone = resolveTimeZone(
        preferredSettingsTimeZone || cookieTimeZone || null,
      );
      setCurrentTimeZone((prev) => (prev === nextTimeZone ? prev : nextTimeZone));
      storeTimeZonePreference(nextTimeZone);
    };

    applyResolvedPreferences();

    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('languagechange', applyResolvedPreferences);
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, applyResolvedPreferences);
    const handleStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === USER_SETTINGS_STORAGE_KEY ||
        event.key === LOCALE_STORAGE_KEY ||
        event.key === TIME_ZONE_STORAGE_KEY
      ) {
        applyResolvedPreferences();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('languagechange', applyResolvedPreferences);
      window.removeEventListener(
        USER_SETTINGS_CHANGED_EVENT,
        applyResolvedPreferences,
      );
      window.removeEventListener('storage', handleStorage);
    };
  }, [acceptLanguage, locale, timeZone]);

  return (
    <LocaleContext.Provider value={currentLocale}>
      <TimeZoneContext.Provider value={currentTimeZone}>
        {children}
      </TimeZoneContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): string {
  return useContext(LocaleContext);
}

export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
