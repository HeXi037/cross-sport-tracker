import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { formatDate } from "../../../lib/i18n";

type NextNotFoundError = Error & { digest?: string };

const apiFetchMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const nextNotFoundError = vi.hoisted(
  () =>
    Object.assign(new Error("NEXT_NOT_FOUND"), {
      digest: "NEXT_NOT_FOUND",
    }) as NextNotFoundError
);

type ScoreEvent = {
  type: string;
  payload: { type: string; by: "A" | "B" };
};

function buildPadelEvents(
  setScores: Array<{ A: number; B: number }>
): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  const pushGame = (side: "A" | "B") => {
    for (let i = 0; i < 4; i += 1) {
      events.push({ type: "POINT", payload: { type: "POINT", by: side } });
    }
  };

  for (const score of setScores) {
    const winner = score.A > score.B ? "A" : "B";
    const loser = winner === "A" ? "B" : "A";
    const winnerGames = score[winner];
    const loserGames = score[loser];
    const sharedGames = Math.min(winnerGames, loserGames);

    for (let i = 0; i < sharedGames; i += 1) {
      pushGame(winner);
      pushGame(loser);
    }

    for (let i = sharedGames; i < winnerGames; i += 1) {
      pushGame(winner);
    }
  }

  return events;
}

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>(
    "../../../lib/api"
  );
  return {
    ...actual,
    apiFetch: apiFetchMock,
    apiUrl: (p: string) => p,
  };
});

const cookiesMock = vi.hoisted(() => vi.fn(() => ({ get: vi.fn(() => undefined) })));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Headers()),
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => {
  notFoundMock.mockImplementation(() => {
    throw nextNotFoundError;
  });
  return { notFound: notFoundMock };
});

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () =>
    (key: string, values?: Record<string, string | number>) => {
      if (key === "prediction.favored") {
        return `${values?.favorite} had a ${values?.percent}% chance to beat ${values?.opponent}`;
      }
      return key;
    }
  ),
}));

import MatchDetailPage from "./page";
import MatchNotFound from "./not-found";

const GAME_TOOLTIP_TEXT =
  "Game totals are only shown for sports that track them.";

