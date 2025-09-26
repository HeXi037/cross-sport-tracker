import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());

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

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Headers()),
}));

import MatchDetailPage from "./page";

describe("MatchDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
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

    expect(
      screen.getByText((text) =>
        text.startsWith("Padel · World Padel Tour · Completed")
      )
    ).toBeInTheDocument();

    const locale = "en-US";
    const displayed = new Date(match.playedAt).toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    expect(screen.getByText((t) => t.includes(displayed))).toBeInTheDocument();

    expect(new Date(match.playedAt).toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
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

    expect(
      screen.getByRole("heading", { level: 1, name: "Ann vs Ben vs Cam" })
    ).toBeInTheDocument();

    const meta = screen.getByText(
      (text, element) =>
        element?.classList.contains("match-meta") && text.includes("Bowling")
    );
    expect(meta).toHaveTextContent("Bowling · — · —");
  });

  it("prefers API-provided ruleset and status labels", async () => {
    const match = {
      id: "m5",
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

    render(await MatchDetailPage({ params: { mid: "m5" } }));

    const meta = screen.getByText(
      (text, element) =>
        element?.classList.contains("match-meta") && text.includes("Padel")
    );
    expect(meta).toHaveTextContent(
      "Padel · Premier Padel · In Progress"
    );
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
    expect(headers).toEqual(["Side", "Set 1", "Set 2", "Sets", "Games", "Points"]);

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
    expect(headers).toEqual(["Side", "Set 1", "Set 2", "Sets", "Games", "Points"]);

    const sideARow = rows[1];
    const sideACells = within(sideARow)
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideACells).toEqual(["6", "6", "2", "12", "48"]);

    const sideBRow = rows[2];
    const sideBCells = within(sideBRow)
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideBCells).toEqual(["4", "3", "0", "7", "28"]);
    expect(screen.getByText(/Overall: 6-4, 6-3/)).toBeInTheDocument();
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
    expect(sideACells).toEqual(["6", "3", "7", "2", "16"]);

    const sideBCells = within(rows[2])
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(sideBCells).toEqual(["4", "6", "5", "1", "15"]);

    expect(screen.getByText(/Overall: 6-4, 3-6, 7-5/)).toBeInTheDocument();

    expect(
      screen.queryByText(/Completed/, {
        selector: ".connection-indicator",
      })
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("heading", { level: 1, name: /unknown vs unknown/i })
    ).toBeInTheDocument();
  });
});
