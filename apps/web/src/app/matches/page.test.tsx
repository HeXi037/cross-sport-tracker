import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import MatchesPage from "./page";
import "@testing-library/jest-dom";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
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
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ];

    const fetchMock = vi
      .fn()
      // list matches
      .mockResolvedValueOnce({ ok: true, json: async () => matches })
      // match detail
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      // players by ids
      .mockResolvedValueOnce({ ok: true, json: async () => players });

    global.fetch = fetchMock as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    await screen.findByText((_, el) => el?.textContent === "Alice vs Bob");
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
    global.fetch = fetchMock as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    const prev = screen.getByText("Previous") as HTMLButtonElement;
    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
  });

  it("renders an empty state when there are no matches", async () => {
    const fetchMock = vi
      .fn()
      // list matches
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    global.fetch = fetchMock as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    expect(await screen.findByText("No matches yet.")).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
