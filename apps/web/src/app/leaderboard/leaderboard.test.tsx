import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Leaderboard from "./leaderboard";

describe("Leaderboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches disc_golf when showing all sports", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as any;

    render(<Leaderboard sport="all" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("/api/v0/leaderboards?sport=disc_golf");
  });
});
