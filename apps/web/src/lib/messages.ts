import enMessages from '../messages/en.json';
import esMessages from '../messages/es.json';
import { NEUTRAL_FALLBACK_LOCALE, normalizeLocale } from './i18n';

export type AppMessages = typeof enMessages;
export type MessageLocale = 'en' | 'es';

const MESSAGE_MAP: Record<MessageLocale, AppMessages> = Object.freeze({
  en: enMessages,
  es: esMessages,
});

export function resolveMessageLocale(locale: string): MessageLocale {
  const normalized = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);

  try {
    const intlLocale = new Intl.Locale(normalized);
    const language = intlLocale.language?.toLowerCase();
    if (language === 'es') {
      return 'es';
    }
  } catch {
    // Ignore and fall back to matching via prefix.
  }

  const lower = normalized.toLowerCase();
  if (lower.startsWith('es')) {
    return 'es';
  }

  return 'en';
}

export function getMessagesForLocale(locale: string): AppMessages {
  const resolved = resolveMessageLocale(locale);
  return MESSAGE_MAP[resolved];
}

export function getAllMessages(): Record<MessageLocale, AppMessages> {
  return MESSAGE_MAP;
}
