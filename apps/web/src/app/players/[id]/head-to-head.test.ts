import { describe, expect, it } from "vitest";
import { computeHeadToHead } from "./head-to-head";
import type { EnrichedMatch } from "./types";

const baseMatch = {
  sport: "Tennis",
  bestOf: null,
  playedAt: null,
  location: null,
};

describe("computeHeadToHead", () => {
  it("aggregates wins and losses per opponent and sorts by encounters", () => {
    const matches: EnrichedMatch[] = [
      {
        ...baseMatch,
        id: "m1",
        names: { A: ["Alice"], B: ["Bob"] },
        playerIds: { A: ["1"], B: ["2"] },
        summary: { sets: { A: 2, B: 0 } },
      },
      {
        ...baseMatch,
        id: "m2",
        names: { A: ["Alice"], B: ["Bob"] },
        playerIds: { A: ["1"], B: ["2"] },
        summary: { sets: { A: 0, B: 2 } },
      },
      {
        ...baseMatch,
        id: "m3",
        names: { A: ["Alice"], B: ["Carol"] },
        playerIds: { A: ["1"], B: ["3"] },
        summary: { sets: { A: 2, B: 1 } },
      },
    ];

    const records = computeHeadToHead("1", matches);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      opponentId: "2",
      wins: 1,
      losses: 1,
      encounters: 2,
      winRate: 0.5,
    });
    expect(records[1]).toMatchObject({
      opponentId: "3",
      wins: 1,
      losses: 0,
      encounters: 1,
      winRate: 1,
    });
  });
});
