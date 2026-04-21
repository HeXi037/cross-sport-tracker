import { render, waitFor, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { act, type ComponentProps } from "react";
import Leaderboard from "./leaderboard";
import * as api from "../../lib/api";
import { USER_SETTINGS_STORAGE_KEY } from "../user-settings";
import { PREVIOUS_ROUTE_STORAGE_KEY } from "../../lib/navigation-history";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en-GB.json";

const mockIntersectionObservers: MockIntersectionObserver[] = [];

type SortTestLeader = {
  rank: number;
  playerId: string;
  playerName: string;
  rating: number;
  setsWon: number;
  setsLost: number;
};


class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  elements = new Set<Element>();
  observe = vi.fn((element: Element) => {
    this.elements.add(element);
  });
  unobserve = vi.fn((element: Element) => {
    this.elements.delete(element);
  });
  disconnect = vi.fn(() => {
    this.elements.clear();
  });

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    mockIntersectionObservers.push(this);
  }

  trigger(isIntersecting = true) {
    const entries = Array.from(this.elements).map((element) =>
      ({
        isIntersecting,
        target: element,
        intersectionRatio: isIntersecting ? 1 : 0,
        time: 0,
        boundingClientRect: element.getBoundingClientRect(),
        intersectionRect: element.getBoundingClientRect(),
        rootBounds: null,
      }) as IntersectionObserverEntry,
    );
    if (entries.length === 0) {
      const dummy = document.createElement("div");
      entries.push(
        ({
          isIntersecting,
          target: dummy,
          intersectionRatio: isIntersecting ? 1 : 0,
          time: 0,
          boundingClientRect: dummy.getBoundingClientRect(),
          intersectionRect: dummy.getBoundingClientRect(),
          rootBounds: null,
        }) as IntersectionObserverEntry,
      );
    }
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

const replaceMock = vi.fn();
let mockPathname = "/leaderboard";
let mockSearchParams = new URLSearchParams();
const updateMockLocation = (href: string) => {
  const url = new URL(href, "https://example.test");
  mockPathname = url.pathname;
  mockSearchParams = new URLSearchParams(url.search);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

describe("Leaderboard", () => {
  let fetchClubsSpy: vi.SpiedFunction<typeof api.fetchClubs>;

  const renderLeaderboard = async (
    props: ComponentProps<typeof Leaderboard>,
  ) => {
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <NextIntlClientProvider locale="en-GB" messages={enMessages}>
          <Leaderboard {...props} />
        </NextIntlClientProvider>,
      );
    });
    // render is always assigned within act
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return view!;
  };

  beforeEach(() => {
    mockIntersectionObservers.length = 0;
    // @ts-expect-error - assign test mock
    global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    updateMockLocation("/leaderboard");
    replaceMock.mockReset();
    replaceMock.mockImplementation((nextHref: string) => {
      updateMockLocation(nextHref);
      return undefined;
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    fetchClubsSpy = vi.spyOn(api, "fetchClubs").mockResolvedValue([
      { id: "club-123", name: "Club 123" },
      { id: "club-a", name: "Club A" },
    ]);
  });

  afterEach(() => {
    // @ts-expect-error - cleanup IntersectionObserver mock
    delete global.IntersectionObserver;
    mockIntersectionObservers.length = 0;
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // @ts-expect-error - cleanup mocked fetch between tests
    global.fetch = undefined;
  });

  it("fetches disc_golf when showing all sports", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "all" });

    expect(
      screen.getByRole("heading", { level: 1, name: "All Sports Leaderboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "All Sports" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Disc Golf" })).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    const discGolfRequest = urls.find((url) => url.includes("sport=disc_golf"));
    expect(discGolfRequest).toBeDefined();
    const params = new URL(discGolfRequest as string, "https://example.test").searchParams;
    expect(params.get("sport")).toBe("disc_golf");
    expect(params.get("limit")).toBe("50");
    expect(params.get("offset")).toBe("0");
  });

  it("keeps the tab navigation scrollable without a dropdown on wide viewports", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "padel" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const tablist = screen.getByRole("tablist");
    Object.defineProperty(tablist, "clientWidth", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(tablist, "scrollWidth", {
      configurable: true,
      value: 600,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("combobox", { name: /more sports/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("switches sports with a single tap and updates the heading", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    const view = await renderLeaderboard({ sport: "padel" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    replaceMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Disc Golf" }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard/?sport=disc_golf",
        { scroll: false },
      ),
    );

    updateMockLocation("/leaderboard/?sport=disc_golf");
    view.rerender(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <Leaderboard sport="disc_golf" />
      </NextIntlClientProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Disc Golf Leaderboard",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Disc Golf" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("retains country and club filters when switching sports tabs", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard?sport=padel&country=SE&clubId=club-123");

    const view = await renderLeaderboard({
      sport: "padel",
      country: "SE",
      clubId: "club-123",
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    replaceMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Disc Golf" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    const [nextHref] = replaceMock.mock.calls[0] ?? [];
    const url = new URL(nextHref as string, "https://example.test");
    expect(url.pathname).toBe("/leaderboard/");
    expect(url.searchParams.get("sport")).toBe("disc_golf");
    expect(url.searchParams.get("country")).toBe("SE");
    expect(url.searchParams.get("clubId")).toBe("club-123");

    updateMockLocation("/leaderboard?sport=disc_golf&country=SE&clubId=club-123");
    view.rerender(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <Leaderboard sport="disc_golf" country="SE" clubId="club-123" />
      </NextIntlClientProvider>,
    );

    const countrySelect = await screen.findByRole("combobox", { name: "Country" });
    const clubSelect = await screen.findByRole("combobox", { name: "Club" });
    expect(countrySelect).toHaveValue("Sweden");
    expect(clubSelect).toHaveValue("club-123");
  });

  it("renders the leaderboard table inside a scrollable wrapper while loading", async () => {
    const pendingFetch = new Promise<Response>(() => {});
    global.fetch = vi.fn().mockReturnValue(pendingFetch) as unknown as typeof fetch;

    await renderLeaderboard({ sport: "padel" });

    const table = screen.getByRole("table");
    expect(table).toHaveClass("leaderboard-table");
    expect(table.parentElement).toHaveClass("leaderboard-table-wrapper");
  });

  it("does not render back navigation without a previous route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "padel" });

    expect(
      screen.queryByRole("navigation", { name: "Back" }),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("links back to matches when navigated from the matches page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    window.sessionStorage.setItem(
      PREVIOUS_ROUTE_STORAGE_KEY,
      "/matches?page=2",
    );

    await renderLeaderboard({ sport: "padel" });

    const nav = await screen.findByRole("navigation", { name: "Back" });
    const link = within(nav).getByRole("link", { name: "\u2190 Back to matches" });
    expect(link).toHaveAttribute("href", "/matches?page=2");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("falls back to a generic back label for unknown previous routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    window.sessionStorage.setItem(
      PREVIOUS_ROUTE_STORAGE_KEY,
      "/custom",
    );

    await renderLeaderboard({ sport: "padel" });

    const nav = await screen.findByRole("navigation", { name: "Back" });
    const link = within(nav).getByRole("link", { name: "\u2190 Back" });
    expect(link).toHaveAttribute("href", "/custom");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("remembers the previous leaderboard route after client-side navigation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    const view = await renderLeaderboard({ sport: "padel" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(
      screen.queryByRole("navigation", { name: "Back" }),
    ).not.toBeInTheDocument();

    fetchMock.mockClear();

    await act(async () => {
      updateMockLocation("/leaderboard/master");
    });

    view.rerender(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <Leaderboard sport="master" />
      </NextIntlClientProvider>,
    );

    const nav = await screen.findByRole("navigation", { name: "Back" });
    const link = within(nav).getByRole("link", {
      name: "\u2190 Back to leaderboards",
    });
    expect(link).toHaveAttribute("href", "/leaderboard");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("falls back to a dropdown when the tab navigation overflows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "padel" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    replaceMock.mockClear();

    const tablist = screen.getByRole("tablist");
    Object.defineProperty(tablist, "clientWidth", {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(tablist, "scrollWidth", {
      configurable: true,
      value: 640,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    const select = await screen.findByRole("combobox", {
      name: /more sports/i,
    });
    expect(select).toHaveValue("padel");

    const user = userEvent.setup();
    await user.selectOptions(select, "disc_golf");

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard/?sport=disc_golf",
        { scroll: false },
      ),
    );
  });

  it("includes the country filter when provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard/padel");

    await renderLeaderboard({ sport: "padel", country: "SE" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] ?? [];
    const params = new URL(requestUrl as string, "https://example.test").searchParams;
    expect(params.get("sport")).toBe("padel");
    expect(params.get("country")).toBe("SE");
    expect(params.get("limit")).toBe("50");
    expect(params.get("offset")).toBe("0");
    expect(requestOptions).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("includes the club filter when provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard/padel");

    await renderLeaderboard({ sport: "padel", clubId: "club-a" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [clubUrl, clubOptions] = fetchMock.mock.calls[0] ?? [];
    const clubParams = new URL(clubUrl as string, "https://example.test").searchParams;
    expect(clubParams.get("sport")).toBe("padel");
    expect(clubParams.get("clubId")).toBe("club-a");
    expect(clubParams.get("limit")).toBe("50");
    expect(clubParams.get("offset")).toBe("0");
    expect(clubOptions).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("explains how the master leaderboard works", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "master" });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/leaderboards/master?limit=50&offset=0"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "What is the Master leaderboard?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Master leaderboard ranks players across all sports based on combined performance.",
      ),
    ).toBeInTheDocument();
  });

  it("passes region filters to each sport when viewing the combined board", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard?sport=all");

    await renderLeaderboard({ sport: "all", country: "SE", clubId: "club-a" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    const combinedUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    const discGolfUrl = combinedUrls.find((url) => url.includes("sport=disc_golf"));
    expect(discGolfUrl).toBeDefined();
    const search = new URL(discGolfUrl as string, "https://example.test").searchParams;
    expect(search.get("sport")).toBe("disc_golf");
    expect(search.get("country")).toBe("SE");
    expect(search.get("clubId")).toBe("club-a");
    expect(search.get("limit")).toBe("50");
    expect(search.get("offset")).toBe("0");
  });

  it("loads additional pages when the sentinel intersects", async () => {
    const firstPage = {
      leaders: [
        {
          rank: 1,
          playerId: "p1",
          playerName: "Alice",
          rating: 1200,
          setsWon: 10,
          setsLost: 2,
        },
        {
          rank: 2,
          playerId: "p2",
          playerName: "Bob",
          rating: 1100,
          setsWon: 8,
          setsLost: 4,
        },
      ],
      total: 3,
      limit: 2,
      offset: 0,
    };
    const secondPage = {
      leaders: [
        {
          rank: 3,
          playerId: "p3",
          playerName: "Cara",
          rating: 1000,
          setsWon: 6,
          setsLost: 6,
        },
      ],
      total: 3,
      limit: 2,
      offset: 2,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => firstPage })
      .mockResolvedValueOnce({ ok: true, json: async () => secondPage });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "padel" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Alice")).toBeInTheDocument();
    const aliceRatingCell = await screen.findByRole("cell", {
      name: "1,200.0",
    });
    expect(aliceRatingCell).toHaveAttribute("title", "1200");
    expect(screen.queryByText("Cara")).not.toBeInTheDocument();

    await act(async () => {
      mockIntersectionObservers.forEach((observer) => observer.trigger());
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Cara")).toBeInTheDocument();
  });

  it("updates combined leaderboard filters immediately on selection change", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard?sport=all");

    await renderLeaderboard({ sport: "all" });

    await waitFor(() => expect(fetchClubsSpy).toHaveBeenCalled());

    const countrySelect = await screen.findByRole("combobox", {
      name: "Country",
    });
    await user.clear(countrySelect);
    await user.type(countrySelect, "swed");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    const clubSelect = (await screen.findByRole("combobox", {
      name: "Club",
    })) as HTMLSelectElement;
    await user.selectOptions(clubSelect, "club-123");

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard?sport=all&country=SE",
        { scroll: false },
      ),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("country=SE"),
        ),
      ).toBe(true),
    );

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard?sport=all&country=SE&clubId=club-123",
        { scroll: false },
      ),
    );
  });

  it("applies structured region filters without requiring an Apply click", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard/padel");

    await renderLeaderboard({ sport: "padel" });

    await waitFor(() => expect(fetchClubsSpy).toHaveBeenCalled());

    const user = userEvent.setup();
    const countrySelect = screen.getByRole("combobox", { name: "Country" });
    await user.clear(countrySelect);
    await user.type(countrySelect, "swed");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    const clubSelect = screen.getByRole("combobox", { name: "Club" });
    await user.selectOptions(clubSelect, "club-123");

    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard/padel?country=SE&clubId=club-123",
        { scroll: false },
      ),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("sport=padel&country=SE&clubId=club-123"),
        expect.anything(),
      ),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("narrows country suggestions with type-ahead and applies the selected country immediately", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard/padel");

    await renderLeaderboard({ sport: "padel" });

    const countrySelect = await screen.findByRole("combobox", { name: "Country" });
    await user.type(countrySelect, "swed");

    expect(
      await screen.findByRole("option", { name: /Sweden \(SE\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /United States of America \(US\)/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Sweden \(SE\)/i }));

    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard/padel?country=SE",
        { scroll: false },
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("sport=padel&country=SE"),
        expect.anything(),
      ),
    );
  });

  it("resets an incompatible club when the country changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    fetchClubsSpy
      .mockResolvedValueOnce([
        { id: "club-123", name: "Club 123" },
        { id: "club-se", name: "Club Sweden" },
      ])
      .mockResolvedValueOnce([{ id: "club-us", name: "Club USA" }]);
    updateMockLocation("/leaderboard/padel?country=SE&clubId=club-123");

    await renderLeaderboard({ sport: "padel", country: "SE", clubId: "club-123" });

    await waitFor(() =>
      expect(fetchClubsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sport: "padel", country: "SE" }),
      ),
    );

    const countrySelect = screen.getByRole("combobox", { name: "Country" });
    await user.clear(countrySelect);
    await user.type(countrySelect, "us");
    await user.click(
      await screen.findByRole("option", { name: /United States of America \(US\)/i }),
    );

    await waitFor(() =>
      expect(fetchClubsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sport: "padel", country: "US" }),
      ),
    );

    const clubSelect = screen.getByRole("combobox", { name: "Club" });
    await waitFor(() => expect(clubSelect).toHaveValue(""));
  });

  it("narrows club options based on current sport and country", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    fetchClubsSpy
      .mockResolvedValueOnce([
        { id: "club-123", name: "Club 123" },
        { id: "club-se", name: "Club Sweden" },
      ])
      .mockResolvedValueOnce([{ id: "club-us", name: "Club USA" }]);
    updateMockLocation("/leaderboard/padel?country=SE");

    await renderLeaderboard({ sport: "padel", country: "SE" });

    await waitFor(() =>
      expect(fetchClubsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sport: "padel", country: "SE" }),
      ),
    );

    let clubSelect = screen.getByRole("combobox", { name: "Club" });
    expect(within(clubSelect).getByRole("option", { name: "Club 123" })).toBeInTheDocument();
    expect(within(clubSelect).queryByRole("option", { name: "Club USA" })).not.toBeInTheDocument();

    const countrySelect = screen.getByRole("combobox", { name: "Country" });
    await user.clear(countrySelect);
    await user.type(countrySelect, "us");
    await user.click(
      await screen.findByRole("option", { name: /United States of America \(US\)/i }),
    );

    await waitFor(() =>
      expect(fetchClubsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sport: "padel", country: "US" }),
      ),
    );

    clubSelect = screen.getByRole("combobox", { name: "Club" });
    await waitFor(() =>
      expect(within(clubSelect).getByRole("option", { name: "Club USA" })).toBeInTheDocument(),
    );
    expect(within(clubSelect).queryByRole("option", { name: "Club 123" })).not.toBeInTheDocument();
  });

  it("scopes club fetches and options to the active sport and country", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    fetchClubsSpy
      .mockResolvedValueOnce([{ id: "club-padel-se", name: "Padel Sweden" }])
      .mockResolvedValueOnce([{ id: "club-disc-se", name: "Disc Sweden" }])
      .mockResolvedValueOnce([{ id: "club-disc-us", name: "Disc USA" }]);
    updateMockLocation("/leaderboard/padel?country=SE");

    const view = await renderLeaderboard({ sport: "padel", country: "SE" });

    await waitFor(() =>
      expect(fetchClubsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sport: "padel", country: "SE" }),
      ),
    );
    let clubSelect = screen.getByRole("combobox", { name: "Club" });
    expect(
      within(clubSelect).getByRole("option", { name: "Padel Sweden" }),
    ).toBeInTheDocument();
    expect(
      within(clubSelect).queryByRole("option", { name: "Disc Sweden" }),
    ).not.toBeInTheDocument();

    updateMockLocation("/leaderboard/disc_golf?country=SE");
    view.rerender(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <Leaderboard sport="disc_golf" country="SE" />
      </NextIntlClientProvider>,
    );

    await waitFor(() =>
      expect(fetchClubsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sport: "disc_golf", country: "SE" }),
      ),
    );
    clubSelect = screen.getByRole("combobox", { name: "Club" });
    await waitFor(() =>
      expect(
        within(clubSelect).getByRole("option", { name: "Disc Sweden" }),
      ).toBeInTheDocument(),
    );
    expect(
      within(clubSelect).queryByRole("option", { name: "Padel Sweden" }),
    ).not.toBeInTheDocument();

    const countrySelect = screen.getByRole("combobox", { name: "Country" });
    await user.clear(countrySelect);
    await user.type(countrySelect, "us");
    await user.click(
      await screen.findByRole("option", { name: /United States of America \(US\)/i }),
    );

    await waitFor(() =>
      expect(fetchClubsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sport: "disc_golf", country: "US" }),
      ),
    );
    clubSelect = screen.getByRole("combobox", { name: "Club" });
    await waitFor(() =>
      expect(
        within(clubSelect).getByRole("option", { name: "Disc USA" }),
      ).toBeInTheDocument(),
    );
    expect(
      within(clubSelect).queryByRole("option", { name: "Disc Sweden" }),
    ).not.toBeInTheDocument();
  });

  it("shows validation feedback when the URL references unsupported filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    fetchClubsSpy.mockResolvedValue([{ id: "club-123", name: "Club 123" }]);
    updateMockLocation("/leaderboard/padel?country=ZZ&clubId=club-missing");

    await renderLeaderboard({
      sport: "padel",
      country: "ZZ",
      clubId: "club-missing",
    });

    const countryAlert = await screen.findByText(
      "We don't support country code \"ZZ\". Please pick a country from the list.",
    );
    expect(countryAlert).toHaveAttribute("role", "alert");
    expect(countryAlert).toHaveAttribute("id", "leaderboard-country-error");

    const countrySelect = screen.getByRole("combobox", { name: "Country" });
    expect(countrySelect).toHaveAttribute("aria-invalid", "true");
    expect(countrySelect).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("leaderboard-country-error"),
    );

    const clubSelect = screen.getByRole("combobox", { name: "Club" });
    expect(clubSelect).not.toHaveAttribute("aria-invalid", "true");

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/leaderboard/padel", { scroll: false }),
    );
  });

  it("explains when a sport has no recorded matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "disc_golf" });

    await screen.findByRole("heading", {
      level: 2,
      name: "No Disc Golf matches recorded yet.",
    });
    expect(
      screen.getByText("Be the first to record one!"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Record a Disc Golf match" }),
    ).toHaveAttribute("href", "/record/disc-golf");
  });

  it("mentions when no matches exist for the selected region", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "bowling", country: "SE" });

    await screen.findByRole("heading", {
      level: 2,
      name: "No Bowling matches in this region yet.",
    });
    expect(
      screen.getByText("Try adjusting the filters or record a new match."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Record a Bowling match" }),
    ).toHaveAttribute("href", expect.stringContaining("/record/bowling"));
  });

  it("shows an error message when fetching fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    global.fetch = fetchMock as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await renderLeaderboard({ sport: "padel" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByText("We couldn't load the leaderboard right now.");
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  it("normalizes a trailing slash when syncing filters", async () => {
    updateMockLocation("/leaderboard/");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "padel" });

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/leaderboard", { scroll: false })
    );
  });

  it("applies stored sport and country preferences when no filters are provided", async () => {
    window.localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        defaultLeaderboardSport: "padel",
        defaultLeaderboardCountry: "SE",
        weeklySummaryEmails: true,
      }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    const view = await renderLeaderboard({ sport: "all" });

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard?sport=padel&country=SE",
        { scroll: false },
      ),
    );

    updateMockLocation("/leaderboard?sport=padel&country=SE");
    view.rerender(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <Leaderboard sport="padel" />
      </NextIntlClientProvider>,
    );

    const countrySelect = await screen.findByRole("combobox", { name: "Country" });
    await waitFor(() => expect(countrySelect).toHaveValue("Sweden"));
  });

  it("preserves additional query params when updating filters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    updateMockLocation("/leaderboard?sport=padel&foo=bar");

    await renderLeaderboard({ sport: "padel" });

    const countrySelect = await screen.findByLabelText("Country");
    await user.clear(countrySelect);
    await user.type(countrySelect, "swed");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard?sport=padel&foo=bar&country=SE",
        { scroll: false },
      ),
    );

    let lastCall = replaceMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    let [href] = lastCall!;
    let url = new URL(href as string, "https://example.test");
    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.searchParams.get("sport")).toBe("padel");
    expect(url.searchParams.get("country")).toBe("SE");

    const clubSelect = (await screen.findByRole("combobox", { name: "Club" })) as HTMLSelectElement;
    await waitFor(() => expect(fetchClubsSpy).toHaveBeenCalled());
    await user.selectOptions(clubSelect, "club-123");

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard?sport=padel&foo=bar&country=SE&clubId=club-123",
        { scroll: false },
      )
    );

    lastCall = replaceMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    [href] = lastCall!;
    url = new URL(href as string, "https://example.test");
    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.searchParams.get("sport")).toBe("padel");
    expect(url.searchParams.get("country")).toBe("SE");
    expect(url.searchParams.get("clubId")).toBe("club-123");

    const clearButton = screen
      .getAllByRole("button", { name: "Reset filters" })
      .find((button): button is HTMLButtonElement =>
        button.getAttribute("aria-controls") === "leaderboard-results"
      );
    expect(clearButton).toBeDefined();
    const postClubCallCount = replaceMock.mock.calls.length;
    await user.click(clearButton!);
    await waitFor(() =>
      expect(replaceMock.mock.calls.length).toBeGreaterThan(postClubCallCount)
    );

    lastCall = replaceMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    [href] = lastCall!;
    url = new URL(href as string, "https://example.test");
    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.searchParams.get("sport")).toBe("padel");
    expect(url.searchParams.has("country")).toBe(false);
    expect(url.searchParams.has("clubId")).toBe(false);
    expect(countrySelect.value).toBe("");
    expect(clubSelect.value).toBe("");
  });

  it("resets filters to an unfiltered state and removes country and club query params", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    fetchClubsSpy.mockResolvedValue([{ id: "club-se", name: "Club Sweden" }]);
    updateMockLocation("/leaderboard/padel?country=SE&clubId=club-se");

    await renderLeaderboard({ sport: "padel", country: "SE", clubId: "club-se" });

    const countrySelect = await screen.findByRole("combobox", { name: "Country" });
    const clubSelect = (await screen.findByRole("combobox", {
      name: "Club",
    })) as HTMLSelectElement;
    expect(countrySelect).toHaveValue("Sweden");
    expect(clubSelect).toHaveValue("club-se");

    const resetButton = screen
      .getAllByRole("button", { name: "Reset filters" })
      .find((button): button is HTMLButtonElement =>
        button.getAttribute("aria-controls") === "leaderboard-results"
      );
    expect(resetButton).toBeDefined();
    await user.click(resetButton!);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/leaderboard/padel", { scroll: false }),
    );
    expect(countrySelect).toHaveValue("");
    expect(clubSelect).toHaveValue("");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("sport=padel&limit=50&offset=0"),
        expect.anything(),
      ),
    );
    const lastUrl = fetchMock.mock.calls.at(-1)?.[0];
    expect(lastUrl).toBeDefined();
    const params = new URL(String(lastUrl), "https://example.test").searchParams;
    expect(params.has("country")).toBe(false);
    expect(params.has("clubId")).toBe(false);
  });

  it("annotates the leaderboard table for accessibility", async () => {
    const response = [
      {
        rank: 1,
        playerId: "1",
        playerName: "Player One",
        rating: 1200,
        setsWon: 5,
        setsLost: 2,
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => response });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard/padel");

    await renderLeaderboard({ sport: "padel" });

    const table = await screen.findByRole("table");
    expect(table).toHaveAttribute("id", "leaderboard-results");
    expect(table).toHaveAttribute("aria-labelledby", "leaderboard-results-caption");
    expect(table).toHaveAccessibleName(
      "Padel leaderboard results. Global results with no region filters. Columns display rank, player, rating, win chance versus the #1 player, wins, losses, matches, and win percentage.",
    );
    expect(table).toHaveClass("leaderboard-table");
    expect(table.parentElement).toHaveClass("leaderboard-table-wrapper");

    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThan(0);

    const stickyHeader = screen.getByRole("columnheader", { name: "#" });
    expect(stickyHeader).toHaveStyle("position: sticky");
    expect(stickyHeader).toHaveStyle("top: 0");
    expect(stickyHeader).toHaveStyle(
      "background: var(--leaderboard-table-header-bg)",
    );

    expect(screen.getByRole("columnheader", { name: "#" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    expect(
      screen.getByRole("navigation", { name: "Leaderboard sports" }),
    ).toHaveAttribute("aria-controls", "leaderboard-results");

    expect(
      screen.getByRole("form", { name: "Leaderboard filters" }),
    ).toHaveAttribute("aria-controls", "leaderboard-results");

    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();

    const clearButtons = screen.getAllByRole("button", { name: "Reset filters" });
    const filterClear = clearButtons.find((button) =>
      button.getAttribute("aria-controls") === "leaderboard-results"
    );
    expect(filterClear).toBeDefined();
    expect(filterClear).toHaveAttribute("aria-controls", "leaderboard-results");
  });

  const setupSortableLeaderboard = async (response: SortTestLeader[]) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => response });
    global.fetch = fetchMock as typeof fetch;

    await renderLeaderboard({ sport: "padel" });
    await screen.findByText(response[0]?.playerName ?? "");
    const table = screen.getByRole("table");

    const getRenderedPlayerOrder = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => {
          const cells = within(row).getAllByRole("cell");
          return cells[1]?.textContent?.trim();
        })
        .filter((name): name is string => Boolean(name));

    await waitFor(() =>
      expect(getRenderedPlayerOrder().length).toBeGreaterThan(0),
    );

    return {
      getRenderedPlayerOrder,
      ratingButton: () => screen.getByRole("button", { name: /^Rating\./i }),
      matchesButton: () => screen.getByRole("button", { name: /^Matches\./i }),
    };
  };

  it("keeps single-column sort cycling unchanged without Shift", async () => {
    const user = userEvent.setup();
    const response: SortTestLeader[] = [
      { rank: 1, playerId: "1", playerName: "Charlie", rating: 1000, setsWon: 2, setsLost: 2 },
      { rank: 2, playerId: "2", playerName: "Alice", rating: 1200, setsWon: 1, setsLost: 1 },
      { rank: 3, playerId: "3", playerName: "Bob", rating: 1100, setsWon: 3, setsLost: 0 },
    ];

    const { getRenderedPlayerOrder, ratingButton } = await setupSortableLeaderboard(response);

    expect(getRenderedPlayerOrder()).toEqual(["Charlie", "Alice", "Bob"]);

    await user.click(ratingButton());
    expect(getRenderedPlayerOrder()).toEqual(["Alice", "Bob", "Charlie"]);

    await user.click(ratingButton());
    expect(getRenderedPlayerOrder()).toEqual(["Charlie", "Bob", "Alice"]);

    await user.click(ratingButton());
    expect(getRenderedPlayerOrder()).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("adds a secondary sort criterion on Shift+click", async () => {
    const user = userEvent.setup();
    const response: SortTestLeader[] = [
      { rank: 1, playerId: "1", playerName: "Alice", rating: 1000, setsWon: 2, setsLost: 1 },
      { rank: 2, playerId: "2", playerName: "Bob", rating: 1000, setsWon: 6, setsLost: 0 },
      { rank: 3, playerId: "3", playerName: "Cara", rating: 900, setsWon: 1, setsLost: 5 },
    ];

    const { getRenderedPlayerOrder, ratingButton, matchesButton } =
      await setupSortableLeaderboard(response);

    await user.click(ratingButton());

    await user.keyboard("[ShiftLeft>]");
    await user.click(matchesButton());
    await user.keyboard("[/ShiftLeft]");

    expect(getRenderedPlayerOrder()).toEqual(["Bob", "Alice", "Cara"]);
    expect(ratingButton()).toHaveAccessibleName(/Hold Shift while clicking to add or update this column/i);
    expect(matchesButton()).toHaveAccessibleName(/Hold Shift while clicking to add or update this column/i);
    const ratingHeader = ratingButton().closest("[role='columnheader']");
    const matchesHeader = matchesButton().closest("[role='columnheader']");
    expect(ratingHeader).not.toBeNull();
    expect(matchesHeader).not.toBeNull();
    expect(within(ratingHeader as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(matchesHeader as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("uses secondary criteria as tie-breakers in priority order", async () => {
    const user = userEvent.setup();
    const response: SortTestLeader[] = [
      { rank: 1, playerId: "1", playerName: "Alice", rating: 1000, setsWon: 2, setsLost: 1 },
      { rank: 2, playerId: "2", playerName: "Bob", rating: 1000, setsWon: 6, setsLost: 0 },
      { rank: 3, playerId: "3", playerName: "Cara", rating: 900, setsWon: 5, setsLost: 3 },
      { rank: 4, playerId: "4", playerName: "Dina", rating: 900, setsWon: 1, setsLost: 4 },
    ];

    const { getRenderedPlayerOrder, ratingButton, matchesButton } =
      await setupSortableLeaderboard(response);

    await user.click(ratingButton());
    await user.keyboard("[ShiftLeft>]");
    await user.click(matchesButton());
    await user.keyboard("[/ShiftLeft]");

    expect(getRenderedPlayerOrder()).toEqual(["Bob", "Alice", "Cara", "Dina"]);
  });

  it("removes only one criterion when it cycles to none", async () => {
    const user = userEvent.setup();
    const response: SortTestLeader[] = [
      { rank: 1, playerId: "1", playerName: "Alice", rating: 1000, setsWon: 2, setsLost: 1 },
      { rank: 2, playerId: "2", playerName: "Bob", rating: 1000, setsWon: 6, setsLost: 0 },
      { rank: 3, playerId: "3", playerName: "Cara", rating: 900, setsWon: 1, setsLost: 5 },
    ];

    const { getRenderedPlayerOrder, ratingButton, matchesButton } =
      await setupSortableLeaderboard(response);

    await user.click(ratingButton());
    await user.keyboard("[ShiftLeft>]");
    await user.click(matchesButton());
    await user.keyboard("[/ShiftLeft]");
    expect(getRenderedPlayerOrder()).toEqual(["Bob", "Alice", "Cara"]);

    await user.keyboard("[ShiftLeft>]");
    await user.click(matchesButton());
    await user.click(matchesButton());
    await user.keyboard("[/ShiftLeft]");

    expect(getRenderedPlayerOrder()).toEqual(["Alice", "Bob", "Cara"]);
  });

  it("reuses cached sport results when revisiting a previously viewed sport", async () => {
    const padelResponse = {
      ok: true,
      json: async () => [
        { rank: 1, playerId: "padel-1", playerName: "Padel Ace", rating: 2000 },
      ],
    } as Response;
    const discResponse = {
      ok: true,
      json: async () => [
        {
          rank: 1,
          playerId: "disc-1",
          playerName: "Disc Star",
          rating: 1950,
        },
      ],
    } as Response;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(padelResponse)
      .mockResolvedValueOnce(discResponse);
    global.fetch = fetchMock as typeof fetch;

    const { rerender } = await renderLeaderboard({ sport: "padel" });

    await screen.findByText("Padel Ace");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    updateMockLocation("/leaderboard?sport=disc_golf");
    rerender(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <Leaderboard sport="disc_golf" />
      </NextIntlClientProvider>,
    );

    await screen.findByText("Disc Star");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    updateMockLocation("/leaderboard?sport=padel");
    rerender(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <Leaderboard sport="padel" />
      </NextIntlClientProvider>,
    );

    await screen.findByText("Padel Ace");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
