import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    mockedApiFetch
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'padel', name: 'Padel' },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse({
          players: [
            { id: 'p1', name: 'Alex' },
            { id: 'p2', name: 'Billie' },
            { id: 'p3', name: 'Casey' },
            { id: 'p4', name: 'Devon' },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'padel-default', name: 'Padel Default' },
        ])
      );

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
      expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    });

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
    });

    expect(
      await screen.findByText(/Created Winter Americano with 1 scheduled match./i)
    ).toBeInTheDocument();

    expect(screen.getByText('Existing Cup')).toBeInTheDocument();
    expect(screen.getByText('Winter Americano')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Billie')).toBeInTheDocument();
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
    mockedApiFetch
      .mockResolvedValueOnce(
        jsonResponse({ id: 't1', sport: 'padel', name: 'Championship' })
      )
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'stage-1', tournamentId: 't1', type: 'americano', config: null }])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'p1', name: 'Player One' },
          { id: 'p2', name: 'Player Two' },
          { id: 'p3', name: 'Player Three' },
          { id: 'p4', name: 'Player Four' },
        ])
      );

    const matches: StageScheduleMatch[] = [
      {
        id: 'm1',
        sport: 'padel',
        stageId: 'stage-1',
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
    expect(screen.getByText('Player Four')).toBeInTheDocument();
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /record a match/i })).toBeInTheDocument();

    expect(mockedListStageMatches).toHaveBeenCalledWith('t1', 'stage-1', {
      cache: 'no-store',
    });
    expect(mockedFetchStageStandings).toHaveBeenCalledWith('t1', 'stage-1', {
      cache: 'no-store',
    });
  });
});