describe("MatchDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("renders date-only match consistently across time zones", async () => {
    const match = {
      id: "m1",
      sport: "padel",
      rulesetId: "padel_standard",
      status: "Completed",
      playedAt: "2024-01-01T00:00:00Z",
      participants: [],
      summary: {},
    };
    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m1" } }));

    const locale = "en-GB";
    const expectedDate = formatDate(match.playedAt, locale);
    const meta = screen.getByText(
      (text, element) =>
        element?.classList.contains("match-meta") &&
        text.startsWith("Padel · World Padel Tour · Completed")
    );

    expect(meta).toHaveTextContent(
      `Padel · World Padel Tour · Completed · ${expectedDate}`
    );
    expect(expectedDate).not.toMatch(/AM|PM/i);

    expect(new Date(match.playedAt).toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("renders matches saved without a time component", async () => {
    const match = {
      id: "m1", // reused id is fine within this test scope
      sport: "padel",
      rulesetId: "padel_standard",
      status: "Scheduled",
      playedAt: "2024-05-05",
      participants: [],
      summary: {},
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m1" } }));

    const locale = "en-GB";
    const expectedDate = formatDate(new Date(match.playedAt), locale);
    const meta = screen.getByText(
      (text, element) =>
        element?.classList.contains("match-meta") &&
        text.includes("Scheduled")
    );

    expect(meta).toHaveTextContent(
      `Padel · World Padel Tour · Scheduled · ${expectedDate}`
    );
    expect(meta).not.toHaveTextContent(/00:00/);
  });

  it("renders all participants dynamically", async () => {
    const match = {
      id: "m2",
      sport: "bowling",
      rulesetId: null,
      status: "",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
        { side: "C", playerIds: ["p3"] },
      ],
      summary: {},
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Ann" },
          { id: "p2", name: "Ben" },
          { id: "p3", name: "Cam" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "bowling", name: "Bowling" }],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(await MatchDetailPage({ params: { mid: "m2" } }));

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Ann vs Ben vs Cam");
    expect(heading).toHaveAccessibleName("Ann versus Ben versus Cam");

    const meta = screen.getByText(
      (text, element) =>
        element?.classList.contains("match-meta") && text.includes("Bowling")
    );
    expect(meta).toHaveTextContent(/^Bowling$/);
  });

  it("prefers API-provided ruleset and status labels", async () => {
    const match = {
      id: "m6",
      sport: "padel",
      rulesetId: "padel_standard",
      ruleset: { id: "padel_standard", name: "Premier Padel" },
      summary: {},
      status: { label: "In Progress" },
      playedAt: null,
      participants: [],
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m6" } }));

    const meta = screen.getByText(
      (text, element) =>
        element?.classList.contains("match-meta") && text.includes("Padel")
    );
    expect(meta).toHaveTextContent(
      "Padel · Premier Padel · In Progress"
    );
  });

  it("shows a rating-based prediction in the match details", async () => {
    const match = {
      id: "m7",
      sport: "padel",
      rulesetId: null,
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
      ],
      ratingPrediction: { sides: { A: 0.66, B: 0.34 }, method: "elo" },
      summary: {},
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Alice" },
          { id: "p2", name: "Bob" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(await MatchDetailPage({ params: { mid: "m7" } }));

    const prediction = await screen.findByText(
      "Alice had a 66% chance to beat Bob"
    );
    expect(prediction).toBeInTheDocument();
    const term = prediction.closest("dd")?.previousElementSibling;
    expect(term).toHaveTextContent("Prediction");
  });

  it("shows best-of metadata when available", async () => {
    const match = {
      id: "m6",
      sport: "padel",
      rulesetId: "padel_standard",
      bestOf: 1,
      status: "Scheduled",
      playedAt: null,
      participants: [],
      summary: {},
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m6" } }));

    const meta = screen.getByText(
      (text, element) =>
        element?.classList.contains("match-meta") && text.includes("Best of 1")
    );
    expect(meta).toHaveTextContent(
      "Padel · World Padel Tour · Best of 1 · Scheduled"
    );
  });

  it("displays participant breakdown and match logistics", async () => {
    const match = {
      id: "m7",
      sport: "padel",
      rulesetId: "padel_standard",
      status: "Completed",
      playedAt: "2024-03-01T15:30:00Z",
      location: "Center Court",
      isFriendly: false,
      participants: [
        { side: "A", playerIds: ["p1", "p2"] },
        { side: "B", playerIds: ["p3", "p4"] },
      ],
      summary: {
        sets: { A: 2, B: 1 },
        games: { A: 18, B: 15 },
        points: { A: 120, B: 110 },
      },
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Ana" },
          { id: "p2", name: "Bea" },
          { id: "p3", name: "Cara" },
          { id: "p4", name: "Dina" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m7" } }));

    expect(
      screen.getByRole("heading", { level: 2, name: /participants/i })
    ).toBeInTheDocument();

    const participantList = screen.getByRole("list", {
      name: /match participants/i,
    });
    const participantItems = within(participantList).getAllByRole("listitem");
    expect(participantItems).toHaveLength(2);
    expect(
      within(participantItems[0]).getByText(/side a/i)
    ).toBeInTheDocument();
    expect(
      within(participantItems[0]).getByText(/winner/i)
    ).toBeInTheDocument();

    const totalsTable = screen.getByRole("table", { name: /score totals/i });
    const totalRows = within(totalsTable).getAllByRole("row");
    expect(totalRows).toHaveLength(3);
    const sideACells = within(totalRows[1])
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideACells).toEqual(["2", "120"]);

    expect(
      screen.getByRole("heading", { level: 2, name: /match info/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Counts toward leaderboard standings/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Center Court")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view padel rules/i })
    ).toHaveAttribute("href", expect.stringMatching(/^\/record\/padel\/?$/));
  });

  it("renders racket sport summary with detailed scoreboard", async () => {
    const match = {
      id: "m3",
      sport: "tennis",
      rulesetId: "tennis_best_of_three",
      status: "",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
      ],
      summary: {
        set_scores: [
          { A: 6, B: 4 },
          { A: 7, B: 5 },
        ],
        sets: { A: 2, B: 0 },
        games: { A: 3, B: 2 },
        points: { A: 40, B: 30 },
      },
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Serena" },
          { id: "p2", name: "Venus" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "tennis", name: "Tennis" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "tennis_best_of_three", name: "Best of 3" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m3" } }));

    const table = await screen.findByRole("table", { name: /racket scoreboard/i });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    const headers = within(rows[0])
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      "Side",
      "Set 1",
      "Set 2",
      "Sets won",
      "Games won",
      "Points won",
    ]);
    const gamesHeader = within(rows[0]).getByRole("columnheader", {
      name: "Games won",
    });
    expect(gamesHeader).toHaveAttribute("title", GAME_TOOLTIP_TEXT);

    const sideARow = rows[1];
    const sideACells = within(sideARow)
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(within(sideARow).getByText("A")).toBeInTheDocument();
    expect(sideACells).toEqual(["6", "7", "2", "3", "40"]);

    const sideBRow = rows[2];
    const sideBCells = within(sideBRow)
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideBCells).toEqual(["4", "5", "0", "2", "30"]);
    expect(screen.getByText(/Overall: 6-4, 7-5/)).toBeInTheDocument();
  });

  it("reconstructs completed padel totals from point events", async () => {
    const match = {
      id: "m4",
      sport: "padel",
      rulesetId: "padel_standard",
      status: "Completed",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1", "p2"] },
        { side: "B", playerIds: ["p3", "p4"] },
      ],
      summary: {
        sets: { A: 2, B: 0 },
        games: { A: 0, B: 0 },
        points: { A: 0, B: 0 },
      },
      events: buildPadelEvents([
        { A: 6, B: 4 },
        { A: 6, B: 3 },
      ]),
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Ana" },
          { id: "p2", name: "Bea" },
          { id: "p3", name: "Carla" },
          { id: "p4", name: "Dana" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m4" } }));

    const table = await screen.findByRole("table", { name: /racket scoreboard/i });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    const headers = within(rows[0])
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      "Side",
      "Set 1",
      "Set 2",
      "Sets won",
      "Points won",
    ]);

    const sideARow = rows[1];
    const sideACells = within(sideARow)
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideACells).toEqual(["6", "6", "2", "48"]);

    const sideBRow = rows[2];
    const sideBCells = within(sideBRow)
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideBCells).toEqual(["4", "3", "0", "28"]);
    expect(screen.getByText(/Overall: 6-4, 6-3/)).toBeInTheDocument();
  });

  it("hides padel game totals when not provided", async () => {
    const match = {
      id: "m5",
      sport: "padel",
      rulesetId: "padel_standard",
      status: "Scheduled",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1", "p2"] },
        { side: "B", playerIds: ["p3", "p4"] },
      ],
      summary: {
        set_scores: [{ A: 6, B: 3 }],
        sets: { A: 1, B: 0 },
        games: { A: 0, B: 0 },
        points: { A: 52, B: 48 },
      },
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Ana" },
          { id: "p2", name: "Bea" },
          { id: "p3", name: "Carla" },
          { id: "p4", name: "Dana" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m5" } }));

    const scoreboard = await screen.findByRole("table", {
      name: /racket scoreboard/i,
    });
    const scoreboardHeaders = within(scoreboard)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(scoreboardHeaders).toEqual([
      "Side",
      "Set 1",
      "Sets won",
      "Points won",
    ]);
    expect(
      within(scoreboard).queryByRole("columnheader", { name: "Games won" })
    ).not.toBeInTheDocument();

    const summaryTable = await screen.findByRole("table", {
      name: /score totals/i,
    });
    const summaryHeaders = within(summaryTable)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(summaryHeaders).toEqual(["Side", "Sets won", "Points won"]);
  });

  it("renders disc golf hole breakdown including to-par totals", async () => {
    const match = {
      id: "m5",
      sport: "disc_golf",
      rulesetId: "disc_golf_standard",
      status: "",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
      ],
      summary: {
        scores: { A: [3, 4, 2], B: [4, 5, 3] },
        pars: [3, 4, 3],
        totals: { A: 9, B: 12 },
        parTotal: 10,
        toPar: { A: -1, B: 2 },
      },
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Eagle" },
          { id: "p2", name: "Faldo" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "disc_golf", name: "Disc Golf" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "disc_golf_standard", name: "Stroke Play" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m4" } }));

    const table = await screen.findByRole("table", { name: /disc golf scoreboard/i });
    expect(within(table).getByText("H1")).toBeInTheDocument();
    expect(within(table).getByText("Par")).toBeInTheDocument();
    expect(within(table).getByText("H3")).toBeInTheDocument();
    expect(within(table).getByText("9")).toBeInTheDocument();
    expect(within(table).getByText("12")).toBeInTheDocument();
    expect(within(table).getByText("+2")).toBeInTheDocument();
    expect(within(table).getByText("-1")).toBeInTheDocument();
  });

  it("derives final racket totals when aggregated scores are missing", async () => {
    const match = {
      id: "m5",
      sport: "padel",
      rulesetId: "padel_standard",
      status: "Completed",
      playedAt: "2024-06-01T10:00:00Z",
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
      ],
      summary: {
        set_scores: [
          { A: 6, B: 4 },
          { A: 3, B: 6 },
          { A: 7, B: 5 },
        ],
        sets: { A: 0, B: 0 },
        games: { A: 0, B: 0 },
      },
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Player A" },
          { id: "p2", name: "Player B" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "padel", name: "Padel" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "padel_standard", name: "World Padel Tour" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m5" } }));

    const table = await screen.findByRole("table", { name: /racket scoreboard/i });
    const rows = within(table).getAllByRole("row");
    const sideACells = within(rows[1])
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideACells).toEqual(["6", "3", "7", "2"]);

    const sideBCells = within(rows[2])
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideBCells).toEqual(["4", "6", "5", "1"]);

    expect(screen.getByText(/Overall: 6-4, 3-6, 7-5/)).toBeInTheDocument();

    expect(
      screen.queryByText(/Completed/, {
        selector: ".connection-indicator",
      })
    ).not.toBeInTheDocument();
  });

  it("lets Next.js render the route not-found boundary when the match is missing", async () => {
    notFoundMock.mockImplementation(() => {
      throw nextNotFoundError;
    });
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Match missing" }),
    });

    await expect(
      MatchDetailPage({ params: { mid: "missing" } })
    ).rejects.toBe(nextNotFoundError);

    expect(notFoundMock).toHaveBeenCalledTimes(1);

    render(<MatchNotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: /match not found/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to matches/i })
    ).toHaveAttribute("href", expect.stringMatching(/^\/matches\/?$/));
    expect(
      screen.getByRole("link", { name: /browse matches/i })
    ).toHaveAttribute("href", expect.stringMatching(/^\/matches\/?$/));
  });

  it("shows a helpful message when a match cannot be loaded", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("offline"));

    render(await MatchDetailPage({ params: { mid: "missing" } }));

    expect(
      screen.getByRole("heading", { level: 1, name: /match unavailable/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/could not load this match/i)).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("warns the viewer when player names cannot be fetched", async () => {
    const match = {
      id: "m6",
      sport: "padel",
      rulesetId: null,
      status: "Scheduled",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
      ],
      summary: {},
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockRejectedValueOnce(new Error("lookup failed"))
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(await MatchDetailPage({ params: { mid: "m6" } }));

    expect(
      screen.getByText(/could not reach the player service/i)
    ).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/unknown vs unknown/i);
    expect(heading).toHaveAccessibleName(/unknown versus unknown/i);
  });

  it("renders the admin match history when the viewer is an admin", async () => {
    const match = {
      id: "m-admin",
      sport: "padel",
      rulesetId: null,
      status: "Completed",
      playedAt: "2024-01-01T00:00:00Z",
      participants: [],
      summary: {},
    };

    const auditEntries = [
      {
        id: "log-1",
        action: "created",
        actor: { id: "admin", username: "Admin", is_admin: true },
        createdAt: "2024-01-01T00:00:00Z",
        metadata: null,
      },
    ];

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/v0/matches/m-admin") {
        return Promise.resolve({ ok: true, json: async () => match });
      }
      if (path.startsWith("/v0/players/by-ids")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (path.startsWith("/v0/sports")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (path.startsWith("/v0/rulesets")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (path.includes("/comments")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [], total: 0, limit: 50, offset: 0 }),
        });
      }
      if (path.includes("/chat")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [], total: 0, limit: 50, offset: 0 }),
        });
      }
      if (path.endsWith("/audit")) {
        return Promise.resolve({ ok: true, json: async () => auditEntries });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    window.localStorage.setItem(
      "token",
      "x.eyJpc19hZG1pbiI6dHJ1ZX0.y",
    );

    render(await MatchDetailPage({ params: { mid: "m-admin" } }));

    const heading = await screen.findByRole("heading", {
      name: /admin · match history/i,
      level: 2,
    });
    expect(heading).toBeInTheDocument();
    const panel = heading.closest("section");
    expect(panel).not.toBeNull();
    const items = await within(panel as HTMLElement).findAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(/created/i);
    expect(items[0]).toHaveTextContent(/admin/i);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/v0/matches/m-admin/audit",
    );
  });
});
