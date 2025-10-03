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

describe("PlayerPage optional sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockReset();
    notFoundMock.mockReset();
  });

  it("renders headings when data is available", async () => {
    mockedFetchClubs.mockResolvedValue([]);

    mockedApiFetch.mockImplementation(async (path) => {
      switch (path) {
        case "/v0/players/player-rich":
          return makeResponse({
            id: "player-rich",
            name: "Riley Ace",
            badges: [{ id: "badge-1", name: "Club MVP" }],
            social_links: [],
          });
        case "/v0/matches?playerId=player-rich":
          return makeResponse([
            {
              id: "match-1",
              sport: "padel",
              bestOf: 3,
              playedAt: "2024-01-05T10:00:00Z",
              location: "Court A",
              isFriendly: false,
              stageId: null,
            },
          ]);
        case "/v0/matches/match-1":
          return makeResponse({
            participants: [
              { side: "A", playerIds: ["player-rich"] },
              { side: "B", playerIds: ["opponent-1"] },
            ],
            summary: { sets: { A: 2, B: 1 } },
          });
        case "/v0/matches?playerId=player-rich&upcoming=true":
          return makeResponse([
            {
              id: "match-upcoming",
              sport: "padel",
              bestOf: null,
              playedAt: "2099-01-01T12:00:00Z",
              location: "Centre Court",
              isFriendly: true,
              stageId: null,
            },
          ]);
        case "/v0/matches/match-upcoming":
          return makeResponse({
            participants: [
              { side: "A", playerIds: ["player-rich", "teammate-1"] },
              { side: "B", playerIds: ["opponent-2", "opponent-3"] },
            ],
            summary: null,
          });
        case "/v0/players/player-rich/stats":
          return makeResponse({
            playerId: "player-rich",
            matchSummary: { wins: 5, losses: 2 },
            withRecords: [],
          });
        case "/v0/sports":
          return makeResponse([
            { id: "padel", name: "Padel" },
          ]);
        default:
          if (path.startsWith("/v0/players/by-ids")) {
            const idsParam = path.split("ids=")[1] ?? "";
            const ids = idsParam.split(",");
            const directory: Record<string, { id: string; name: string }> = {
              "player-rich": { id: "player-rich", name: "Riley Ace" },
              "opponent-1": { id: "opponent-1", name: "Jordan Foe" },
              "opponent-2": { id: "opponent-2", name: "Sky Rival" },
              "opponent-3": { id: "opponent-3", name: "Lane Foe" },
              "teammate-1": { id: "teammate-1", name: "Alex Ally" },
            };
            return makeResponse(
              ids
                .filter((id) => id in directory)
                .map((id) => directory[id])
            );
          }
          throw new Error(`Unexpected apiFetch call: ${path}`);
      }
    });

    const view = await PlayerPage({
      params: { id: "player-rich" },
      searchParams: {},
    });

    render(view);

    expect(
      screen.getByRole("navigation", { name: "Player timeline navigation" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Matches" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recent Opponents" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Upcoming Matches" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Badges" })
    ).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.includes("Padel"))
    ).toBeInTheDocument();
  });

  it("hides optional headings when data is absent", async () => {
    mockedFetchClubs.mockResolvedValue([]);

    mockedApiFetch.mockImplementation(async (path) => {
      switch (path) {
        case "/v0/players/player-empty":
          return makeResponse({
            id: "player-empty",
            name: "Jamie Blank",
            badges: [],
            social_links: [],
          });
        case "/v0/matches?playerId=player-empty":
          return makeResponse([]);
        case "/v0/matches?playerId=player-empty&upcoming=true":
          return makeResponse([]);
        case "/v0/players/player-empty/stats":
          return makeResponse(null, { status: 204 });
        case "/v0/sports":
          return makeResponse([
            { id: "padel", name: "Padel" },
          ]);
        default:
          if (path.startsWith("/v0/players/by-ids")) {
            return makeResponse([]);
          }
          throw new Error(`Unexpected apiFetch call: ${path}`);
      }
    });

    const view = await PlayerPage({
      params: { id: "player-empty" },
      searchParams: {},
    });

    const { unmount } = render(view);

    expect(
      screen.queryByRole("heading", { name: "Matches" })
    ).not.toBeInTheDocument();
    const guidanceMatcher = (_: string, element?: Element | null) =>
      element?.textContent?.startsWith("No matches yet.") ?? false;
    expect(screen.getByText(guidanceMatcher)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Record a match" }).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByRole("heading", { name: "Recent Opponents" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No recent opponents found.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Upcoming Matches" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No upcoming matches.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Badges" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No badges.")
    ).toBeInTheDocument();

    unmount();

    const summaryView = await PlayerPage({
      params: { id: "player-empty" },
      searchParams: { view: "summary" },
    });

    render(summaryView);

    expect(
      screen.queryByRole("heading", { name: "Season Summary" })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(guidanceMatcher).length).toBeGreaterThanOrEqual(1);
  });
});
