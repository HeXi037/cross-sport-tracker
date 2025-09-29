import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE_KEY,
  normalizeLocale,
  parseAcceptLanguage,
} from './i18n';

export type ResolveServerLocaleOptions = {
  cookieStore?: ReturnType<typeof cookies>;
  acceptLanguage?: string | null;
};

export function resolveServerLocale(
  options: ResolveServerLocaleOptions = {},
): { locale: string; acceptLanguage: string | null } {
  const cookieStore = options.cookieStore ?? cookies();
  const acceptLanguage =
    options.acceptLanguage !== undefined
      ? options.acceptLanguage
      : headers().get('accept-language');

  const cookieLocale = cookieStore.get(LOCALE_COOKIE_KEY)?.value ?? null;

  return {
    locale: normalizeLocale(
      cookieLocale,
      parseAcceptLanguage(acceptLanguage),
    ),
    acceptLanguage,
  };
}
