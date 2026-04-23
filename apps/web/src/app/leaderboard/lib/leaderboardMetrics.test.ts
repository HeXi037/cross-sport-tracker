import { describe, expect, it, vi } from "vitest";
import type { Leader } from "../hooks/useLeaderboardData";
import {
  getBowlingMatchesPlayed,
  getMatchesTotal,
  getSortComparableValue,
  getWinPercentage,
  getWinProbabilityAgainstTopPlayer,
  selectTopRatedLeader,
} from "./leaderboardMetrics";

const makeLeader = (overrides: Partial<Leader> = {}): Leader => ({
  rank: 1,
  playerId: "player-1",
  playerName: "Player One",
  ...overrides,
});

describe("leaderboardMetrics", () => {
  it("falls back to highest rated leader when rank #1 has null rating", () => {
    const leaders: Leader[] = [
      makeLeader({ rank: 1, playerId: "p1", rating: null }),
      makeLeader({ rank: 2, playerId: "p2", rating: 1200 }),
      makeLeader({ rank: 3, playerId: "p3", rating: 1100 }),
    ];

    expect(selectTopRatedLeader(leaders)).toEqual({ playerId: "p2", rating: 1200 });
  });

  it("returns null win percentage when a player has zero matches", () => {
    const leader = makeLeader({ setsWon: 0, setsLost: 0 });

    expect(getMatchesTotal(leader)).toBe(0);
    expect(getWinPercentage(leader)).toBeNull();
  });

  it("uses bowling matchesPlayed fallback to sets", () => {
    const leaderWithMatches = makeLeader({ matchesPlayed: 14, sets: 20 });
    const leaderWithSetsOnly = makeLeader({ matchesPlayed: null, sets: 9 });
    const leaderWithoutStats = makeLeader({ matchesPlayed: null, sets: undefined });

    expect(getBowlingMatchesPlayed(leaderWithMatches)).toBe(14);
    expect(getBowlingMatchesPlayed(leaderWithSetsOnly)).toBe(9);
    expect(getBowlingMatchesPlayed(leaderWithoutStats)).toBeNull();
  });

  it("returns null win probability for the top player", () => {
    const computeExpectedWinProbability = vi.fn(() => 0.42);
    const topRatedLeader = { playerId: "p1", rating: 1200 };
    const leader = makeLeader({ playerId: "p1", rating: 1200 });

    expect(
      getWinProbabilityAgainstTopPlayer(
        leader,
        topRatedLeader,
        computeExpectedWinProbability,
      ),
    ).toBeNull();
    expect(computeExpectedWinProbability).not.toHaveBeenCalled();
  });

  it("reuses shared metric derivations for sorting values", () => {
    const leader = makeLeader({
      matchesPlayed: null,
      sets: 8,
      setsWon: 6,
      setsLost: 2,
      sport: "padel",
    });

    expect(
      getSortComparableValue({
        leader,
        column: "matches",
        isBowling: false,
        formatSportName: (value) => String(value),
        getWinProbability: () => null,
      }),
    ).toBe(8);

    expect(
      getSortComparableValue({
        leader,
        column: "matches",
        isBowling: true,
        formatSportName: (value) => String(value),
        getWinProbability: () => null,
      }),
    ).toBe(8);

    expect(
      getSortComparableValue({
        leader,
        column: "winPercent",
        isBowling: false,
        formatSportName: (value) => String(value),
        getWinProbability: () => null,
      }),
    ).toBe(75);
  });
});
