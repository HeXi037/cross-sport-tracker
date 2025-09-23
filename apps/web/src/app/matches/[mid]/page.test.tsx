import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { execSync } from "child_process";

vi.mock("../../../lib/api", () => ({
  apiFetch: vi.fn(),
  apiUrl: (p: string) => p,
}));

import MatchDetailPage from "./page";
import { apiFetch } from "../../../lib/api";

const apiFetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>;

const createResponse = <T,>(data: T) =>
  ({ ok: true, json: async () => data } as Response);

describe("MatchDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders date-only match consistently across time zones", async () => {
    const match = {
      id: "m1",
      sport: "padel",
      rulesetId: null,
      status: "",
      playedAt: "2024-01-01T00:00:00",
      participants: [],
      summary: {},
    };
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/v0/matches/m1") return createResponse(match);
      if (path === "/v0/sports")
        return createResponse([{ id: "padel", name: "Padel" }]);
      if (path === "/v0/rulesets?sport=padel")
        return createResponse([{ id: "padel-world", name: "World Tour" }]);
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    render(await MatchDetailPage({ params: { mid: "m1" } }));

    const displayed = new Date(match.playedAt).toLocaleDateString();
    expect(screen.getByText((t) => t.includes(displayed))).toBeInTheDocument();

    const laDate = execSync(
      "TZ=America/Los_Angeles node -e \"console.log(new Date('2024-01-01T00:00:00').toLocaleDateString())\""
    )
      .toString()
      .trim();
    expect(displayed).toBe(laDate);
  });

  it("renders all participants dynamically", async () => {
    const match = {
      id: "m2",
      sport: "bowling",
      rulesetId: "world-tour",
      status: "Final",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
        { side: "C", playerIds: ["p3"] },
      ],
      summary: {},
    };

    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/v0/matches/m2") return createResponse(match);
      if (path.startsWith("/v0/players/by-ids"))
        return createResponse([
          { id: "p1", name: "Ann" },
          { id: "p2", name: "Ben" },
          { id: "p3", name: "Cam" },
        ]);
      if (path === "/v0/sports")
        return createResponse([{ id: "bowling", name: "Bowling" }]);
      if (path === "/v0/rulesets?sport=bowling")
        return createResponse([
          { id: "world-tour", name: "World Tour" },
        ]);
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    render(await MatchDetailPage({ params: { mid: "m2" } }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Ann vs Ben vs Cam" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Bowling · World Tour · Final")
    ).toBeInTheDocument();
  });
});
