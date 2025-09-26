import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const useMatchStreamMock = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/useMatchStream", () => ({
  useMatchStream: useMatchStreamMock,
}));

vi.mock("./MatchScoreboard", () => ({
  __esModule: true,
  default: () => <div data-testid="match-scoreboard" />,
}));

import LiveSummary from "./live-summary";

describe("LiveSummary", () => {
  beforeEach(() => {
    useMatchStreamMock.mockReturnValue({
      event: null,
      connected: true,
      fallback: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows fallback messaging when realtime connection is unavailable", () => {
    useMatchStreamMock.mockReturnValue({
      event: null,
      connected: false,
      fallback: true,
    });

    render(
      <LiveSummary
        mid="match-1"
        sport="padel"
        status="In Progress"
        statusCode="in_progress"
        initialSummary={{}}
        initialEvents={[]}
      />
    );

    expect(screen.getByText("Live updates unavailable")).toBeInTheDocument();
    expect(screen.getByText("Live updates unavailable.")).toBeInTheDocument();
  });

  it("omits fallback messaging when live updates are active", () => {
    useMatchStreamMock.mockReturnValue({
      event: null,
      connected: true,
      fallback: false,
    });

    render(
      <LiveSummary
        mid="match-2"
        sport="padel"
        status="In Progress"
        statusCode="in_progress"
        initialSummary={{}}
        initialEvents={[]}
      />
    );

    expect(
      screen.queryByText("Live updates unavailable.")
    ).not.toBeInTheDocument();
  });
});
