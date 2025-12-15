import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

import { PlayerSelectors } from "./PlayerSelectors";

const baseIdState = { a1: "", a2: "", b1: "", b2: "" };

function renderComponent(overrides: Partial<React.ComponentProps<typeof PlayerSelectors>> = {}) {
  const props: React.ComponentProps<typeof PlayerSelectors> = {
    sportCopy: {},
    isAnonymous: false,
    playerPreferences: { lastSelection: baseIdState },
    handleApplyLastMatch: vi.fn(),
    selectedPairingKey: "",
    setSelectedPairingKey: vi.fn(),
    favouritePairingOptions: [{ key: "a", label: "Pairing A", count: 1 }],
    handleApplyPairing: vi.fn(),
    handleSwapTeams: vi.fn(),
    handleRotatePositions: vi.fn(),
    playerSearch: baseIdState,
    handlePlayerSearchChange: vi.fn(),
    ids: baseIdState,
    handleIdChange: vi.fn(),
    duplicateHintActive: false,
    duplicateHintId: "duplicate-hint",
    isDuplicateSelection: () => false,
    filteredPlayerOptions: () => ({
      meOption: [],
      recentOptions: [],
      remaining: [
        { id: "p1", name: "Player One" },
        { id: "p2", name: "Player Two" },
      ],
    }),
    doubles: true,
    isPadel: true,
    duplicatePlayerNames: [],
    duplicatePlayersHintId: "duplicate-names",
    ...overrides,
  };

  render(<PlayerSelectors {...props} />);
  return props;
}

describe("PlayerSelectors", () => {
  it("enables applying favourite pairings when a value is chosen", () => {
    const props = renderComponent({ selectedPairingKey: "a" });

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(props.handleApplyPairing).toHaveBeenCalled();
  });

  it("surfaces duplicate name errors", () => {
    renderComponent({ duplicatePlayerNames: ["Alex", "Jamie"] });

    expect(
      screen.getByText(/Duplicate player names returned: Alex, Jamie/i),
    ).toBeInTheDocument();
  });
});
