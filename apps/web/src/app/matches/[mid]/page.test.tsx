import React from "react";
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
      sets: [],
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
});
