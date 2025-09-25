import { describe, expect, it } from "vitest";
import { previewBowlingInput, summarizeBowlingInput } from "./bowlingSummary";

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

describe("previewBowlingInput", () => {
  it("computes running totals when future rolls are available", () => {
    const frames: string[][] = [
      ["9", "0"],
      ["10", ""],
      ["7", "2"],
      ["3", "4"],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
    ];

    const preview = previewBowlingInput(frames);

    expect(preview.frameTotals.slice(0, 4)).toEqual([9, 28, 37, 44]);
    expect(preview.total).toBe(44);
  });

  it("returns null for frames that need additional rolls", () => {
    const frames: string[][] = [
      ["10", ""],
      ["7", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
    ];

    const preview = previewBowlingInput(frames);

    expect(preview.frameTotals[0]).toBeNull();
    expect(preview.total).toBeNull();
  });

  it("waits for the final frame bonus before finishing the score", () => {
    const frames: string[][] = Array.from({ length: 9 }, () => ["10", ""]);
    frames.push(["10", "10", ""]);

    const preview = previewBowlingInput(frames);

    expect(preview.frameTotals[9]).toBeNull();

    frames[9][2] = "10";
    const completed = previewBowlingInput(frames);

    expect(completed.frameTotals[9]).toBe(300);
    expect(completed.total).toBe(300);
  });
});
