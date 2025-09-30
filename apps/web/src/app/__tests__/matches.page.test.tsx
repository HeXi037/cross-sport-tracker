import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MatchesPage from '../matches/page';
import { apiFetch, type ApiError } from '../../lib/api';
import enMessages from '../../messages/en-GB.json';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>(
    '../../lib/api'
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock('../../lib/server-locale', () => ({
  resolveServerLocale: () => ({
    locale: 'en-GB',
    acceptLanguage: 'en-GB',
    preferredTimeZone: null,
  }),
}));

const cookiesMock = vi.hoisted(() => vi.fn(() => ({ get: vi.fn(() => undefined) })));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: cookiesMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespaceOrOptions?: unknown) => {
    const namespace =
      typeof namespaceOrOptions === 'string'
        ? namespaceOrOptions
        : typeof namespaceOrOptions === 'object' && namespaceOrOptions && 'namespace' in namespaceOrOptions
          ? (namespaceOrOptions as { namespace?: string }).namespace ?? ''
          : '';
    return (key: string, values?: Record<string, unknown>) => {
      const fullKey = [namespace, key].filter(Boolean).join('.');
      const template = fullKey
        .split('.')
        .reduce<unknown>((acc, segment) => (acc as Record<string, unknown>)?.[segment], enMessages);
      if (typeof template !== 'string') {
        throw new Error(`Missing translation for ${fullKey}`);
      }
      return template.replace(/\{(\w+)\}/g, (_, token) => {
        if (values && token in values) {
          return String(values[token]);
        }
        return `{${token}}`;
      });
    };
  }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

const makeApiError = (
  code: string,
  parsedMessage: string,
  status?: number
): ApiError => {
  const err = new Error(parsedMessage) as ApiError;
  err.code = code;
  err.parsedMessage = parsedMessage;
  if (status !== undefined) {
    err.status = status;
  }
  return err;
};

describe('MatchesPage error handling', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows a friendly message for forbidden errors', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockedApiFetch.mockRejectedValueOnce(
      makeApiError('match_forbidden', 'forbidden', 403)
    );

    const ui = await MatchesPage({});
    render(ui);

    expect(
      screen.getByText(/You do not have permission to view these matches\./i)
    ).toBeInTheDocument();

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Unhandled matches error code')
    );

    consoleErrorSpy.mockRestore();
  });
});
