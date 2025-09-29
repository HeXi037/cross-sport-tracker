import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import MatchesPage from "./page";

type MockMatch = {
  id: string;
  sport: string;
  stageId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  isFriendly: boolean;
  participants: Array<{
    id: string;
    side: string;
    playerIds: string[];
    players: Array<{ id: string; name: string }>;
  }>;
  summary?: {
    set_scores?: Array<Record<string, number>>;
    points?: Record<string, number>;
  } | null;
};

function createMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    id: "m1",
    sport: "padel",
    stageId: null,
    bestOf: 3,
    playedAt: null,
    location: null,
    isFriendly: false,
    participants: [
      {
        id: "p1",
        side: "A",
        playerIds: ["1"],
        players: [{ id: "1", name: "Alice" }],
      },
      {
        id: "p2",
        side: "B",
        playerIds: ["2"],
        players: [{ id: "2", name: "Bob" }],
      },
    ],
    summary: null,
    ...overrides,
  };
}

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
  cookies: () => ({ get: () => undefined }),
}));

const originalFetch = global.fetch;

describe("MatchesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("renders player names and summary from the list response", async () => {
    const matches = [
      createMatch({
        summary: {
          set_scores: [
            { A: 6, B: 4 },
            { A: 7, B: 5 },
          ],
          points: { A: 11, B: 7 },
        },
      }),
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "X-Has-More": "false" }),
        json: async () => matches,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    const listItem = await screen.findByRole("listitem");
    expect(within(listItem).getByText("Alice")).toBeInTheDocument();
    expect(within(listItem).getByText("Bob")).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.includes("6-4, 7-5"))
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v0/matches?limit=25&offset=0"),
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("disables pagination buttons when at bounds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "X-Has-More": "false" }),
        json: async () => [createMatch()],
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    const prev = screen.getByText("Previous") as HTMLButtonElement;
    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
    expect(screen.getByText("Page 1 · Showing matches 1-1")).toBeInTheDocument();
  });

  it("renders an empty state when there are no matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "X-Has-More": "false" }),
        json: async () => [],
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    expect(await screen.findByText("No matches yet.")).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits placeholder glyphs from match metadata", async () => {
    const matches: MockMatch[] = [
      createMatch({
        id: "m1",
        location: "Madrid",
        playedAt: "2024-02-02T00:00:00Z",
      }),
      createMatch({
        id: "m2",
        sport: "tennis",
        bestOf: 5,
      }),
      createMatch({
        id: "m3",
        isFriendly: true,
        location: "",
        summary: null,
      }),
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "X-Has-More": "false" }),
        json: async () => matches,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

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
    const matches = [createMatch({ id: "m1" }), createMatch({ id: "m2" })];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          "X-Has-More": "false",
          "X-Next-Offset": "4",
        }),
        json: async () => matches,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const page = await MatchesPage({ searchParams: { limit: "2" } });
    render(page);

    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(next).toBeDisabled();
    expect(screen.getByText("Page 1 · Showing matches 1-2")).toBeInTheDocument();
  });
});
