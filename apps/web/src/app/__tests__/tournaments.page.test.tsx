import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import TournamentsClient from "../tournaments/tournaments-client";
import TournamentDetailPage from "../tournaments/[id]/page";
import {
  apiFetch,
  createStage,
  createTournament,
  getTournament,
  scheduleStage,
  fetchStageStandings,
  listStageMatches,
  listTournamentStages,
  deleteTournament,
  updateTournament,
  type StageScheduleMatch,
  type StageStandings,
  type TournamentSummary,
} from "../../lib/api";
import { useSessionSnapshot } from "../../lib/useSessionSnapshot";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>(
    "../../lib/api"
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
    createStage: vi.fn(),
    createTournament: vi.fn(),
    getTournament: vi.fn(),
    scheduleStage: vi.fn(),
    fetchStageStandings: vi.fn(),
    listStageMatches: vi.fn(),
    listTournamentStages: vi.fn(),
    deleteTournament: vi.fn(),
    updateTournament: vi.fn(),
  };
});

vi.mock("../../lib/useSessionSnapshot", () => ({
  useSessionSnapshot: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedCreateTournament = vi.mocked(createTournament);
const mockedCreateStage = vi.mocked(createStage);
const mockedGetTournament = vi.mocked(getTournament);
const mockedScheduleStage = vi.mocked(scheduleStage);
const mockedFetchStageStandings = vi.mocked(fetchStageStandings);
const mockedListStageMatches = vi.mocked(listStageMatches);
const mockedListTournamentStages = vi.mocked(listTournamentStages);
const mockedDeleteTournament = vi.mocked(deleteTournament);
const mockedUpdateTournament = vi.mocked(updateTournament);
const mockedUseSessionSnapshot = vi.mocked(useSessionSnapshot);

const jsonResponse = (data: unknown): Response =>
  ({
    ok: true,
    json: async () => data,
  } as Response);

const selectPlayers = async (listbox: HTMLElement, names: string[]) => {
  await waitFor(() => {
    expect(within(listbox).queryByText("No players are available yet.")).toBeNull();
  });
  for (const name of names) {
    await waitFor(() => {
      const node = within(listbox).queryByText(new RegExp(`^${name}$`, "i"));
      expect(node).not.toBeNull();
      return true;
    });
    const option = within(listbox).getByText(new RegExp(`^${name}$`, "i"));
    fireEvent.click(option);
  }
};

describe("Tournaments flows", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedCreateTournament.mockReset();
    mockedCreateStage.mockReset();
    mockedGetTournament.mockReset();
    mockedScheduleStage.mockReset();
    mockedFetchStageStandings.mockReset();
    mockedListStageMatches.mockReset();
    mockedListTournamentStages.mockReset();
    mockedDeleteTournament.mockReset();
    mockedUpdateTournament.mockReset();
    mockedUseSessionSnapshot.mockReturnValue({
      isAdmin: true,
      isLoggedIn: true,
      userId: "admin",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("creates Americano tournaments and displays the generated schedule", async () => {
    const playerList = [
      { id: "p1", name: "Alex" },
      { id: "p2", name: "Billie" },
      { id: "p3", name: "Casey" },
      { id: "p4", name: "Devon" },
    ];
    const apiResponses: Response[] = [
      jsonResponse([{ id: "padel", name: "Padel" }]),
      jsonResponse({ players: playerList }),
      jsonResponse([{ id: "padel", name: "Padel" }]),
      jsonResponse({ players: playerList }),
      jsonResponse([{ id: "padel-default", name: "Padel Default" }]),
    ];
    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      if (apiResponses.length > 0) {
        return apiResponses.shift()!;
      }
      const url = typeof path === "string" ? path : path.toString();
      if (url.includes("/players")) {
        return jsonResponse({ players: playerList });
      }
      if (url.includes("/rulesets")) {
        return jsonResponse([{ id: "padel-default", name: "Padel Default" }]);
      }
      if (url.includes("/sports")) {
        return jsonResponse([{ id: "padel", name: "Padel" }]);
      }
      return jsonResponse([]);
    });

    const initial = [
      {
        id: "t-existing",
        sport: "padel",
        name: "Existing Cup",
        createdByUserId: "admin",
      },
    ];

    mockedCreateTournament.mockResolvedValue({
      id: "t-new",
      sport: "padel",
      name: "Winter Americano",
      createdByUserId: "admin",
    });
    mockedCreateStage.mockResolvedValue({
      id: "s1",
      tournamentId: "t-new",
      type: "americano",
      config: { format: "americano" },
    });
    const scheduledMatches: StageScheduleMatch[] = [
      {
        id: "m1",
        sport: "padel",
        stageId: "s1",
        bestOf: null,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: "padel-default",
        participants: [
          { id: "pa", side: "A", playerIds: ["p1", "p2"] },
          { id: "pb", side: "B", playerIds: ["p3", "p4"] },
        ],
      },
    ];
    mockedScheduleStage.mockResolvedValue({
      stageId: "s1",
      matches: scheduledMatches,
    });

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    const nameInput = await screen.findByLabelText("Tournament name");
    fireEvent.change(nameInput, { target: { value: "Winter Americano" } });

    await waitFor(() => {
      expect(mockedApiFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    const listbox = await screen.findByRole("listbox", { name: /available players/i });
    await selectPlayers(listbox, ["Alex", "Billie", "Casey", "Devon"]);

    const submitButton = screen.getByRole("button", { name: /create and schedule/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedCreateTournament).toHaveBeenCalledWith({
        sport: "padel",
        name: "Winter Americano",
      });
    });
    expect(mockedCreateStage).toHaveBeenCalledWith("t-new", {
      type: "americano",
      config: { format: "americano" },
    });
    expect(mockedScheduleStage).toHaveBeenCalledWith("t-new", "s1", {
      playerIds: ["p1", "p2", "p3", "p4"],
      rulesetId: "padel-default",
      courtCount: 1,
    });

    expect(
      await screen.findByText(/Created Winter Americano \(Americano\) with 1 scheduled match./i)
    ).toBeInTheDocument();
    expect(screen.getByText("Existing Cup")).toBeInTheDocument();
    expect(screen.getByText("Winter Americano")).toBeInTheDocument();
  });

  it("creates round-robin tournaments for other sports", async () => {
    const playerList = [
      { id: "p1", name: "Jamie" },
      { id: "p2", name: "Kai" },
      { id: "p3", name: "Lee" },
    ];
    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      const url = typeof path === "string" ? path : path.toString();
      if (url.includes("/sports")) {
        return jsonResponse([
          { id: "padel", name: "Padel" },
          { id: "tennis", name: "Tennis" },
        ]);
      }
      if (url.includes("/players")) {
        return jsonResponse({ players: playerList });
      }
      if (url.includes("/rulesets?sport=tennis")) {
        return jsonResponse([{ id: "tennis-default", name: "Tennis Default" }]);
      }
      return jsonResponse([]);
    });

    const initial: TournamentSummary[] = [];

    mockedCreateTournament.mockResolvedValue({
      id: "t-tennis",
      sport: "tennis",
      name: "Spring Ladder",
      createdByUserId: "admin",
    });
    mockedCreateStage.mockResolvedValue({
      id: "stage-tennis",
      tournamentId: "t-tennis",
      type: "round_robin",
      config: { format: "round_robin", bestOf: 5 },
    });

    const scheduledMatches: StageScheduleMatch[] = [
      {
        id: "tm1",
        sport: "tennis",
        stageId: "stage-tennis",
        bestOf: 5,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: "tennis-default",
        participants: [
          { id: "pa", side: "A", playerIds: ["p1"] },
          { id: "pb", side: "B", playerIds: ["p2"] },
        ],
      },
      {
        id: "tm2",
        sport: "tennis",
        stageId: "stage-tennis",
        bestOf: 5,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: "tennis-default",
        participants: [
          { id: "pc", side: "A", playerIds: ["p1"] },
          { id: "pd", side: "B", playerIds: ["p3"] },
        ],
      },
      {
        id: "tm3",
        sport: "tennis",
        stageId: "stage-tennis",
        bestOf: 5,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: "tennis-default",
        participants: [
          { id: "pe", side: "A", playerIds: ["p2"] },
          { id: "pf", side: "B", playerIds: ["p3"] },
        ],
      },
    ];
    mockedScheduleStage.mockResolvedValue({
      stageId: "stage-tennis",
      matches: scheduledMatches,
    });

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    const nameInput = await screen.findByLabelText("Tournament name");
    fireEvent.change(nameInput, { target: { value: "Spring Ladder" } });

    const sportSelect = await screen.findByLabelText("Sport");
    fireEvent.change(sportSelect, { target: { value: "tennis" } });

    const formatSelect = await screen.findByLabelText("Stage format");
    fireEvent.change(formatSelect, { target: { value: "round_robin" } });

    const bestOfSelect = await screen.findByLabelText("Best of sets (optional)");
    fireEvent.change(bestOfSelect, { target: { value: "5" } });

    const listbox = await screen.findByRole("listbox", { name: /available players/i });
    await selectPlayers(listbox, ["Jamie", "Kai", "Lee"]);

    const submitButton = screen.getByRole("button", { name: /create and schedule/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedCreateTournament).toHaveBeenCalledWith({
        sport: "tennis",
        name: "Spring Ladder",
      });
    });
    expect(mockedCreateStage).toHaveBeenCalledWith("t-tennis", {
      type: "round_robin",
      config: { format: "round_robin", bestOf: 5 },
    });
    expect(mockedScheduleStage).toHaveBeenCalledWith("t-tennis", "stage-tennis", {
      playerIds: ["p1", "p2", "p3"],
      rulesetId: "tennis-default",
      bestOf: 5,
    });

    expect(
      await screen.findByText(/Created Spring Ladder \(Round robin\) with 3 scheduled matches\./i)
    ).toBeInTheDocument();
    expect(screen.getByText("Spring Ladder")).toBeInTheDocument();
  });

  it("restricts deletion to creators when not an admin", async () => {
    mockedUseSessionSnapshot.mockReturnValue({
      isAdmin: false,
      isLoggedIn: true,
      userId: "user-1",
    });
    mockedDeleteTournament.mockResolvedValue();

    const initial = [
      {
        id: "t1",
        sport: "padel",
        name: "My Americano",
        createdByUserId: "user-1",
      },
    ];

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    mockedApiFetch.mockResolvedValue(jsonResponse([]));

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    const deleteButton = await screen.findByRole("button", { name: /delete/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockedDeleteTournament).toHaveBeenCalledWith("t1");
      expect(screen.queryByText("My Americano")).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it("allows updating tournament names and reports success", async () => {
    const initial = [
      {
        id: "t-1",
        sport: "padel",
        name: "Local Cup",
        createdByUserId: "admin",
      },
      {
        id: "t-2",
        sport: "padel",
        name: "Autumn Friendly",
        createdByUserId: "owner",
      },
    ];

    mockedUpdateTournament.mockResolvedValue({
      id: "t-1",
      sport: "padel",
      name: "Local Cup Finals",
      createdByUserId: "admin",
    });

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    const card = await screen.findByRole("heading", { name: "Local Cup" });
    const cardContainer = card.closest("li");
    expect(cardContainer).not.toBeNull();
    const editButton = within(cardContainer!).getByRole("button", { name: "Edit" });
    fireEvent.click(editButton);

    const nameInput = within(cardContainer!).getByLabelText("Tournament name");
    fireEvent.change(nameInput, { target: { value: " Local Cup Finals " } });

    const saveButton = within(cardContainer!).getByRole("button", { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedUpdateTournament).toHaveBeenCalledWith("t-1", {
        name: "Local Cup Finals",
      });
    });

    expect(await screen.findByText("Local Cup Finals was updated.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local Cup Finals" })).toBeInTheDocument();
  });

  it("shows an error when tournament updates are forbidden", async () => {
    mockedUseSessionSnapshot.mockReturnValue({
      isAdmin: false,
      isLoggedIn: true,
      userId: "player-1",
    });

    const initial = [
      {
        id: "t-1",
        sport: "padel",
        name: "Club Night",
        createdByUserId: "player-1",
      },
    ];

    const forbidden = Object.assign(new Error("Forbidden"), { status: 403 });
    mockedUpdateTournament.mockRejectedValue(forbidden);

    render(<TournamentsClient initialTournaments={initial} loadError={false} />);

    const card = await screen.findByRole("heading", { name: "Club Night" });
    const cardContainer = card.closest("li");
    expect(cardContainer).not.toBeNull();
    const editButton = within(cardContainer!).getByRole("button", { name: "Edit" });
    fireEvent.click(editButton);

    const nameInput = within(cardContainer!).getByLabelText("Tournament name");
    fireEvent.change(nameInput, { target: { value: "Club Night Updated" } });

    const saveButton = within(cardContainer!).getByRole("button", { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedUpdateTournament).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(
        "You can only edit tournaments that you created."
      )
    ).toBeInTheDocument();
  });

  it("describes the tournament permission model", async () => {
    render(<TournamentsClient initialTournaments={[]} loadError={false} />);

    expect(
      screen.getByText("Admins can create, edit, and delete tournaments for any sport.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Logged-in organisers can create supported formats and manage the tournaments they created."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can edit or delete any tournament.")
    ).toBeInTheDocument();
  });

  it("renders tournament detail page with schedule and standings", async () => {
    mockedApiFetch.mockImplementation(async (path: RequestInfo | URL) => {
      const url = typeof path === "string" ? path : path.toString();
      if (url.includes("/players/by-ids")) {
        return jsonResponse([
          { id: "p1", name: "Player One" },
          { id: "p2", name: "Player Two" },
          { id: "p3", name: "Player Three" },
          { id: "p4", name: "Player Four" },
        ]);
      }
      return jsonResponse([]);
    });

    mockedGetTournament.mockResolvedValue({
      id: "t1",
      sport: "padel",
      name: "Championship",
      createdByUserId: "admin",
    });
    mockedListTournamentStages.mockResolvedValue([
      { id: "stage-1", tournamentId: "t1", type: "americano", config: null },
    ]);

    const matches: StageScheduleMatch[] = [
      {
        id: "m1",
        sport: "padel",
        stageId: "stage-1",
        bestOf: null,
        playedAt: null,
        location: null,
        isFriendly: false,
        rulesetId: "padel-default",
        participants: [
          { id: "pa", side: "A", playerIds: ["p1", "p2"] },
          { id: "pb", side: "B", playerIds: ["p3", "p4"] },
        ],
      },
    ];
    const standings: StageStandings = {
      stageId: "stage-1",
      standings: [
        {
          playerId: "p1",
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

    const element = await TournamentDetailPage({ params: { id: "t1" } });
    render(element);

    expect(await screen.findByText("Championship")).toBeInTheDocument();
    expect(screen.getByText("Stage: Americano")).toBeInTheDocument();
    expect(screen.getByText("Player One")).toBeInTheDocument();
    expect(screen.getByText("Player Three, Player Four")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /record a match/i })).toBeInTheDocument();

    expect(mockedGetTournament).toHaveBeenCalledWith("t1", { cache: "no-store" });
    expect(mockedListTournamentStages).toHaveBeenCalledWith("t1", {
      cache: "no-store",
    });
    expect(mockedListStageMatches).toHaveBeenCalledWith("t1", "stage-1", {
      cache: "no-store",
    });
    expect(mockedFetchStageStandings).toHaveBeenCalledWith("t1", "stage-1", {
      cache: "no-store",
    });
  });
});
