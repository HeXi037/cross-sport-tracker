import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
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

vi.mock("next/headers", () => ({
  headers: () => ({
    get: () => undefined,
  }),
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
      summary: {
        set_scores: [
          { A: 6, B: 4 },
          { A: 7, B: 5 },
        ],
        points: { A: 11, B: 7 },
      },
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

    const matchItem = await screen.findByRole("listitem");
    expect(within(matchItem).getByText("Alice")).toBeInTheDocument();
    expect(within(matchItem).getByText("Bob")).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.includes("6-4, 7-5"))
    ).toBeInTheDocument();
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
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "X-Has-More": "false" }),
        json: async () => matches,
      })
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
    expect(
      screen.getByText("Page 1 · Showing matches 1-1")
    ).toBeInTheDocument();
  });

  it("renders an empty state when there are no matches", async () => {
    const fetchMock = vi
      .fn()
      // list matches
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "X-Has-More": "false" }),
        json: async () => [],
      });

    global.fetch = fetchMock as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    expect(await screen.findByText("No matches yet.")).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits placeholder glyphs from match metadata", async () => {
    const matches = [
      {
        id: "m1",
        sport: "padel",
        bestOf: null,
        playedAt: "2024-02-02T00:00:00Z",
        location: "Madrid",
      },
      {
        id: "m2",
        sport: "tennis",
        bestOf: 5,
        playedAt: null,
        location: "Melbourne",
      },
      {
        id: "m3",
        sport: "squash",
        bestOf: 3,
        playedAt: "2024-06-15T00:00:00Z",
        location: "",
        isFriendly: true,
      },
    ];

    const detail = {
      participants: [
        { side: "A" as const, playerIds: ["1"] },
        { side: "B" as const, playerIds: ["2"] },
      ],
    };

    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ];

    const fetchMock = vi
      .fn()
      // list matches
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "X-Has-More": "false" }),
        json: async () => matches,
      })
      // match detail for each entry
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      // players by ids
      .mockResolvedValueOnce({ ok: true, json: async () => players });

    global.fetch = fetchMock as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    const { container } = render(page);

    const metadataElements = container.querySelectorAll(".match-meta");
    expect(metadataElements).toHaveLength(matches.length);

    const metadataTexts = Array.from(metadataElements).map(
      (element) => element.textContent ?? ""
    );

    for (const text of metadataTexts) {
      expect(text).not.toContain("—");
      expect(text).not.toContain("Best of —");
      expect(text.trim().length).toBeGreaterThan(0);
    }

    expect(metadataTexts.some((text) => text.includes("padel"))).toBe(true);
    expect(metadataTexts.some((text) => text.includes("Best of 5"))).toBe(true);
    expect(metadataTexts.some((text) => text.includes("Friendly"))).toBe(true);
  });

  it("disables the next button when the API reports no more results", async () => {
    const matches = [
      {
        id: "m1",
        sport: "padel",
        bestOf: 3,
        playedAt: null,
        location: null,
      },
      {
        id: "m2",
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
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          "X-Has-More": "false",
          "X-Next-Offset": "4",
        }),
        json: async () => matches,
      })
      // match detail for each entry
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      // players by ids
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    global.fetch = fetchMock as typeof fetch;

    const page = await MatchesPage({ searchParams: { limit: "2" } });
    render(page);

    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(next).toBeDisabled();
    expect(
      screen.getByText("Page 1 · Showing matches 1-2")
    ).toBeInTheDocument();
  });
});
