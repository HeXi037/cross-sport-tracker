import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_COOKIE_KEY } from '../../lib/i18n';

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

    const { locale } = resolveServerLocale();

    expect(locale).toBe('de-DE');
  });

  it('falls back to the Accept-Language header when no cookie is set', () => {
    mockHeadersGet.mockReturnValue('fr-CA');
    mockCookiesGet.mockReturnValue(undefined);

    const { locale } = resolveServerLocale();

    expect(locale).toBe('fr-CA');
  });
});
