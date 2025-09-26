import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayersPage from '../players/page';
import {
  apiFetch,
  isAdmin,
  type ApiError,
} from '../../lib/api';
import ToastProvider from '../../components/ToastProvider';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>(
    '../../lib/api'
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
    isAdmin: vi.fn(),
  };
});

const mockedApiFetch = vi.mocked(apiFetch);
const mockedIsAdmin = vi.mocked(isAdmin);

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

describe('PlayersPage error handling', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedIsAdmin.mockReset();
    mockedIsAdmin.mockReturnValue(false);
  });

  it('shows a friendly message when hidden players are forbidden', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockedApiFetch.mockRejectedValueOnce(
      makeApiError('players_include_hidden_forbidden', 'forbidden', 403)
    );

    render(
      <ToastProvider>
        <PlayersPage />
      </ToastProvider>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      /You do not have permission to view hidden players\./i
    );

    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveTextContent(
      /You do not have permission to view hidden players\./i
    );

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalled();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Unhandled players fetch error code')
    );

    consoleErrorSpy.mockRestore();
  });
});
