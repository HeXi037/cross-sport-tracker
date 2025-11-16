import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import AdminMatchHistoryPage from './page';

const apiFetchMock = vi.fn();
const isAdminMock = vi.fn();
const rememberLoginRedirectMock = vi.fn();

vi.mock('../../../lib/api', () => ({
  apiFetch: (...args: Parameters<typeof apiFetchMock>) => apiFetchMock(...args),
  isAdmin: () => isAdminMock(),
}));

vi.mock('../../../lib/loginRedirect', () => ({
  rememberLoginRedirect: () => rememberLoginRedirectMock(),
}));

vi.mock('../../../lib/LocaleContext', () => ({
  useLocale: () => 'en-AU',
  useTimeZone: () => 'Australia/Melbourne',
}));

const jsonResponse = (data: unknown): Response =>
  ({
    ok: true,
    json: async () => data,
  } as Response);

describe('AdminMatchHistoryPage', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    isAdminMock.mockReset();
    rememberLoginRedirectMock.mockReset();
    window.history.replaceState(null, '', '/admin/match-history');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects non-admins to login', async () => {
    let currentUrl = new URL('http://localhost/admin/match-history');
    const locationMock = {
      assign: vi.fn((value: string) => {
        currentUrl = new URL(value, currentUrl.origin);
      }),
      replace: vi.fn(),
      reload: vi.fn(),
    } as Partial<Location>;
    Object.defineProperties(locationMock, {
      href: {
        configurable: true,
        get: () => `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` || '/',
        set: (value: string) => {
          currentUrl = new URL(value, currentUrl.origin);
        },
      },
      pathname: { configurable: true, get: () => currentUrl.pathname },
      search: { configurable: true, get: () => currentUrl.search },
      hash: { configurable: true, get: () => currentUrl.hash },
      origin: { configurable: true, get: () => currentUrl.origin },
      protocol: { configurable: true, get: () => currentUrl.protocol },
    });
    vi.stubGlobal('location', locationMock);

    isAdminMock.mockReturnValue(false);

    render(<AdminMatchHistoryPage />);

    await waitFor(() => {
      expect(window.location.href).toBe('/login/');
    });
    expect(rememberLoginRedirectMock).toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('renders audit entries returned by the API', async () => {
    isAdminMock.mockReturnValue(true);
    apiFetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'log-1',
            action: 'created',
            actor: { id: 'admin', username: 'Admin', is_admin: true },
            createdAt: '2024-01-01T00:00:00Z',
            matchId: 'm1',
            matchSport: 'padel',
            matchPlayedAt: '2024-01-01T00:00:00Z',
            matchIsFriendly: true,
          },
        ],
        limit: 25,
        offset: 0,
        hasMore: false,
        nextOffset: null,
      })
    );

    render(<AdminMatchHistoryPage />);

    expect(
      await screen.findByRole('heading', { name: /admin match history/i })
    ).toBeInTheDocument();
    expect(await screen.findByText(/created/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view match/i })).toHaveAttribute(
      'href',
      '/matches/m1'
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v0/matches/audit?limit=25&offset=0',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('loads more entries when requested', async () => {
    isAdminMock.mockReturnValue(true);
    apiFetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'log-1',
              action: 'created',
              actor: null,
              createdAt: '2024-01-01T00:00:00Z',
              matchId: 'm1',
            },
          ],
          limit: 25,
          offset: 0,
          hasMore: true,
          nextOffset: 1,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'log-2',
              action: 'deleted',
              actor: null,
              createdAt: '2024-01-02T00:00:00Z',
              matchId: 'm2',
            },
          ],
          limit: 25,
          offset: 1,
          hasMore: false,
          nextOffset: null,
        })
      );

    render(<AdminMatchHistoryPage />);

    const button = await screen.findByRole('button', { name: /load more history/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText(/deleted/i)).toBeInTheDocument();
  });
});
