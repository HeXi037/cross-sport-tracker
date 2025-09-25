import { describe, expect, it } from "vitest";
import { getRecordSportHelpText } from "./recording";

describe("getRecordSportHelpText", () => {
  it("returns the Australian English copy when requested", () => {
    expect(getRecordSportHelpText("bowling", "en-AU")).toBe(
      "Enter each roll for every frame. Use 0 for gutter balls, leave roll 2 blank after a strike, and only fill roll 3 in the tenth frame once you've earned it.",
    );
  });

  it("falls back to general English when the region is unsupported", () => {
    expect(getRecordSportHelpText("padel", "en-GB")).toBe(
      "Record games won for each set and toggle Doubles when two players per side are on the court.",
    );
  });

  it("returns null when the sport has no help text", () => {
    expect(getRecordSportHelpText("disc_golf", "en-AU")).toBeNull();
  });
});
