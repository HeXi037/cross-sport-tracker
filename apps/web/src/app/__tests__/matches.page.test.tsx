import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MatchesPage from '../matches/page';
import { apiFetch, type ApiError } from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>(
    '../../lib/api'
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock('next/headers', () => ({
  headers: () => ({
    get: () => 'en-GB',
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
