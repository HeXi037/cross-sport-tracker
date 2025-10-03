import { describe, expect, it } from "vitest";

import {
  normalizeGameSeries,
  type GameSeriesConfig,
} from "./RecordSportForm";

describe("normalizeGameSeries – pickleball overtime", () => {
  const pickleballConfig: GameSeriesConfig = {
    maxGames: 3,
    gamesNeededOptions: [2],
    invalidSeriesMessage: "Pickleball matches finish when a side wins two games.",
    maxPointsPerGame: 11,
    allowScoresBeyondMax: true,
    requiredWinningMargin: 2,
  };

  it("allows games that extend beyond 11 when the winner leads by two", () => {
    const result = normalizeGameSeries(
      [
        { a: "12", b: "10" },
        { a: "8", b: "11" },
        { a: "15", b: "13" },
      ],
      pickleballConfig,
    );

    expect(result.sets).toEqual([
      [12, 10],
      [8, 11],
      [15, 13],
    ]);
  });

  it("rejects scores beyond 11 that are not won by two", () => {
    expect(() =>
      normalizeGameSeries(
        [
          { a: "12", b: "11" },
          { a: "11", b: "8" },
        ],
        pickleballConfig,
      ),
    ).toThrowError(/won by at least 2 points/);
  });

  it("rejects regulation games that are not won by two", () => {
    expect(() =>
      normalizeGameSeries(
        [
          { a: "11", b: "10" },
          { a: "11", b: "8" },
        ],
        pickleballConfig,
      ),
    ).toThrowError(/won by at least 2 points/);
  });
});
