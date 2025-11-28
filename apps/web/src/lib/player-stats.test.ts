import { describe, expect, it } from "vitest";
import {
  formatMatchRecord,
  normalizeMatchSummary,
  normalizeVersusRecords,
} from "./player-stats";

describe("normalizeMatchSummary", () => {
  it("returns a sanitized summary when data is valid", () => {
    const summary = normalizeMatchSummary({
      wins: 5,
      losses: 3,
      draws: 1,
      total: 9,
      winPct: 0.5555,
    });
    expect(summary).toEqual({
      wins: 5,
      losses: 3,
      draws: 1,
      total: 9,
      winPct: 0.5555,
      streak: null,
      lastPlayedAt: null,
    });
  });

  it("returns null when totals are inconsistent", () => {
    expect(
      normalizeMatchSummary({
        wins: 2,
        losses: 2,
        draws: 1,
        total: 2,
        winPct: 0.5,
      })
    ).toBeNull();
  });

  it("returns null for negative totals", () => {
    expect(
      normalizeMatchSummary({
        wins: 0,
        losses: 0,
        draws: 0,
        total: -1,
        winPct: 0,
      })
    ).toBeNull();
  });

  it("returns a zeroed summary when there are no matches", () => {
    expect(
      normalizeMatchSummary({
        wins: 0,
        losses: 0,
        draws: 0,
        total: 0,
        winPct: 0,
      })
    ).toEqual({
      wins: 0,
      losses: 0,
      draws: 0,
      total: 0,
      winPct: 0,
      streak: null,
      lastPlayedAt: null,
    });
  });

  it("returns null when a zero total includes wins or losses", () => {
    expect(
      normalizeMatchSummary({
        wins: 1,
        losses: 0,
        draws: 0,
        total: 0,
        winPct: 1,
      })
    ).toBeNull();
  });
});

describe("formatMatchRecord", () => {
  it("formats wins, losses and draws into a readable string", () => {
    const summary = normalizeMatchSummary({
      wins: 7,
      losses: 2,
      draws: 1,
      total: 10,
      winPct: 0.7,
    });
    expect(summary).not.toBeNull();
    expect(formatMatchRecord(summary!)).toBe("7-2-1 (70%)");
  });
});

describe("normalizeVersusRecords", () => {
  it("filters out invalid records and clamps percentages", () => {
    const records = normalizeVersusRecords([
      {
        playerId: "1",
        playerName: "Valid",
        wins: 4,
        losses: 2,
        winPct: 1.4,
      },
      {
        playerId: "2",
        playerName: "",
        wins: -1,
        losses: 3,
        winPct: 0.25,
      },
      null,
    ]);
    expect(records).toEqual([
      {
        playerId: "1",
        playerName: "Valid",
        wins: 4,
        losses: 2,
        winPct: 1,
        chemistry: null,
      },
    ]);
  });

  it("coerces numeric identifiers and stringified metrics", () => {
    const records = normalizeVersusRecords([
      {
        playerId: 42,
        playerName: "Jordan",
        wins: "6",
        losses: "4",
        winPct: "0.6",
        total: "10",
      },
    ]);
    expect(records).toEqual([
      {
        playerId: "42",
        playerName: "Jordan",
        wins: 6,
        losses: 4,
        winPct: 0.6,
        total: 10,
        chemistry: null,
      },
    ]);
  });
});
