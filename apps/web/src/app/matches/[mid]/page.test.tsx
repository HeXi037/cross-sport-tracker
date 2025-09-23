import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { execSync } from "child_process";

const apiFetchMock = vi.hoisted(() => vi.fn());

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
      playedAt: "2024-01-01T00:00:00",
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

    const displayed = new Date(match.playedAt).toLocaleDateString();
    expect(screen.getByText((t) => t.includes(displayed))).toBeInTheDocument();

    const laDate = execSync(
      "TZ=America/Los_Angeles node -e \"console.log(new Date('2024-01-01T00:00:00').toLocaleDateString())\""
    )
      .toString()
      .trim();
    expect(displayed).toBe(laDate);
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
        sets: { A: 2, B: 1 },
        games: { A: 6, B: 4 },
        points: { A: 30, B: 15 },
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
    const sideARow = rows[1];
    const sideBRow = rows[2];
    expect(within(sideARow).getByText("A")).toBeInTheDocument();
    expect(within(sideARow).getByText("2")).toBeInTheDocument();
    expect(within(sideARow).getByText("6")).toBeInTheDocument();
    expect(within(sideARow).getByText("30")).toBeInTheDocument();
    expect(within(sideBRow).getByText("1")).toBeInTheDocument();
    expect(within(sideBRow).getByText("4")).toBeInTheDocument();
    expect(within(sideBRow).getByText("15")).toBeInTheDocument();
  });

  it("renders disc golf hole breakdown including to-par totals", async () => {
    const match = {
      id: "m4",
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
});
