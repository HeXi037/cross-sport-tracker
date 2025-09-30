'use client';

import { useMemo, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { useLocale, useTimeZone } from './LocaleContext';
import { NEUTRAL_FALLBACK_LOCALE, normalizeLocale } from './i18n';
import { type AppMessages, resolveMessageLocale } from './messages';

export type MessagesByLocale = Record<string, AppMessages>;

interface TranslationProviderProps {
  initialLocale: string;
  messagesByLocale: MessagesByLocale;
  children: ReactNode;
}

export default function TranslationProvider({
  initialLocale,
  messagesByLocale,
  children,
}: TranslationProviderProps) {
  const localeFromContext = useLocale();
  const timeZone = useTimeZone();

  const activeLocale = normalizeLocale(
    localeFromContext,
    normalizeLocale(initialLocale, NEUTRAL_FALLBACK_LOCALE),
  );

  const messages = useMemo(() => {
    const fallbackLocale = resolveMessageLocale(initialLocale);
    const resolvedLocale = resolveMessageLocale(activeLocale);
    const neutralLocale = resolveMessageLocale(NEUTRAL_FALLBACK_LOCALE);
    const fallbackMessages =
      messagesByLocale[fallbackLocale] ??
      messagesByLocale[neutralLocale] ??
      Object.values(messagesByLocale)[0];
    const resolvedMessages = messagesByLocale[resolvedLocale];
    return resolvedMessages ?? fallbackMessages;
  }, [activeLocale, initialLocale, messagesByLocale]);

  return (
    <NextIntlClientProvider
      locale={activeLocale}
      timeZone={timeZone ?? undefined}
      messages={messages}
    >
      {children}
    </NextIntlClientProvider>
  );
}
