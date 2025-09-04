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

describe("MatchDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders date-only match consistently across time zones", async () => {
    const match = {
      id: "m1",
      sport: "padel",
      ruleset: "",
      status: "",
      playedAt: "2024-01-01T00:00:00",
      participants: [],
      summary: {},
    };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => match });

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
      ruleset: "",
      status: "",
      playedAt: null,
      participants: [
        { side: "A", playerIds: ["p1"] },
        { side: "B", playerIds: ["p2"] },
        { side: "C", playerIds: ["p3"] },
      ],
      summary: {},
    };

    apiFetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => match })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "p1", name: "Ann" },
          { id: "p2", name: "Ben" },
          { id: "p3", name: "Cam" },
        ],
      });

    render(await MatchDetailPage({ params: { mid: "m2" } }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Ann vs Ben vs Cam" })
    ).toBeInTheDocument();
  });
});
