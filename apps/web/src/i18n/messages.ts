import type { AbstractIntlMessages } from 'next-intl';
import enGB from '../messages/en-GB.json';
import esES from '../messages/es-ES.json';
import { NEUTRAL_FALLBACK_LOCALE, normalizeLocale } from '../lib/i18n';

export const SUPPORTED_MESSAGE_LOCALES = ['en-GB', 'es-ES'] as const;
export type SupportedMessageLocale = (typeof SUPPORTED_MESSAGE_LOCALES)[number];

const MESSAGE_MAP: Record<SupportedMessageLocale, AbstractIntlMessages> = {
  'en-GB': enGB,
  'es-ES': esES,
};

export function resolveMessageLocale(
  locale: string | null | undefined,
): SupportedMessageLocale {
  const normalized = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
  const canonical = normalized.toLowerCase();
  if (canonical.startsWith('es')) {
    return 'es-ES';
  }
  return 'en-GB';
}

export function getMessages(locale: string | null | undefined): AbstractIntlMessages {
  const messageLocale = resolveMessageLocale(locale);
  return MESSAGE_MAP[messageLocale];
}

export function prepareMessages(locale: string | null | undefined): {
  locale: string;
  messageLocale: SupportedMessageLocale;
  messages: AbstractIntlMessages;
} {
  const normalizedLocale = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
  const messageLocale = resolveMessageLocale(normalizedLocale);
  return {
    locale: normalizedLocale,
    messageLocale,
    messages: MESSAGE_MAP[messageLocale],
  };
}
