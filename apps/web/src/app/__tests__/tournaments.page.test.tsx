import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TournamentsClient from '../tournaments/tournaments-client';
import TournamentDetailPage from '../tournaments/[id]/page';
import {
  apiFetch,
  createStage,
  createTournament,
  scheduleAmericanoStage,
  fetchStageStandings,
  listStageMatches,
  isAdmin,
  isLoggedIn,
  currentUserId,
  deleteTournament,
  type StageScheduleMatch,
  type StageStandings,
} from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>(
    '../../lib/api'
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
    createStage: vi.fn(),
    createTournament: vi.fn(),
    scheduleAmericanoStage: vi.fn(),
    fetchStageStandings: vi.fn(),
    listStageMatches: vi.fn(),
    isAdmin: vi.fn(),
    isLoggedIn: vi.fn(),
    currentUserId: vi.fn(),
    deleteTournament: vi.fn(),
  };
});

const mockedApiFetch = vi.mocked(apiFetch);
const mockedCreateTournament = vi.mocked(createTournament);
const mockedCreateStage = vi.mocked(createStage);
const mockedScheduleAmericanoStage = vi.mocked(scheduleAmericanoStage);
const mockedFetchStageStandings = vi.mocked(fetchStageStandings);
const mockedListStageMatches = vi.mocked(listStageMatches);
const mockedIsAdmin = vi.mocked(isAdmin);
const mockedIsLoggedIn = vi.mocked(isLoggedIn);
const mockedCurrentUserId = vi.mocked(currentUserId);
const mockedDeleteTournament = vi.mocked(deleteTournament);

const jsonResponse = (data: unknown): Response =>
  ({
    ok: true,
    json: async () => data,
  } as Response);

const selectPlayers = async (listbox: HTMLElement, names: string[]) => {
  await waitFor(() => {
    expect(within(listbox).queryByText('No players are available yet.')).toBeNull();
  });
  for (const name of names) {
    await waitFor(() => {
      const node = within(listbox).queryByText(new RegExp(`^${name}$`, 'i'));
      expect(node).not.toBeNull();
      return true;
    });
    const option = within(listbox).getByText(new RegExp(`^${name}$`, 'i'));
    fireEvent.click(option);
  }
};

