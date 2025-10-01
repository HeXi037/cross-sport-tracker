import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const sessionMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn<boolean, []>(),
  currentUserId: vi.fn<string | null, []>(),
}));

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>(
    "../../../lib/api"
  );
  return {
    ...actual,
    isLoggedIn: sessionMocks.isLoggedIn,
    currentUserId: sessionMocks.currentUserId,
  };
});

import PhotoUpload from "./PhotoUpload";

describe("PhotoUpload", () => {
  beforeEach(() => {
    sessionMocks.isLoggedIn.mockReset();
    sessionMocks.currentUserId.mockReset();
    sessionMocks.isLoggedIn.mockReturnValue(false);
    sessionMocks.currentUserId.mockReturnValue(null);
  });

  it("hides upload controls when not logged in", () => {
    render(<PhotoUpload playerId="player-1" />);

    expect(
      screen.queryByLabelText(/update player photo/i)
    ).not.toBeInTheDocument();
  });

  it("hides upload controls when viewing another player", () => {
    sessionMocks.isLoggedIn.mockReturnValue(true);
    sessionMocks.currentUserId.mockReturnValue("player-2");

    render(<PhotoUpload playerId="player-1" />);

    expect(
      screen.queryByLabelText(/update player photo/i)
    ).not.toBeInTheDocument();
  });

  it("shows upload controls when viewing own profile", () => {
    sessionMocks.isLoggedIn.mockReturnValue(true);
    sessionMocks.currentUserId.mockReturnValue("player-1");

    render(<PhotoUpload playerId="player-1" />);

    expect(
      screen.getByLabelText(/update player photo/i)
    ).toBeInTheDocument();
  });
});
