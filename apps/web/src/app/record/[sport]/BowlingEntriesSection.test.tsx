import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

import type { BowlingEntry } from "../../../lib/bowlingSummary";
import { BowlingEntriesSection } from "./BowlingEntriesSection";
import { BOWLING_FRAME_COUNT } from "./bowlingConfig";

function createFrames(): BowlingEntry["frames"] {
  return Array.from({ length: BOWLING_FRAME_COUNT }, (_, index) =>
    index === BOWLING_FRAME_COUNT - 1 ? ["", "", ""] : ["", ""],
  );
}

function renderComponent(overrides: Partial<React.ComponentProps<typeof BowlingEntriesSection>> = {}) {
  const registerSpy = vi.fn();

  const props: React.ComponentProps<typeof BowlingEntriesSection> = {
    bowlingEntries: [{ playerId: "", frames: createFrames() }],
    bowlingValidationErrors: [null],
    bowlingFieldErrors: [null],
    bowlingTouchedEntries: [false],
    hasAttemptedSubmit: false,
    players: [{ id: "p1", name: "Player One" }],
    sportCopy: {},
    bowlingRollPlaceholder: "0-10",
    bowlingMaxReached: false,
    bowlingMaxHintId: "max-hint",
    disabled: false,
    registerBowlingInput: (key) => (element) => registerSpy(key, element),
    previewBowlingInput: () => ({ total: 0, frameTotals: Array(BOWLING_FRAME_COUNT).fill(0) }),
    getBowlingPlayerLabel: () => "Player One",
    getBowlingFramePinSum: () => 0,
    getBowlingInputKey: (entryIndex, frameIndex, rollIndex) =>
      `${entryIndex}-${frameIndex}-${rollIndex}`,
    isBowlingRollEnabled: () => true,
    handleBowlingPlayerChange: vi.fn(),
    handleRemoveBowlingPlayer: vi.fn(),
    handleBowlingRollChange: vi.fn(),
    handleBowlingRollBlur: vi.fn(),
    handleBowlingInputKeyDown: vi.fn(),
    handleAddBowlingPlayer: vi.fn(),
    ...overrides,
  };

  const view = render(<BowlingEntriesSection {...props} />);
  return { registerSpy, props, view };
}

describe("BowlingEntriesSection", () => {
  it("respects the disabled state for anonymous users", () => {
    renderComponent({ disabled: true });

    expect(screen.getByRole("group", { name: /Players and scores/i })).toBeDisabled();
  });

  it("surfaces validation messages when submission was attempted", () => {
    renderComponent({ hasAttemptedSubmit: true, bowlingValidationErrors: ["Enter pins"] });

    expect(screen.getByText("Enter pins")).toBeInTheDocument();
  });

  it("provides strike shortcuts for enabled rolls", () => {
    const { props } = renderComponent();

    const strikeButton = screen.getByRole("button", { name: /Set to strike/ });
    fireEvent.click(strikeButton);

    expect(props.handleBowlingRollChange).toHaveBeenCalledWith(0, 0, 0, "10");
  });
});