describe('Tournaments client view', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedCreateTournament.mockReset();
    mockedCreateStage.mockReset();
    mockedScheduleAmericanoStage.mockReset();
    mockedIsAdmin.mockReset();
    mockedIsAdmin.mockReturnValue(true);
    mockedIsLoggedIn.mockReset();
    mockedIsLoggedIn.mockReturnValue(true);
    mockedCurrentUserId.mockReset();
    mockedCurrentUserId.mockReturnValue('admin');
    mockedDeleteTournament.mockReset();
    mockedApiFetch.mockResolvedValue(jsonResponse([]));
  });

  it('renders tournaments and appends newly created entries', async () => {
    const playerList = [
      { id: 'p1', name: 'Alex' },
      { id: 'p2', name: 'Billie' },
      { id: 'p3', name: 'Casey' },
      { id: 'p4', name: 'Devon' },
    ];
    const apiResponses: Response[] = [
      jsonResponse([
        { id: 'padel', name: 'Padel' },
      ]),
      jsonResponse({ players: playerList }),
      jsonResponse([
        { id: 'padel', name: 'Padel' },
      ]),
      jsonResponse({ players: playerList }),
      jsonResponse([
        { id: 'padel-default', name: 'Padel Default' },
      ]),
    ];
    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      if (apiResponses.length > 0) {
        return apiResponses.shift()!;
      }
      const url = typeof path === 'string' ? path : path.toString();
      if (url.includes('/players')) {
        return jsonResponse({ players: playerList });
      }
      if (url.includes('/rulesets')) {
        return jsonResponse([{ id: 'padel-default', name: 'Padel Default' }]);
      }
      if (url.includes('/sports')) {
        return jsonResponse([{ id: 'padel', name: 'Padel' }]);
      }
      return jsonResponse([]);
    });

    const initial = [
      {
        id: 't-existing',
        sport: 'padel',
        name: 'Existing Cup',
        createdByUserId: 'admin',
      },
    ];

    mockedCreateTournament.mockResolvedValue({
      id: 't-new',
      sport: 'padel',
      name: 'Winter Americano',
      createdByUserId: 'admin',
    });
    mockedCreateStage.mockResolvedValue({
      id: 's1',
      tournamentId: 't-new',
      type: 'americano',
      config: { format: 'americano' },
    });
    const scheduledMatches: StageScheduleMatch[] = [
      {
        id: 'm1',
        sport: 'padel',
        stageId: 's1',
        bestOf: null,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: 'padel-default',
        participants: [
          { id: 'pa', side: 'A', playerIds: ['p1', 'p2'] },
          { id: 'pb', side: 'B', playerIds: ['p3', 'p4'] },
        ],
      },
    ];
    mockedScheduleAmericanoStage.mockResolvedValue({
      stageId: 's1',
      matches: scheduledMatches,
    });

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    const nameInput = await screen.findByLabelText('Tournament name');
    fireEvent.change(nameInput, { target: { value: 'Winter Americano' } });

    await waitFor(() => {
      expect(mockedApiFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    // Ensure initial data fetches completed before interacting with the form.

    const listbox = await screen.findByRole('listbox', { name: /available players/i });
    await waitFor(() =>
      expect(
        mockedApiFetch
          .mock.calls
          .some(([url]) => (typeof url === 'string' ? url : url.toString()).includes('/v0/players'))
      ).toBe(true)
    );
    await screen.findByText('Alex');
    await selectPlayers(listbox, ['Alex', 'Billie', 'Casey', 'Devon']);

    const submitButton = screen.getByRole('button', { name: /create and schedule/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedCreateTournament).toHaveBeenCalledWith({
        sport: 'padel',
        name: 'Winter Americano',
      });
    });
    expect(mockedCreateStage).toHaveBeenCalledWith('t-new', {
      type: 'americano',
      config: { format: 'americano' },
    });
    expect(mockedScheduleAmericanoStage).toHaveBeenCalledWith('t-new', 's1', {
      playerIds: ['p1', 'p2', 'p3', 'p4'],
      rulesetId: 'padel-default',
      courtCount: 1,
    });

    expect(
      await screen.findByText(/Created Winter Americano with 1 scheduled match./i)
    ).toBeInTheDocument();

    expect(screen.getByText('Existing Cup')).toBeInTheDocument();
    expect(screen.getByText('Winter Americano')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Billie')).toBeInTheDocument();
  });

  it('requires at least four players before scheduling', async () => {
    const playerList = [
      { id: 'p1', name: 'Alex' },
      { id: 'p2', name: 'Billie' },
      { id: 'p3', name: 'Casey' },
      { id: 'p4', name: 'Devon' },
      { id: 'p5', name: 'Emery' },
      { id: 'p6', name: 'Frankie' },
    ];

    const apiResponses: Response[] = [
      jsonResponse([
        { id: 'padel', name: 'Padel' },
      ]),
      jsonResponse({ players: playerList }),
      jsonResponse([
        { id: 'padel', name: 'Padel' },
      ]),
      jsonResponse({ players: playerList }),
      jsonResponse([
        { id: 'padel-default', name: 'Padel Default' },
      ]),
    ];

    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      if (apiResponses.length > 0) {
        return apiResponses.shift()!;
      }
      const url = typeof path === 'string' ? path : path.toString();
      if (url.includes('/players')) {
        return jsonResponse({ players: playerList });
      }
      if (url.includes('/rulesets')) {
        return jsonResponse([{ id: 'padel-default', name: 'Padel Default' }]);
      }
      if (url.includes('/sports')) {
        return jsonResponse([{ id: 'padel', name: 'Padel' }]);
      }
      return jsonResponse([]);
    });

    render(<TournamentsClient initialTournaments={[]} loadError={false} />);

    const nameInput = await screen.findByLabelText('Tournament name');
    fireEvent.change(nameInput, { target: { value: 'Invalid Americano' } });

    await waitFor(() => {
      expect(mockedApiFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    const listbox = await screen.findByRole('listbox', { name: /available players/i });
    await selectPlayers(listbox, ['Alex', 'Billie', 'Casey']);

    const submitButton = screen.getByRole('button', { name: /create and schedule/i });
    fireEvent.click(submitButton);

    expect(
      await screen.findByText(/Americano tournaments require at least four/i)
    ).toBeInTheDocument();

    expect(mockedCreateTournament).not.toHaveBeenCalled();
    expect(mockedCreateStage).not.toHaveBeenCalled();
    expect(mockedScheduleAmericanoStage).not.toHaveBeenCalled();
  });

  it('lets admins choose how many courts to schedule', async () => {
    const playerList = [
      { id: 'p1', name: 'Alex' },
      { id: 'p2', name: 'Billie' },
      { id: 'p3', name: 'Casey' },
      { id: 'p4', name: 'Devon' },
    ];

    const apiResponses: Response[] = [
      jsonResponse([
        { id: 'padel', name: 'Padel' },
      ]),
      jsonResponse({ players: playerList }),
      jsonResponse([
        { id: 'padel-default', name: 'Padel Default' },
      ]),
    ];

    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      if (apiResponses.length > 0) {
        return apiResponses.shift()!;
      }
      const url = typeof path === 'string' ? path : path.toString();
      if (url.includes('/players')) {
        return jsonResponse({ players: playerList });
      }
      if (url.includes('/rulesets')) {
        return jsonResponse([{ id: 'padel-default', name: 'Padel Default' }]);
      }
      if (url.includes('/sports')) {
        return jsonResponse([{ id: 'padel', name: 'Padel' }]);
      }
      return jsonResponse([]);
    });

    mockedCreateTournament.mockResolvedValue({
      id: 't1',
      sport: 'padel',
      name: 'Odd Courts',
      createdByUserId: 'admin',
    });
    mockedCreateStage.mockResolvedValue({
      id: 'stage-1',
      tournamentId: 't1',
      type: 'americano',
      config: { format: 'americano' },
    });
    mockedScheduleAmericanoStage.mockResolvedValue({
      stageId: 'stage-1',
      matches: [],
    });

    render(<TournamentsClient initialTournaments={[]} loadError={false} />);

    const courtSelect = await screen.findByLabelText('Courts in play');
    fireEvent.change(courtSelect, { target: { value: '3' } });

    const listbox = await screen.findByRole('listbox', { name: /available players/i });
    await selectPlayers(listbox, ['Alex', 'Billie', 'Casey', 'Devon']);

    const nameInput = screen.getByLabelText('Tournament name');
    fireEvent.change(nameInput, { target: { value: 'Odd Courts' } });

    const submitButton = screen.getByRole('button', { name: /create and schedule/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedScheduleAmericanoStage).toHaveBeenCalledWith('t1', 'stage-1', {
        playerIds: ['p1', 'p2', 'p3', 'p4'],
        rulesetId: 'padel-default',
        courtCount: 3,
      });
    });
  });

  it('prompts visitors to sign in before creating tournaments', () => {
    mockedIsAdmin.mockReturnValue(false);
    mockedIsLoggedIn.mockReturnValue(false);
    mockedCurrentUserId.mockReturnValue(null);

    render(<TournamentsClient initialTournaments={[]} loadError={false} />);

    expect(
      screen.getByText(/Sign in to create an Americano tournament/i)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Tournament name')).not.toBeInTheDocument();
  });

  it('lets tournament creators delete their americano tournaments', async () => {
    mockedIsAdmin.mockReturnValue(false);
    mockedIsLoggedIn.mockReturnValue(true);
    mockedCurrentUserId.mockReturnValue('user-1');
    mockedDeleteTournament.mockResolvedValue();

    const initial = [
      {
        id: 't1',
        sport: 'padel',
        name: 'My Americano',
        createdByUserId: 'user-1',
      },
    ];

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalled();
    });

    const deleteButton = await screen.findByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockedDeleteTournament).toHaveBeenCalledWith('t1');
      expect(screen.queryByText('My Americano')).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('hides delete actions for tournaments created by other users', () => {
    mockedIsAdmin.mockReturnValue(false);
    mockedIsLoggedIn.mockReturnValue(true);
    mockedCurrentUserId.mockReturnValue('user-2');

    const initial = [
      {
        id: 't2',
        sport: 'padel',
        name: 'Club Night',
        createdByUserId: 'user-1',
      },
    ];

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    return waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

  });
});

  it('supports keyboard selection, filtering, and deselection in the player multi-select', async () => {
    const apiResponses: Response[] = [
      jsonResponse([
        { id: 'padel', name: 'Padel' },
      ]),
      jsonResponse({
        players: [
          { id: 'p1', name: 'Alex' },
          { id: 'p2', name: 'Billie' },
          { id: 'p3', name: 'Casey' },
          { id: 'p4', name: 'Devon' },
          { id: 'p5', name: 'Elliott' },
        ],
      }),
      jsonResponse([
        { id: 'padel-default', name: 'Padel Default' },
      ]),
    ];

    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      if (apiResponses.length > 0) {
        return apiResponses.shift()!;
      }
      const url = typeof path === 'string' ? path : path.toString();
      if (url.includes('/players')) {
        return jsonResponse({ players: [
          { id: 'p1', name: 'Alex' },
          { id: 'p2', name: 'Billie' },
          { id: 'p3', name: 'Casey' },
          { id: 'p4', name: 'Devon' },
          { id: 'p5', name: 'Elliott' },
        ] });
      }
      if (url.includes('/rulesets')) {
        return jsonResponse([{ id: 'padel-default', name: 'Padel Default' }]);
      }
      if (url.includes('/sports')) {
        return jsonResponse([{ id: 'padel', name: 'Padel' }]);
      }
      return jsonResponse([]);
    });

    render(<TournamentsClient initialTournaments={[]} loadError={false} />);

    const searchInput = await screen.findByLabelText('Search players');
    const listbox = await screen.findByRole('listbox', { name: /available players/i });
    await waitFor(() =>
      expect(
        mockedApiFetch
          .mock.calls
          .some(([url]) => (typeof url === 'string' ? url : url.toString()).includes('/v0/players'))
      ).toBe(true)
    );
    await screen.findByText('Alex');
    await within(listbox).findByText(/^[Aa]lex$/);

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: /Remove Alex/i })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Dev' } });
    await within(listbox).findByText(/Devon/i);
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: /Remove Devon/i })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.keyDown(searchInput, { key: 'Backspace' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Remove Devon/i })).not.toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'zzz' } });
    expect(await screen.findByText('No players match "zzz".')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '' } });
    await within(listbox).findByText(/^[Aa]lex$/);
    fireEvent.keyDown(searchInput, { key: 'Home' });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: /Remove Billie/i })).toBeInTheDocument();
  });

