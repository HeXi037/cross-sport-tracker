import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE_KEY,
  TIME_ZONE_COOKIE_KEY,
  normalizeLocale,
  parseAcceptLanguage,
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

  return {
    locale: normalizeLocale(
      cookieLocale,
      parseAcceptLanguage(normalizedAcceptLanguage),
    ),
    acceptLanguage: normalizedAcceptLanguage,
    preferredTimeZone,
  };
}
