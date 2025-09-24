'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { normalizeLocale } from './i18n';

const LocaleContext = createContext('en-US');

interface ProviderProps {
  locale: string;
  children: React.ReactNode;
}

export function LocaleProvider({ locale, children }: ProviderProps) {
  const [currentLocale, setCurrentLocale] = useState(locale);

  useEffect(() => {
    const browserLocale = normalizeLocale(
      typeof navigator !== 'undefined' ? navigator.language : undefined,
      locale,
    );
    if (browserLocale !== currentLocale) {
      setCurrentLocale(browserLocale);
    }
  }, [locale, currentLocale]);

  return <LocaleContext.Provider value={currentLocale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): string {
  return useContext(LocaleContext);
}
