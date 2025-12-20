import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("../../../components/charts/WinRateChart", () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="win-rate">{JSON.stringify(data)}</div>
  ),
}));

vi.mock("../../../components/charts/RankingHistoryChart", () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="ranking-history">{JSON.stringify(data)}</div>
  ),
}));

vi.mock("../../../components/charts/MatchHeatmap", () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="heatmap">{JSON.stringify(data)}</div>
  ),
}));

const useLocaleMock = vi.fn(() => "en-AU");
const useTimeZoneMock = vi.fn(() => "Australia/Melbourne");

vi.mock("../../../lib/LocaleContext", () => ({
  useLocale: () => useLocaleMock(),
  useTimeZone: () => useTimeZoneMock(),
}));

import PlayerCharts from "./PlayerCharts";

async function readJson<T>(testId: string): Promise<T> {
  const element = await screen.findByTestId(testId);
  const raw = element.textContent ?? "null";
  return JSON.parse(raw) as T;
}

describe("PlayerCharts", () => {
  it("handles matches with invalid playedAt values", async () => {
    const matches = [
      {
        id: "m1",
        sport: "padel",
        bestOf: null,
        playedAt: "not-a-date",
        location: null,
        players: {},
        participants: [],
        summary: undefined,
        playerSide: null,
        playerWon: true,
      },
      {
        id: "m2",
        sport: "padel",
        bestOf: null,
        playedAt: "2024-01-01T00:00:00Z",
        location: null,
        players: {},
        participants: [],
        summary: undefined,
        playerSide: null,
        playerWon: false,
      },
    ];

    render(
      <PlayerCharts
        matches={matches}
        rollingWinPct={[0.5, 0.25]}
        ratingHistory={{ values: [1200, 1180], label: "Padel Elo" }}
      />,
    );

    const winRate = await readJson<Array<{ date: string; winRate: number }>>("win-rate");
    expect(winRate).toHaveLength(2);
    expect(winRate[0].date).toBe("Match 1");
    expect(winRate[1].date).toBe("1/1/24");
    expect(winRate[0].winRate).toBeCloseTo(0.5);
    expect(winRate[1].winRate).toBeCloseTo(0.25);

    const ranking = await readJson<Array<{ date: string; rank: number }>>(
      "ranking-history",
    );
    expect(ranking).toHaveLength(2);
    expect(ranking[0].date).toBe("Padel Elo 1");
    expect(ranking[1].date).toBe("Padel Elo 2");
    expect(ranking[0].rank).toBe(1);
    expect(ranking[1].rank).toBe(21);

    const heatmap = await readJson<Array<{ x: number; y: number; v: number }>>(
      "heatmap",
    );
    expect(heatmap).toHaveLength(1);
    expect(Number.isFinite(heatmap[0].x)).toBe(true);
    expect(Number.isFinite(heatmap[0].y)).toBe(true);
    expect(heatmap[0].v).toBe(1);
  });
});
