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

describe('PlayersPage sorting', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedIsAdmin.mockReset();
    mockedIsAdmin.mockReturnValue(false);
  });

  it('sorts players alphabetically ignoring case', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      json: async () => ({
        players: [
          { id: '2', name: 'benni', hidden: false, photo_url: null },
          { id: '4', name: 'bridget', hidden: false, photo_url: null },
          { id: '1', name: 'Addi', hidden: false, photo_url: null },
          { id: '3', name: 'Amy', hidden: false, photo_url: null },
        ],
      }),
    } as unknown as Response);

    const { container } = render(
      <ToastProvider>
        <PlayersPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(container.querySelectorAll('ul.player-list li')).toHaveLength(4);
    });

    const names = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        '.player-list__item .player-list__card-link',
      ),
    ).map(
      (link) =>
        link.querySelector<HTMLSpanElement>('.player-list__name')?.textContent?.trim(),
    );

    expect(names).toEqual(['Addi', 'Amy', 'benni', 'bridget']);
  });
});
