import { getRequestConfig } from 'next-intl/server';
import { loadLocaleMessages } from './messages';
import { NEUTRAL_FALLBACK_LOCALE } from '../lib/i18n';
import { resolveServerLocale } from '../lib/server-locale';

export default getRequestConfig(async () => {
  const { locale } = resolveServerLocale();
  try {
    const { locale: supportedLocale, messages } = await loadLocaleMessages(
      locale ?? NEUTRAL_FALLBACK_LOCALE,
    );
    return { locale: supportedLocale, messages };
  } catch (error) {
    console.error('Failed to load locale messages', locale, error);
    const { locale: fallbackLocale, messages } = await loadLocaleMessages(
      NEUTRAL_FALLBACK_LOCALE,
    );
    return { locale: fallbackLocale, messages };
  }
});
