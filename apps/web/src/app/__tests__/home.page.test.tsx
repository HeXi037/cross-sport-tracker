import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import HomePageClient from '../home-page-client';
import * as apiModule from '../../lib/api';
import * as matchesModule from '../../lib/matches';
import { SWRConfig } from 'swr';
import { useLocale, useTimeZone } from '../../lib/LocaleContext';

vi.mock('../../lib/LocaleContext', () => ({
  useLocale: vi.fn(() => 'en-GB'),
  useTimeZone: vi.fn(() => 'UTC'),
}));

const defaultProps = {
  sports: [],
  matches: [],
  sportError: false,
  matchError: false,
  initialLocale: 'en-GB',
  initialHasMore: false,
  initialNextOffset: null,
  initialPageSize: 5,
};

const scrollToMock = vi.fn();

const useLocaleMock = vi.mocked(useLocale);
const useTimeZoneMock = vi.mocked(useTimeZone);

beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: scrollToMock,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  scrollToMock.mockClear();
  useLocaleMock.mockReturnValue('en-GB');
  useTimeZoneMock.mockReturnValue('UTC');
});

describe('HomePageClient error messages', () => {
  function renderComponent(props = defaultProps) {
    return render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <HomePageClient {...props} />
      </SWRConfig>,
    );
  }

  it('shows sports error message', () => {
    vi.spyOn(apiModule, 'apiFetch').mockRejectedValue(new Error('network'));
    renderComponent({ ...defaultProps, sportError: true });
    expect(
      screen.getByText(/Unable to load sports\. Check connection\./i)
    ).toBeInTheDocument();
  });

  it('shows matches error message', () => {
    vi.spyOn(apiModule, 'apiFetch').mockRejectedValue(new Error('network'));
    renderComponent({ ...defaultProps, matchError: true });
    expect(
      screen.getByText(/Unable to load matches\. Check connection\./i)
    ).toBeInTheDocument();
  });

  it('renders playedAt metadata using day-first ordering when locale is Australian English', () => {
    useLocaleMock.mockReturnValue('en-AU');
    useTimeZoneMock.mockReturnValue('Australia/Melbourne');

    renderComponent({
      ...defaultProps,
      matches: [
        {
          id: 'm1',
          sport: 'padel',
          bestOf: 3,
          playedAt: '2024-02-03T00:00:00Z',
          location: null,
          isFriendly: false,
          players: {
            A: [
              { id: 'a1', name: 'A1' },
              { id: 'a2', name: 'A2' },
            ],
            B: [
              { id: 'b1', name: 'B1' },
              { id: 'b2', name: 'B2' },
            ],
          },
        },
      ],
    });

    expect(screen.getByText(/3\/2\/24/)).toBeInTheDocument();
  });

  it('renders player names and match details link', () => {
    renderComponent({
      ...defaultProps,
      matches: [
        {
          id: 'm1',
          sport: 'padel',
          bestOf: 3,
          playedAt: null,
          location: null,
          isFriendly: false,
          players: {
            A: [
              { id: 'a1', name: 'A1' },
              { id: 'a2', name: 'A2' },
            ],
            B: [
              { id: 'b1', name: 'B1' },
              { id: 'b2', name: 'B2' },
            ],
          },
        },
      ],
    });
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('A2')).toBeInTheDocument();
    expect(screen.getByText('B1')).toBeInTheDocument();
    expect(screen.getByText('B2')).toBeInTheDocument();
    const link = screen.getByText('Match details');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/matches/m1');
  });

  it('loads more matches when requested', async () => {
    const apiFetchMock = vi
      .spyOn(apiModule, 'apiFetch')
      .mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'm2',
            sport: 'padel',
            bestOf: 3,
            playedAt: null,
            location: null,
            isFriendly: false,
            participants: [],
            summary: null,
          },
        ],
        headers: new Headers({ 'X-Limit': '5', 'X-Has-More': 'false' }),
      } as unknown as Response);

    vi.spyOn(matchesModule, 'enrichMatches').mockImplementation(async (rows) =>
      rows.map((row) => ({
        ...row,
        players: {
          A: [{ id: `${row.id}-a`, name: `${row.id} Player A` }],
          B: [{ id: `${row.id}-b`, name: `${row.id} Player B` }],
        },
      }))
    );

    renderComponent({
      ...defaultProps,
      matches: [
        {
          id: 'm1',
          sport: 'padel',
          bestOf: 3,
          playedAt: null,
          location: null,
          isFriendly: false,
          players: {
            A: [{ id: 'a1', name: 'A1' }],
            B: [{ id: 'b1', name: 'B1' }],
          },
        },
      ],
      initialHasMore: true,
      initialNextOffset: 5,
    });

    const button = screen.getByRole('button', { name: /load more matches/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(/m2 Player A/i)
      ).toBeInTheDocument();
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v0/matches?limit=5&offset=5',
      { cache: 'no-store' }
    );
    expect(screen.getByText(/View all matches/i)).toBeInTheDocument();
  });

  it('shows an error if loading more matches fails', async () => {
    vi.spyOn(apiModule, 'apiFetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);

    renderComponent({
      ...defaultProps,
      matches: [
        {
          id: 'm1',
          sport: 'padel',
          bestOf: 3,
          playedAt: null,
          location: null,
          isFriendly: false,
          players: {
            A: [{ id: 'a1', name: 'A1' }],
            B: [{ id: 'b1', name: 'B1' }],
          },
        },
      ],
      initialHasMore: true,
      initialNextOffset: 5,
    });

    const button = screen.getByRole('button', { name: /load more matches/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to load more matches/i)
      ).toBeInTheDocument();
    });
  });
});
