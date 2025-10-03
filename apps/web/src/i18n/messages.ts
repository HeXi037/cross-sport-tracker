import type { AbstractIntlMessages } from 'next-intl';
import { NEUTRAL_FALLBACK_LOCALE, normalizeLocale } from '../lib/i18n';

export const SUPPORTED_LOCALES = ['en-GB', 'en-AU', 'es-ES'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function resolveSupportedLocale(locale: string): SupportedLocale {
  const normalized = normalizeLocale(locale, NEUTRAL_FALLBACK_LOCALE);
  if ((SUPPORTED_LOCALES as readonly string[]).includes(normalized)) {
    return normalized as SupportedLocale;
  }

  const normalizedLower = normalized.toLowerCase();
  const matching = SUPPORTED_LOCALES.find(
    (candidate) => candidate.toLowerCase() === normalizedLower,
  );

  return matching ?? SUPPORTED_LOCALES[0];
}

async function importMessages(locale: SupportedLocale): Promise<AbstractIntlMessages> {
  switch (locale) {
    case 'en-AU':
      return (await import('../messages/en-AU.json')).default;
    case 'es-ES':
      return (await import('../messages/es-ES.json')).default;
    case 'en-GB':
    default:
      return (await import('../messages/en-GB.json')).default;
  }
}

export async function loadLocaleMessages(locale: string): Promise<{
  locale: SupportedLocale;
  messages: AbstractIntlMessages;
}> {
  const supportedLocale = resolveSupportedLocale(locale);
  const messages = await importMessages(supportedLocale);

  return { locale: supportedLocale, messages };
}
