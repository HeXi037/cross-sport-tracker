import React from "react";
import { render, screen } from "@testing-library/react";
import MatchesPage from "./page";
import "@testing-library/jest-dom";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    await screen.findByText("Alice vs Bob");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const listUrl = fetchMock.mock.calls[0][0] as string;
    expect(listUrl).toContain("/v0/matches?limit=25&offset=0");
    const url = fetchMock.mock.calls[2][0] as string;
    expect(url).toContain("/players/by-ids?ids=1,2");
  });

  it("disables pagination buttons when at bounds", async () => {
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
    };
    const fetchMock = vi
      .fn()
      // list matches
      .mockResolvedValueOnce({ ok: true, json: async () => matches })
      // match detail
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      // players by ids
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    // @ts-expect-error override for test
    global.fetch = fetchMock;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    const prev = screen.getByText("Previous") as HTMLButtonElement;
    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
  });
});