describe('Tournament detail page', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedFetchStageStandings.mockReset();
    mockedListStageMatches.mockReset();
    mockedIsAdmin.mockReset();
  });

  it('renders schedule and standings from API helpers', async () => {
    const detailResponses: Response[] = [
      jsonResponse({
        id: 't1',
        sport: 'padel',
        name: 'Championship',
        createdByUserId: 'admin',
      }),
      jsonResponse([
        { id: 'stage-1', tournamentId: 't1', type: 'americano', config: null },
      ]),
      jsonResponse([
        { id: 'p1', name: 'Player One' },
        { id: 'p2', name: 'Player Two' },
        { id: 'p3', name: 'Player Three' },
        { id: 'p4', name: 'Player Four' },
      ]),
    ];
    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      if (detailResponses.length > 0) {
        return detailResponses.shift()!;
      }
      const url = typeof path === 'string' ? path : path.toString();
      if (url.includes('/players/by-ids')) {
        return jsonResponse([]);
      }
      return jsonResponse({
        id: 'noop',
        sport: 'padel',
        name: 'noop',
        createdByUserId: 'admin',
      });
    });

    const matches: StageScheduleMatch[] = [
      {
        id: 'm1',
        sport: 'padel',
        stageId: 'stage-1',
        bestOf: null,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: 'padel-default',
        participants: [
          { id: 'pa', side: 'A', playerIds: ['p1', 'p2'] },
          { id: 'pb', side: 'B', playerIds: ['p3', 'p4'] },
        ],
      },
    ];
    const standings: StageStandings = {
      stageId: 'stage-1',
      standings: [
        {
          playerId: 'p1',
          matchesPlayed: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          pointsScored: 12,
          pointsAllowed: 7,
          pointsDiff: 5,
          setsWon: 2,
          setsLost: 0,
          points: 3,
        },
      ],
    };
    mockedListStageMatches.mockResolvedValue(matches);
    mockedFetchStageStandings.mockResolvedValue(standings);

    const element = await TournamentDetailPage({ params: { id: 't1' } });
    render(element);

    expect(await screen.findByText('Championship')).toBeInTheDocument();
    expect(screen.getByText('Stage: Americano')).toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeInTheDocument();
    expect(screen.getByText(/Player Four/)).toBeInTheDocument();
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /record a match/i })).toBeInTheDocument();

    expect(mockedListStageMatches).toHaveBeenCalledWith('t1', 'stage-1', {
      cache: 'no-store',
    });
    expect(mockedFetchStageStandings).toHaveBeenCalledWith('t1', 'stage-1', {
      cache: 'no-store',
    });
  });

  it('refetches schedule data after reload', async () => {
    const reloadResponses: Response[] = [
      jsonResponse({
        id: 't1',
        sport: 'padel',
        name: 'Championship',
        createdByUserId: 'admin',
      }),
      jsonResponse([
        { id: 'stage-1', tournamentId: 't1', type: 'americano', config: null },
      ]),
      jsonResponse([
        { id: 'p1', name: 'Player One' },
        { id: 'p2', name: 'Player Two' },
      ]),
      jsonResponse({
        id: 't1',
        sport: 'padel',
        name: 'Championship',
        createdByUserId: 'admin',
      }),
      jsonResponse([
        { id: 'stage-1', tournamentId: 't1', type: 'americano', config: null },
      ]),
      jsonResponse([
        { id: 'p5', name: 'Player Five' },
        { id: 'p6', name: 'Player Six' },
      ]),
    ];
    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      if (reloadResponses.length > 0) {
        return reloadResponses.shift()!;
      }
      const url = typeof path === 'string' ? path : path.toString();
      if (url.includes('/players/by-ids')) {
        return jsonResponse([]);
      }
      return jsonResponse({ id: 'noop', sport: 'padel', name: 'noop' });
    });

    const firstMatches: StageScheduleMatch[] = [
      {
        id: 'm1',
        sport: 'padel',
        stageId: 'stage-1',
        bestOf: null,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: 'padel-default',
        participants: [
          { id: 'pa', side: 'A', playerIds: ['p1'] },
          { id: 'pb', side: 'B', playerIds: ['p2'] },
        ],
      },
    ];
    const secondMatches: StageScheduleMatch[] = [
      {
        id: 'm2',
        sport: 'padel',
        stageId: 'stage-1',
        bestOf: null,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: 'padel-default',
        participants: [
          { id: 'pc', side: 'A', playerIds: ['p5'] },
          { id: 'pd', side: 'B', playerIds: ['p6'] },
        ],
      },
    ];
    const firstStandings: StageStandings = {
      stageId: 'stage-1',
      standings: [
        {
          playerId: 'p1',
          matchesPlayed: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          pointsScored: 12,
          pointsAllowed: 8,
          pointsDiff: 4,
          setsWon: 2,
          setsLost: 1,
          points: 3,
        },
      ],
    };
    const secondStandings: StageStandings = {
      stageId: 'stage-1',
      standings: [
        {
          playerId: 'p5',
          matchesPlayed: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          pointsScored: 15,
          pointsAllowed: 9,
          pointsDiff: 6,
          setsWon: 2,
          setsLost: 0,
          points: 3,
        },
      ],
    };

    mockedListStageMatches
      .mockResolvedValueOnce(firstMatches)
      .mockResolvedValueOnce(secondMatches);
    mockedFetchStageStandings
      .mockResolvedValueOnce(firstStandings)
      .mockResolvedValueOnce(secondStandings);

    const initialRender = await TournamentDetailPage({ params: { id: 't1' } });
    render(initialRender);
    const initialPlayers = await screen.findAllByText('Player One');
    expect(initialPlayers.length).toBeGreaterThan(0);

    cleanup();

    const reloadRender = await TournamentDetailPage({ params: { id: 't1' } });
    render(reloadRender);
    const reloadPlayers = await screen.findAllByText('Player Five');
    expect(reloadPlayers.length).toBeGreaterThan(0);
    expect(screen.queryByText('Player One')).not.toBeInTheDocument();

    expect(mockedListStageMatches).toHaveBeenCalledTimes(2);
    expect(mockedFetchStageStandings).toHaveBeenCalledTimes(2);
  });
});
