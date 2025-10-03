import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE_KEY,
  TIME_ZONE_COOKIE_KEY,
  NEUTRAL_FALLBACK_LOCALE,
  normalizeLocale,
  parseAcceptLanguage,
  isAustralianTimeZone,
} from './i18n';

export type ResolveServerLocaleOptions = {
  cookieStore?: ReturnType<typeof cookies>;
  acceptLanguage?: string | null;
};

export function resolveServerLocale(
  options: ResolveServerLocaleOptions = {},
): {
  locale: string;
  acceptLanguage: string | null;
  preferredTimeZone: string | null;
} {
  const cookieStore = options.cookieStore ?? cookies();
  const acceptLanguage =
    options.acceptLanguage !== undefined
      ? options.acceptLanguage
      : headers().get('accept-language');

  const normalizedAcceptLanguage =
    typeof acceptLanguage === 'string' && acceptLanguage.trim().length > 0
      ? acceptLanguage.trim()
      : null;

  const cookieLocale = cookieStore.get(LOCALE_COOKIE_KEY)?.value ?? null;
  const rawTimeZone = cookieStore.get(TIME_ZONE_COOKIE_KEY)?.value ?? null;
  const preferredTimeZone =
    typeof rawTimeZone === 'string' && rawTimeZone.trim().length > 0
      ? rawTimeZone.trim()
      : null;

  const fallbackFromHeader = normalizedAcceptLanguage
    ? parseAcceptLanguage(normalizedAcceptLanguage, NEUTRAL_FALLBACK_LOCALE)
    : NEUTRAL_FALLBACK_LOCALE;

  const normalizedCookieLocale = normalizeLocale(cookieLocale, '');
  const normalizedFallback = normalizeLocale(
    fallbackFromHeader,
    NEUTRAL_FALLBACK_LOCALE,
  );

  let resolvedLocale = normalizedCookieLocale || normalizedFallback;

  if (!normalizedCookieLocale && isAustralianTimeZone(preferredTimeZone)) {
    resolvedLocale = 'en-AU';
  }

  return {
    locale: normalizeLocale(resolvedLocale, NEUTRAL_FALLBACK_LOCALE),
    acceptLanguage: normalizedAcceptLanguage,
    preferredTimeZone,
  };
}
