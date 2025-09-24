import { describe, expect, it } from "vitest";
import { summarizeBowlingInput } from "./bowlingSummary";

describe("summarizeBowlingInput", () => {
  it("produces cumulative frame totals for a perfect game", () => {
    const frames: string[][] = Array.from({ length: 9 }, () => ["10", ""]);
    frames.push(["10", "10", "10"]);

    const result = summarizeBowlingInput(frames, { playerLabel: "Test" });

    expect(result.frameScores).toEqual([
      30,
      60,
      90,
      120,
      150,
      180,
      210,
      240,
      270,
      300,
    ]);
    expect(result.total).toBe(300);
  });

  it("accumulates running totals across open and spare frames", () => {
    const frames: string[][] = [
      ["9", "0"],
      ["5", "5"],
      ["3", "4"],
      ["0", "0"],
      ["0", "0"],
      ["0", "0"],
      ["0", "0"],
      ["0", "0"],
      ["0", "0"],
      ["0", "0"],
    ];

    const result = summarizeBowlingInput(frames, { playerLabel: "Test" });

    expect(result.frameScores).toEqual([9, 22, 29, 29, 29, 29, 29, 29, 29, 29]);
    expect(result.total).toBe(29);
  });
});
