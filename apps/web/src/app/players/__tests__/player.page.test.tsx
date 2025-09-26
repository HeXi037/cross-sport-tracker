import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

const refreshMock = vi.fn();
const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>(
    'next/navigation'
  );
  return {
    ...actual,
    useRouter: () => ({
      refresh: refreshMock,
    }),
    notFound: notFoundMock,
  };
});

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (key: string) => (key.toLowerCase() === 'accept-language' ? 'en-GB' : null),
  }),
}));

vi.mock('../[id]/PlayerCharts', () => ({
  default: () => <div data-testid="player-charts" />,
}));

vi.mock('../[id]/comments-client', () => ({
  default: () => <div data-testid="player-comments" />,
}));

vi.mock('../[id]/PhotoUpload', () => ({
  default: () => <div data-testid="photo-upload" />,
}));

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/api')>(
    '../../../lib/api'
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
    fetchClubs: vi.fn(),
  };
});

import PlayerPage from '../[id]/page';
import { apiFetch, fetchClubs } from '../../../lib/api';

const mockedApiFetch = vi.mocked(apiFetch);
const mockedFetchClubs = vi.mocked(fetchClubs);

const makeResponse = <T,>(
  data: T,
  init: { status?: number } = {}
): Response => {
  const status = init.status ?? 200;
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone() {
      return makeResponse(data, init);
    },
  } as unknown as Response;
};

const makeError = (status: number, message: string): Error & { status: number } => {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  refreshMock.mockReset();
  notFoundMock.mockClear();
});

describe('PlayerPage server component', () => {
  it('renders player details when the API succeeds', async () => {
    mockedFetchClubs.mockResolvedValue([
      { id: 'club-1', name: 'Ace Club' },
    ]);

    mockedApiFetch.mockImplementation(async (path) => {
      if (path === '/v0/players/player-1') {
        return makeResponse({
          id: 'player-1',
          name: 'Pat Jones',
          club_id: 'club-1',
          badges: [],
          social_links: [],
        });
      }
      if (path.startsWith('/v0/matches?playerId=player-1&upcoming=true')) {
        return makeResponse([]);
      }
      if (path.startsWith('/v0/matches?playerId=player-1')) {
        return makeResponse([
          {
            id: 'match-1',
            sport: 'tennis',
            bestOf: 3,
            playedAt: '2024-01-02T00:00:00Z',
            location: 'Court A',
          },
        ]);
      }
      if (path === '/v0/matches/match-1') {
        return makeResponse({
          participants: [
            { side: 'A', playerIds: ['player-1'] },
            { side: 'B', playerIds: ['opponent-1'] },
          ],
          summary: { sets: { A: 2, B: 1 } },
        });
      }
      if (path.startsWith('/v0/players/by-ids')) {
        return makeResponse([
          { id: 'player-1', name: 'Pat Jones' },
          { id: 'opponent-1', name: 'Taylor Opponent' },
        ]);
      }
      if (path === '/v0/players/player-1/stats') {
        return makeResponse(null, { status: 204 });
      }
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const view = await PlayerPage({
      params: { id: 'player-1' },
      searchParams: {},
    });

    render(view);

    expect(
      screen.getByRole('heading', { name: /pat jones/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Back to players/i)).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalled();
  });

  it('invokes Next.js notFound when the player is missing', async () => {
    mockedApiFetch.mockImplementation(async (path) => {
      if (path === '/v0/players/missing') {
        throw makeError(404, 'HTTP 404: Player not found');
      }
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    await expect(
      PlayerPage({
        params: { id: 'missing' },
        searchParams: {},
      })
    ).rejects.toThrow('not-found');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces server errors with retry affordance', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockedApiFetch.mockRejectedValue(makeError(503, 'HTTP 503: Service Unavailable'));

    const view = await PlayerPage({
      params: { id: 'player-2' },
      searchParams: {},
    });

    render(view);

    expect(
      screen.getByText(/temporary problem fetching this player/i)
    ).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /try again/i });
    await userEvent.click(button);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
