import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  LOCALE_COOKIE_KEY,
  TIME_ZONE_COOKIE_KEY,
} from '../../lib/i18n';

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
      name === LOCALE_COOKIE_KEY
        ? { value: 'de-DE' }
        : name === TIME_ZONE_COOKIE_KEY
          ? { value: 'Australia/Melbourne' }
          : undefined,
    );

    const { locale, preferredTimeZone, timeZone } = resolveServerLocale();

    expect(locale).toBe('de-DE');
    expect(preferredTimeZone).toBe('Australia/Melbourne');
    expect(timeZone).toBe('Australia/Melbourne');
  });

  it('falls back to the Accept-Language header when no cookie is set', () => {
    mockHeadersGet.mockReturnValue('fr-CA');
    mockCookiesGet.mockReturnValue(undefined);

    const { locale, acceptLanguage, preferredTimeZone, timeZone } =
      resolveServerLocale();

    expect(locale).toBe('fr-CA');
    expect(acceptLanguage).toBe('fr-CA');
    expect(preferredTimeZone).toBeNull();
    expect(timeZone).toBe(DEFAULT_TIME_ZONE);
  });

  it('trims the Accept-Language header and treats empty values as null', () => {
    mockHeadersGet.mockReturnValue('  en-AU  ');
    mockCookiesGet.mockImplementation((name: string) =>
      name === TIME_ZONE_COOKIE_KEY
        ? { value: 'Australia/Melbourne' }
        : undefined,
    );

    const { locale, acceptLanguage, timeZone } = resolveServerLocale();

    expect(locale).toBe('en-AU');
    expect(acceptLanguage).toBe('en-AU');
    expect(timeZone).toBe('Australia/Melbourne');

    mockHeadersGet.mockReturnValue('   ');

    const resultWithoutHeader = resolveServerLocale();

    expect(resultWithoutHeader.locale).toBe('en-GB');
    expect(resultWithoutHeader.acceptLanguage).toBeNull();
    expect(resultWithoutHeader.timeZone).toBe('Australia/Melbourne');
  });
});
