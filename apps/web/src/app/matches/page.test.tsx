import React from "react";
import { render, screen } from "@testing-library/react";
import MatchesPage from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("MatchesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches player names in a single request", async () => {
    const matches = [
      {
        id: "m1",
        sport: "padel",
        bestOf: 3,
        playedAt: null,
        location: null,
      },
    ];
    const detail = {
      participants: [
        { side: "A" as const, playerIds: ["1"] },
        { side: "B" as const, playerIds: ["2"] },
      ],
      summary: { points: { A: 11, B: 7 } },
    };
    const players = [
      { playerId: "1", playerName: "Alice" },
      { playerId: "2", playerName: "Bob" },
    ];

    const fetchMock = vi
      .fn()
      // list matches
      .mockResolvedValueOnce({ ok: true, json: async () => matches })
      // match detail
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      // players by ids
      .mockResolvedValueOnce({ ok: true, json: async () => players });

    // @ts-expect-error override for test
    global.fetch = fetchMock;

    const page = await MatchesPage();
    render(page);

    await screen.findByText("Alice vs Bob");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const url = fetchMock.mock.calls[2][0] as string;
    expect(url).toContain("/players/by-ids?ids=1,2");
  });
});
