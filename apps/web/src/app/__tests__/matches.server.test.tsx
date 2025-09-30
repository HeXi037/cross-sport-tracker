import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_COOKIE_KEY, TIME_ZONE_COOKIE_KEY } from '../../lib/i18n';

const { mockHeadersGet, mockCookiesGet } = vi.hoisted(() => {
  return {
    mockHeadersGet: vi.fn<(name: string) => string | null>(),
    mockCookiesGet: vi.fn<
      (name: string) => { value: string } | undefined
    >(),
  };
});

vi.mock('next/headers', () => ({
  headers: () => ({
    get: mockHeadersGet,
  }),
  cookies: () => ({
    get: mockCookiesGet,
  }),
}));

import { resolveServerLocale } from '../../lib/server-locale';

describe('resolveServerLocale', () => {
  beforeEach(() => {
    mockHeadersGet.mockReset();
    mockCookiesGet.mockReset();
  });

  it('prefers the locale cookie over the Accept-Language header', () => {
    mockHeadersGet.mockReturnValue('en-US,fr;q=0.8');
    mockCookiesGet.mockImplementation((name: string) =>
      name === LOCALE_COOKIE_KEY ? { value: 'de-DE' } : undefined,
    );

    const { locale, preferredTimeZone } = resolveServerLocale();

    expect(locale).toBe('de-DE');
    expect(preferredTimeZone).toBeNull();
  });

  it('falls back to the Accept-Language header when no cookie is set', () => {
    mockHeadersGet.mockReturnValue('fr-CA');
    mockCookiesGet.mockReturnValue(undefined);

    const { locale, acceptLanguage, preferredTimeZone } = resolveServerLocale();

    expect(locale).toBe('fr-CA');
    expect(acceptLanguage).toBe('fr-CA');
    expect(preferredTimeZone).toBeNull();
  });

  it('trims the Accept-Language header and treats empty values as null', () => {
    mockHeadersGet.mockReturnValue('  en-AU  ');
    mockCookiesGet.mockReturnValue(undefined);

    const { locale, acceptLanguage, preferredTimeZone } = resolveServerLocale();

    expect(locale).toBe('en-AU');
    expect(acceptLanguage).toBe('en-AU');
    expect(preferredTimeZone).toBeNull();

    mockHeadersGet.mockReturnValue('   ');

    const resultWithoutHeader = resolveServerLocale();

    expect(resultWithoutHeader.locale).toBe('en-GB');
    expect(resultWithoutHeader.acceptLanguage).toBeNull();
    expect(resultWithoutHeader.preferredTimeZone).toBeNull();
  });

  it('includes the preferred time zone from cookies when available', () => {
    mockHeadersGet.mockReturnValue(null);
    mockCookiesGet.mockImplementation((name: string) => {
      if (name === LOCALE_COOKIE_KEY) {
        return { value: 'en-GB' };
      }
      if (name === TIME_ZONE_COOKIE_KEY) {
        return { value: 'Australia/Melbourne' };
      }
      return undefined;
    });

    const { preferredTimeZone } = resolveServerLocale();

    expect(preferredTimeZone).toBe('Australia/Melbourne');
  });
});
