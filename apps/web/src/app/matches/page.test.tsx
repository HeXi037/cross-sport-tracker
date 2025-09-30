import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import MatchesPage from "./page";
import enMessages from "../../messages/en-GB.json";

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

const defaultSportsCatalog = [
  { id: "padel", name: "Padel" },
  { id: "tennis", name: "Tennis" },
];

const pushMock = vi.fn();

function setupFetchMock(
  matches: MockMatch[],
  options: {
    headers?: HeadersInit;
    sports?: Array<{ id: string; name: string }>;
    matchStatus?: number;
  } = {},
) {
  const { headers, sports = defaultSportsCatalog, matchStatus = 200 } = options;
  const matchesHeaders = new Headers({ "X-Has-More": "false", ...headers });
  const matchesResponse = {
    ok: matchStatus >= 200 && matchStatus < 300,
    status: matchStatus,
    headers: matchesHeaders,
    json: async () => matches,
  } as Response;
  const sportsResponse = {
    ok: true,
    headers: new Headers(),
    json: async () => sports,
  } as Response;

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/v0/matches")) {
      return matchesResponse;
    }
    if (url.includes("/v0/sports")) {
      return sportsResponse;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("next/headers", () => ({
  headers: () => ({
    get: () => undefined,
  }),
  cookies: () => ({ get: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespaceOrOptions?: unknown) => {
    const namespace =
      typeof namespaceOrOptions === "string"
        ? namespaceOrOptions
        : typeof namespaceOrOptions === "object" && namespaceOrOptions && "namespace" in namespaceOrOptions
          ? (namespaceOrOptions as { namespace?: string }).namespace ?? ""
          : "";
    return (key: string, values?: Record<string, unknown>) => {
      const fullKey = [namespace, key].filter(Boolean).join(".");
      const template = fullKey
        .split(".")
        .reduce<unknown>((acc, segment) => (acc as Record<string, unknown>)?.[segment], enMessages);
      if (typeof template !== "string") {
        throw new Error(`Missing translation for ${fullKey}`);
      }
      return template.replace(/\{(\w+)\}/g, (_, token) => {
        if (values && token in values) {
          return String(values[token]);
        }
        return `{${token}}`;
      });
    };
  }),
}));

const originalFetch = global.fetch;

describe("MatchesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    pushMock.mockReset();
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

    const fetchMock = setupFetchMock(matches);

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    const listItem = await screen.findByRole("listitem");
    expect(within(listItem).getByText("Alice")).toBeInTheDocument();
    expect(within(listItem).getByText("Bob")).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.includes("6-4, 7-5"))
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v0/matches?limit=25&offset=0"),
      expect.objectContaining({
        next: expect.objectContaining({ revalidate: 60 }),
      })
    );
  });

  it("disables pagination buttons when at bounds", async () => {
    const fetchMock = setupFetchMock([createMatch()]);

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    const prev = screen.getByText("Previous") as HTMLButtonElement;
    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
    expect(screen.getByText("Page 1 · Showing matches 1-1")).toBeInTheDocument();
  });

  it("renders an empty state when there are no matches", async () => {
    const fetchMock = setupFetchMock([]);

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    expect(await screen.findByText("No matches yet.")).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

    const fetchMock = setupFetchMock(matches);

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

    expect(metadataTexts.some((text) => text.includes("Padel"))).toBe(true);
    expect(metadataTexts.some((text) => text.includes("Best of 5"))).toBe(true);
    expect(metadataTexts.some((text) => text.includes("Friendly"))).toBe(true);
  });

  it("disables the next button when the API reports no more results", async () => {
    const matches = [createMatch({ id: "m1" }), createMatch({ id: "m2" })];

    const fetchMock = setupFetchMock(matches, {
      headers: {
        "X-Has-More": "false",
        "X-Next-Offset": "4",
      },
    });

    const page = await MatchesPage({ searchParams: { limit: "2" } });
    render(page);

    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(next).toBeDisabled();
    expect(screen.getByText("Page 1 · Showing matches 1-2")).toBeInTheDocument();
  });

  it("enables the next button and uses header offsets when more results are reported", async () => {
    const matches = [createMatch({ id: "m1" })];

    const fetchMock = setupFetchMock(matches, {
      headers: {
        "X-Has-More": "true",
        "X-Next-Offset": "10",
      },
    });

    const page = await MatchesPage({ searchParams: { limit: "2", offset: "0" } });
    render(page);

    const next = screen.getByText("Next") as HTMLButtonElement;
    expect(next).not.toBeDisabled();

    fireEvent.click(next);

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=2&offset=10")
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v0/sports"),
      expect.objectContaining({
        next: expect.objectContaining({ revalidate: 300 }),
      })
    );
  });
});
