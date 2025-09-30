'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NextIntlClientProvider,
  type AbstractIntlMessages,
} from 'next-intl';
import { useLocale, useTimeZone } from '../lib/LocaleContext';
import {
  loadLocaleMessages,
  resolveSupportedLocale,
} from '../i18n/messages';
import { NEUTRAL_FALLBACK_LOCALE, normalizeLocale } from '../lib/i18n';

interface Props {
  initialLocale: string;
  initialMessages: AbstractIntlMessages;
  children: React.ReactNode;
}

export default function LocalizedMessagesProvider({
  initialLocale,
  initialMessages,
  children,
}: Props) {
  const contextLocale = useLocale();
  const timeZone = useTimeZone();
  const initialSupported = useMemo(
    () => resolveSupportedLocale(initialLocale),
    [initialLocale],
  );
  const messagesCacheRef = useRef<Record<string, AbstractIntlMessages>>({
    [initialSupported]: initialMessages,
  });
  const [activeLocale, setActiveLocale] = useState(initialSupported);
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    const normalizedContextLocale = normalizeLocale(
      contextLocale,
      NEUTRAL_FALLBACK_LOCALE,
    );
    const supportedLocale = resolveSupportedLocale(normalizedContextLocale);

    if (messagesCacheRef.current[supportedLocale]) {
      setActiveLocale(supportedLocale);
      setMessages(messagesCacheRef.current[supportedLocale]);
      return;
    }

    let cancelled = false;

    void loadLocaleMessages(supportedLocale)
      .then(({ locale: loadedLocale, messages: loadedMessages }) => {
        if (cancelled) return;
        messagesCacheRef.current[loadedLocale] = loadedMessages;
        setActiveLocale(loadedLocale);
        setMessages(loadedMessages);
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          const { locale: fallbackLocale, messages: fallbackMessages } =
            await loadLocaleMessages(NEUTRAL_FALLBACK_LOCALE);
          messagesCacheRef.current[fallbackLocale] = fallbackMessages;
          setActiveLocale(fallbackLocale);
          setMessages(fallbackMessages);
        } catch (fallbackError) {
          console.error('Failed to load fallback locale messages', fallbackError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contextLocale]);

  return (
    <NextIntlClientProvider
      locale={activeLocale}
      timeZone={timeZone}
      messages={messages}
    >
      {children}
    </NextIntlClientProvider>
  );
}
