import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminBadgesPage from '../admin/badges/page';
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

describe('AdminBadgesPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedIsAdmin.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects non-admins to login', async () => {
    let href = 'http://localhost/';
    const locationMock = {
      assign: vi.fn((value: string) => {
        href = value;
      }),
      replace: vi.fn(),
      reload: vi.fn(),
    } as Partial<Location>;
    Object.defineProperty(locationMock, 'href', {
      configurable: true,
      get: () => href,
      set: (value: string) => {
        href = value;
      },
    });
    vi.stubGlobal('location', locationMock);

    mockedIsAdmin.mockReturnValue(false);

    render(<AdminBadgesPage />);

    await waitFor(() => {
      expect(window.location.href).toBe('/login');
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('renders badges returned from the API', async () => {
    mockedIsAdmin.mockReturnValue(true);
    mockedApiFetch.mockResolvedValueOnce(
      jsonResponse([
        { id: 'b1', name: 'Alpha', icon: null },
        { id: 'b2', name: 'Beta', icon: '🔥' },
      ])
    );

    render(<AdminBadgesPage />);

    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('🔥')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/v0/badges',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('creates a new badge', async () => {
    mockedIsAdmin.mockReturnValue(true);
    mockedApiFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'b2', name: 'Legend', icon: '🏆' }])
      );

    render(<AdminBadgesPage />);

    const form = screen.getByRole('form', { name: /create badge/i });
    const nameInput = within(form).getByLabelText('Name');
    const iconInput = within(form).getByLabelText('Icon');

    fireEvent.change(nameInput, { target: { value: 'Legend' } });
    fireEvent.change(iconInput, { target: { value: '🏆' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    });
    const postCall = mockedApiFetch.mock.calls[1];
    expect(postCall[0]).toBe('/v0/badges');
    expect(postCall[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(postCall[1]?.body as string)).toEqual({
      name: 'Legend',
      icon: '🏆',
    });
    expect(await screen.findByText('Badge created.')).toBeInTheDocument();
  });

  it('updates an existing badge', async () => {
    mockedIsAdmin.mockReturnValue(true);
    mockedApiFetch
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'b1', name: 'Starter', icon: null }])
      )
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'b1', name: 'Starter Updated', icon: '🔥' }])
      );

    render(<AdminBadgesPage />);

    const nameInput = await screen.findByDisplayValue('Starter');
    const row = nameInput.closest('li');
    if (!row) throw new Error('Expected badge row');
    const iconInput = within(row).getByLabelText('Icon');
    const saveButton = within(row).getByRole('button', { name: 'Save' });

    fireEvent.change(nameInput, { target: { value: 'Starter Updated' } });
    fireEvent.change(iconInput, { target: { value: '🔥' } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    });
    const patchCall = mockedApiFetch.mock.calls[1];
    expect(patchCall[0]).toBe('/v0/badges/b1');
    expect(patchCall[1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(patchCall[1]?.body as string)).toEqual({
      name: 'Starter Updated',
      icon: '🔥',
    });
    expect(await screen.findByText('Badge updated.')).toBeInTheDocument();
  });

  it('deletes a badge', async () => {
    mockedIsAdmin.mockReturnValue(true);
    mockedApiFetch
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'b1', name: 'Starter', icon: null }])
      )
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(jsonResponse([]));

    render(<AdminBadgesPage />);

    const nameInput = await screen.findByDisplayValue('Starter');
    const row = nameInput.closest('li');
    if (!row) throw new Error('Expected badge row');
    const deleteButton = within(row).getByRole('button', { name: 'Delete' });

    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    });
    const deleteCall = mockedApiFetch.mock.calls[1];
    expect(deleteCall[0]).toBe('/v0/badges/b1');
    expect(deleteCall[1]).toMatchObject({ method: 'DELETE' });
    expect(await screen.findByText('Badge deleted.')).toBeInTheDocument();
  });
});
