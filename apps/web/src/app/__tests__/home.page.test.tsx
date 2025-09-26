import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import HomePageClient from '../home-page-client';
import * as apiModule from '../../lib/api';
import * as matchesModule from '../../lib/matches';

const defaultProps = {
  sports: [],
  matches: [],
  sportError: false,
  matchError: false,
  initialLocale: 'en-US',
  initialHasMore: false,
  initialNextOffset: null,
  initialPageSize: 5,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomePageClient error messages', () => {
  it('shows sports error message', () => {
    render(<HomePageClient {...defaultProps} sportError={true} />);
    expect(
      screen.getByText(/Unable to load sports\. Check connection\./i)
    ).toBeInTheDocument();
  });

  it('shows matches error message', () => {
    render(<HomePageClient {...defaultProps} matchError={true} />);
    expect(
      screen.getByText(/Unable to load matches\. Check connection\./i)
    ).toBeInTheDocument();
  });

  it('renders player names and match details link', () => {
    render(
      <HomePageClient
        {...defaultProps}
        matches={[
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
        ]}
      />
    );
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
        json: async () => ({
          items: [
            {
              id: 'm2',
              sport: 'padel',
              bestOf: 3,
              playedAt: null,
              location: null,
              isFriendly: false,
            },
          ],
          limit: 5,
          offset: 5,
          hasMore: false,
          nextOffset: null,
        }),
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

    render(
      <HomePageClient
        {...defaultProps}
        matches={[
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
        ]}
        initialHasMore={true}
        initialNextOffset={5}
      />
    );

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

    render(
      <HomePageClient
        {...defaultProps}
        matches={[
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
        ]}
        initialHasMore={true}
        initialNextOffset={5}
      />
    );

    const button = screen.getByRole('button', { name: /load more matches/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to load more matches/i)
      ).toBeInTheDocument();
    });
  });
});
