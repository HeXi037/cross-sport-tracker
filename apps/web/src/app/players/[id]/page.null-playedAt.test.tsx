import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(),
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>(
    "next/navigation"
  );
  return {
    ...actual,
    useRouter: () => ({
      refresh: refreshMock,
    }),
    notFound: notFoundMock,
  };
});

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (key: string) =>
      key.toLowerCase() === "accept-language" ? "en-GB" : null,
  }),
  cookies: () => ({ get: () => undefined }),
}));

vi.mock("./PlayerCharts", () => ({
  default: () => <div data-testid="player-charts" />,
}));

vi.mock("./comments-client", () => ({
  default: () => <div data-testid="player-comments" />,
}));

vi.mock("./PhotoUpload", () => ({
  default: () => <div data-testid="photo-upload" />,
}));

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>(
    "../../../lib/api"
  );
  return {
    ...actual,
    apiFetch: vi.fn(),
    fetchClubs: vi.fn(),
  };
});

import PlayerPage from "./page";
import { apiFetch, fetchClubs } from "../../../lib/api";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedFetchClubs = vi.mocked(fetchClubs);

const makeResponse = <T,>(
  data: T,
  init: { status?: number } = {}
): Response => {
  const status = init.status ?? 200;
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone() {
      return makeResponse(data, init);
    },
  } as unknown as Response;
};

describe("PlayerPage matches without playedAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockReset();
    notFoundMock.mockReset();
  });

  it("renders timeline entries for matches missing a playedAt date", async () => {
    mockedFetchClubs.mockResolvedValue([]);

    mockedApiFetch.mockImplementation(async (path) => {
      if (path === "/v0/players/player-null-date") {
        return makeResponse({
          id: "player-null-date",
          name: "Pat Jones",
          badges: [],
          social_links: [],
        });
      }

      if (path === "/v0/matches?playerId=player-null-date") {
        return makeResponse([
          {
            id: "match-without-date",
            sport: "tennis",
            bestOf: 3,
            playedAt: null,
            location: "Court A",
            isFriendly: false,
            stageId: null,
          },
        ]);
      }

      if (path === "/v0/matches/match-without-date") {
        return makeResponse({
          participants: [
            { side: "A", playerIds: ["player-null-date"] },
            { side: "B", playerIds: ["opponent-1"] },
          ],
          summary: null,
        });
      }

      if (path.startsWith("/v0/players/by-ids")) {
        return makeResponse([
          { id: "player-null-date", name: "Pat Jones" },
          { id: "opponent-1", name: "Taylor Opponent" },
        ]);
      }

      if (path === "/v0/players/player-null-date/stats") {
        return makeResponse(null, { status: 204 });
      }

      if (path === "/v0/matches?playerId=player-null-date&upcoming=true") {
        return makeResponse([]);
      }

      if (path === "/v0/sports") {
        return makeResponse([
          { id: "tennis", name: "Tennis" },
        ]);
      }

      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const view = await PlayerPage({
      params: { id: "player-null-date" },
      searchParams: {},
    });

    render(view);

    expect(
      screen.getByRole("heading", { name: /pat jones/i })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: /pat jones\s+versus\s+taylor opponent/i,
      })
    ).toBeInTheDocument();

    const timelineDetails = screen.getByText((content, element) => {
      return (
        element instanceof HTMLElement &&
        element.className.includes("text-sm") &&
        content.includes("Court A")
      );
    });

    expect(timelineDetails.textContent).toContain("—");
  });
});
