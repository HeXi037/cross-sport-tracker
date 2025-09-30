'use client';

import { NextIntlClientProvider } from 'next-intl';
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
import { prepareMessages } from '../i18n/messages';

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

interface LocaleCandidateOptions {
  preferredLocale?: string | null;
  storedLocale?: string | null;
}

function pickLocaleCandidate(
  candidates: string[],
  fallback: string,
  options: LocaleCandidateOptions = {},
): string {
  const normalizedFallback = normalizeLocale(fallback, NEUTRAL_FALLBACK_LOCALE);

  const normalizedCandidates = candidates
    .map((candidate) => normalizeLocale(candidate, ''))
    .filter((candidate): candidate is string => Boolean(candidate));

  const normalizedPreferred = normalizeLocale(options.preferredLocale, '');
  if (
    normalizedPreferred &&
    normalizedCandidates.includes(normalizedPreferred)
  ) {
    return normalizedPreferred;
  }

  const normalizedStored = normalizeLocale(options.storedLocale, '');
  if (
    normalizedStored &&
    normalizedStored !== normalizedFallback &&
    normalizedCandidates.includes(normalizedStored)
  ) {
    return normalizedStored;
  }

  const australianCandidate = normalizedCandidates.find((candidate) =>
    candidate.toLowerCase().startsWith('en-au'),
  );
  if (australianCandidate) {
    return australianCandidate;
  }

  return normalizedCandidates[0] ?? normalizedFallback;
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
  const initialLocale = (() => {
    const normalizedProvided = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
    const fallbackFromHeader = parseAcceptLanguage(
      acceptLanguage,
      normalizedProvided,
    );
    const storedLocale = getStoredLocale();
    const preferredSettingsLocale = (() => {
      try {
        const settings = loadUserSettings();
        return normalizeLocale(settings.preferredLocale, '');
      } catch {
        return '';
      }
    })();

    const candidates = resolveLocaleCandidates(
      fallbackFromHeader,
      acceptLanguage,
      storedLocale,
      preferredSettingsLocale,
    );

    return pickLocaleCandidate(candidates, fallbackFromHeader, {
      preferredLocale: preferredSettingsLocale,
      storedLocale,
    });
  })();

  const [currentLocale, setCurrentLocale] = useState(initialLocale);
  const [currentTimeZone, setCurrentTimeZone] = useState(() =>
    resolveTimeZone(timeZone, initialLocale),
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const normalized = normalizeLocale(currentLocale, NEUTRAL_FALLBACK_LOCALE);
    document.documentElement.lang = normalized;
  }, [currentLocale]);

  useEffect(() => {
    const applyResolvedPreferences = () => {
      const normalizedProvided = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
      const fallbackLocale = parseAcceptLanguage(
        acceptLanguage,
        normalizedProvided,
      );
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
      const nextLocale = pickLocaleCandidate(candidates, fallbackLocale, {
        preferredLocale: preferredSettingsLocale,
        storedLocale,
      });
      setCurrentLocale((prev) => (prev === nextLocale ? prev : nextLocale));

      const shouldPersistLocale = Boolean(
        storedLocale ||
          preferredSettingsLocale ||
          acceptLanguage ||
          nextLocale !== normalizedProvided,
      );
      if (shouldPersistLocale) {
        storeLocalePreference(nextLocale);
      }

      const cookieTimeZone = normalizeTimeZone(timeZone, '');
      const preferredSettingsTimeZone = normalizeTimeZone(
        preferredSettings?.preferredTimeZone,
        '',
      );
      const nextTimeZone = resolveTimeZone(
        preferredSettingsTimeZone || cookieTimeZone || null,
        nextLocale,
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

  const { messages } = prepareMessages(currentLocale);

  return (
    <LocaleContext.Provider value={currentLocale}>
      <TimeZoneContext.Provider value={currentTimeZone}>
        <NextIntlClientProvider
          locale={currentLocale}
          messages={messages}
          timeZone={currentTimeZone}
        >
          {children}
        </NextIntlClientProvider>
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
