import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import AdminClubsPage from '../admin/clubs/page';
import { apiFetch, isAdmin } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  isAdmin: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedIsAdmin = vi.mocked(isAdmin);

const jsonResponse = (data: unknown): Response =>
  ({
    ok: true,
    json: async () => data,
  } as Response);

const emptyResponse = (): Response =>
  ({
    ok: true,
    json: async () => ({}),
  } as Response);

describe('AdminClubsPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedIsAdmin.mockReset();
    document.cookie = 'cst-login-redirect=; path=/; max-age=0';
    window.history.replaceState(null, '', '/admin/clubs');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects non-admins to login', async () => {
    let currentUrl = new URL('http://localhost/admin/clubs');
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
      pathname: {
        configurable: true,
        get: () => currentUrl.pathname,
      },
      search: {
        configurable: true,
        get: () => currentUrl.search,
      },
      hash: {
        configurable: true,
        get: () => currentUrl.hash,
      },
      origin: {
        configurable: true,
        get: () => currentUrl.origin,
      },
      protocol: {
        configurable: true,
        get: () => currentUrl.protocol,
      },
    });
    vi.stubGlobal('location', locationMock);

    mockedIsAdmin.mockReturnValue(false);

    render(<AdminClubsPage />);

    await waitFor(() => {
      expect(window.location.href).toBe('/login');
    });
    expect(document.cookie).toContain('cst-login-redirect=%2Fadmin%2Fclubs');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('renders clubs returned from the API', async () => {
    mockedIsAdmin.mockReturnValue(true);
    mockedApiFetch.mockResolvedValueOnce(
      jsonResponse([
        { id: 'club-a', name: 'Club A' },
        { id: 'club-b', name: 'Club B' },
      ])
    );

    render(<AdminClubsPage />);

    expect(await screen.findByText('Club A')).toBeInTheDocument();
    expect(screen.getByText('club-a')).toBeInTheDocument();
    expect(screen.getByText('Club B')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/v0/clubs',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('creates a new club', async () => {
    mockedIsAdmin.mockReturnValue(true);
    mockedApiFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'club-xyz', name: 'Club XYZ' },
        ])
      );

    render(<AdminClubsPage />);

    const form = screen.getByRole('form', { name: /create club/i });
    const idInput = within(form).getByLabelText('Club ID');
    const nameInput = within(form).getByLabelText('Club name');

    fireEvent.change(idInput, { target: { value: 'club-xyz' } });
    fireEvent.change(nameInput, { target: { value: 'Club XYZ' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    });

    const postCall = mockedApiFetch.mock.calls[1];
    expect(postCall[0]).toBe('/v0/clubs');
    expect(postCall[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(postCall[1]?.body as string)).toEqual({
      id: 'club-xyz',
      name: 'Club XYZ',
    });
    expect(await screen.findByText('Club created.')).toBeInTheDocument();
  });
});
