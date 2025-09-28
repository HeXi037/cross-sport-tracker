import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  };
});

const mockedApiFetch = vi.mocked(apiFetch);
const mockedCreateTournament = vi.mocked(createTournament);
const mockedCreateStage = vi.mocked(createStage);
const mockedScheduleAmericanoStage = vi.mocked(scheduleAmericanoStage);
const mockedFetchStageStandings = vi.mocked(fetchStageStandings);
const mockedListStageMatches = vi.mocked(listStageMatches);
const mockedIsAdmin = vi.mocked(isAdmin);

const jsonResponse = (data: unknown): Response =>
  ({
    ok: true,
    json: async () => data,
  } as Response);

describe('Tournaments client view', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedCreateTournament.mockReset();
    mockedCreateStage.mockReset();
    mockedScheduleAmericanoStage.mockReset();
    mockedIsAdmin.mockReset();
    mockedIsAdmin.mockReturnValue(true);
  });

  it('renders tournaments and appends newly created entries', async () => {
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
        ],
      }),
      jsonResponse([
        { id: 'padel', name: 'Padel' },
      ]),
      jsonResponse({
        players: [
          { id: 'p1', name: 'Alex' },
          { id: 'p2', name: 'Billie' },
          { id: 'p3', name: 'Casey' },
          { id: 'p4', name: 'Devon' },
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
        return jsonResponse({ players: [] });
      }
      if (url.includes('/rulesets')) {
        return jsonResponse([]);
      }
      if (url.includes('/sports')) {
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });

    const initial = [
      { id: 't-existing', sport: 'padel', name: 'Existing Cup' },
    ];

    mockedCreateTournament.mockResolvedValue({
      id: 't-new',
      sport: 'padel',
      name: 'Winter Americano',
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

    const playerCheckboxes = screen.getAllByRole('checkbox');
    playerCheckboxes.slice(0, 4).forEach((box) => fireEvent.click(box));

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
        return jsonResponse({ players: [] });
      }
      if (url.includes('/rulesets')) {
        return jsonResponse([]);
      }
      if (url.includes('/sports')) {
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });

    render(<TournamentsClient initialTournaments={[]} loadError={false} />);

    const nameInput = await screen.findByLabelText('Tournament name');
    fireEvent.change(nameInput, { target: { value: 'Invalid Americano' } });

    await waitFor(() => {
      expect(mockedApiFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    const playerCheckboxes = screen.getAllByRole('checkbox');
    playerCheckboxes.slice(0, 6).forEach((box) => fireEvent.click(box));

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
      return jsonResponse([]);
    });

    mockedCreateTournament.mockResolvedValue({
      id: 't1',
      sport: 'padel',
      name: 'Odd Courts',
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

    const checkboxes = await screen.findAllByRole('checkbox');
    checkboxes.forEach((box) => fireEvent.click(box));

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
      jsonResponse({ id: 't1', sport: 'padel', name: 'Championship' }),
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
      return jsonResponse({ id: 'noop', sport: 'padel', name: 'noop' });
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
      jsonResponse({ id: 't1', sport: 'padel', name: 'Championship' }),
      jsonResponse([
        { id: 'stage-1', tournamentId: 't1', type: 'americano', config: null },
      ]),
      jsonResponse([
        { id: 'p1', name: 'Player One' },
        { id: 'p2', name: 'Player Two' },
      ]),
      jsonResponse({ id: 't1', sport: 'padel', name: 'Championship' }),
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
