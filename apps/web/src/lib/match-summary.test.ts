import { describe, expect, it } from "vitest";

import { shouldRebuildRacketSummary } from "./match-summary";

describe("shouldRebuildRacketSummary", () => {
  it("returns true for empty summary objects", () => {
    expect(shouldRebuildRacketSummary({})).toBe(true);
  });

  it("returns true when only aggregate sets are present", () => {
    expect(
      shouldRebuildRacketSummary({
        sets: { A: 2, B: 1 },
      })
    ).toBe(true);
  });

  it("returns false when set details are already populated", () => {
    expect(
      shouldRebuildRacketSummary({
        sets: { A: 2, B: 1 },
        set_scores: [{ A: 6, B: 4 }],
      })
    ).toBe(false);
  });

  it("returns false when games or points already exist", () => {
    expect(
      shouldRebuildRacketSummary({
        games: { A: 3, B: 4 },
      })
    ).toBe(false);
  });
});
