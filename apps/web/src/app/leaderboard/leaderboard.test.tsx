import { render, waitFor, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import Leaderboard from "./leaderboard";
import { apiUrl } from "../../lib/api";
import * as api from "../../lib/api";
import { USER_SETTINGS_STORAGE_KEY } from "../user-settings";

const replaceMock = vi.fn();
let mockPathname = "/leaderboard";
let mockSearchParams = new URLSearchParams();

const updateMockLocation = (href: string) => {
  const url = new URL(href, "https://example.test");
  mockPathname = url.pathname;
  mockSearchParams = new URLSearchParams(url.search);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

describe("Leaderboard", () => {
  let fetchClubsSpy: vi.SpiedFunction<typeof api.fetchClubs>;

  beforeEach(() => {
    updateMockLocation("/leaderboard");
    replaceMock.mockReset();
    replaceMock.mockImplementation((nextHref: string) => {
      updateMockLocation(nextHref);
      return undefined;
    });
    window.localStorage.clear();
    fetchClubsSpy = vi.spyOn(api, "fetchClubs").mockResolvedValue([
      { id: "club-123", name: "Club 123" },
      { id: "club-a", name: "Club A" },
    ]);
  });

  afterEach(() => {
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

    render(<Leaderboard sport="all" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "All Sports Leaderboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "All Sports" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Disc Golf" })).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(apiUrl("/v0/leaderboards?sport=disc_golf"));
  });

  it("keeps the tab navigation scrollable without a dropdown on wide viewports", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    render(<Leaderboard sport="padel" />);

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
        screen.queryByRole("combobox", { name: /select a sport/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("renders the leaderboard table inside a scrollable wrapper while loading", () => {
    const pendingFetch = new Promise<Response>(() => {});
    global.fetch = vi.fn().mockReturnValue(pendingFetch) as unknown as typeof fetch;

    render(<Leaderboard sport="padel" />);

    const table = screen.getByRole("table");
    expect(table).toHaveClass("leaderboard-table");
    expect(table.parentElement).toHaveClass("leaderboard-table-wrapper");
  });

  it("falls back to a dropdown when the tab navigation overflows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    render(<Leaderboard sport="padel" />);

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
      name: /select a sport/i,
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

    render(<Leaderboard sport="padel" country="SE" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      apiUrl("/v0/leaderboards?sport=padel&country=SE"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("includes the club filter when provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard/padel");

    render(<Leaderboard sport="padel" clubId="club-a" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      apiUrl("/v0/leaderboards?sport=padel&clubId=club-a"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("passes region filters to each sport when viewing the combined board", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard?sport=all");

    render(<Leaderboard sport="all" country="SE" clubId="club-a" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(
      apiUrl("/v0/leaderboards?sport=disc_golf&country=SE&clubId=club-a")
    );
  });

  it("lets users filter the combined leaderboard", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard?sport=all");

    render(<Leaderboard sport="all" />);

    await waitFor(() => expect(fetchClubsSpy).toHaveBeenCalled());

    const countrySelect = (await screen.findByRole("combobox", {
      name: "Country",
    })) as HTMLSelectElement;
    await user.selectOptions(countrySelect, "SE");

    const clubSelect = (await screen.findByRole("combobox", {
      name: "Club",
    })) as HTMLSelectElement;
    await user.selectOptions(clubSelect, "club-123");

    const applyButton = screen.getByRole("button", { name: "Apply" });
    expect(applyButton).not.toBeDisabled();

    const initialCallCount = replaceMock.mock.calls.length;
    await user.click(applyButton);

    await waitFor(() =>
      expect(replaceMock.mock.calls.length).toBeGreaterThan(initialCallCount),
    );

    const lastCall = replaceMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const [href] = lastCall!;
    const url = new URL(href as string, "https://example.test");
    expect(url.pathname).toBe("/leaderboard");
    expect(url.searchParams.get("sport")).toBe("all");
    expect(url.searchParams.get("country")).toBe("SE");
    expect(url.searchParams.get("clubId")).toBe("club-123");
  });

  it("lets users apply structured region filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard/padel");

    render(<Leaderboard sport="padel" />);

    await waitFor(() => expect(fetchClubsSpy).toHaveBeenCalled());

    const user = userEvent.setup();
    const countrySelect = screen.getByRole("combobox", { name: "Country" });
    await user.selectOptions(countrySelect, "SE");

    const clubSelect = screen.getByRole("combobox", { name: "Club" });
    await user.selectOptions(clubSelect, "club-123");

    replaceMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard/padel?country=SE&clubId=club-123",
        { scroll: false },
      ),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows validation feedback when the URL references unsupported filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    fetchClubsSpy.mockResolvedValue([{ id: "club-123", name: "Club 123" }]);
    updateMockLocation("/leaderboard/padel?country=ZZ&clubId=club-missing");

    render(<Leaderboard sport="padel" country="ZZ" clubId="club-missing" />);

    const countryAlert = await screen.findByText(
      "We don't support country code \"ZZ\". Please pick a country from the list.",
    );
    expect(countryAlert).toHaveAttribute("role", "alert");

    const clubAlert = await screen.findByText(
      "We don't recognise the club \"club-missing\". Please choose an option from the list.",
    );
    expect(clubAlert).toHaveAttribute("role", "alert");

    const countrySelect = screen.getByRole("combobox", { name: "Country" });
    expect(countrySelect).toHaveAttribute("aria-invalid", "true");

    const clubSelect = screen.getByRole("combobox", { name: "Club" });
    expect(clubSelect).toHaveAttribute("aria-invalid", "true");

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/leaderboard/padel", { scroll: false }),
    );
  });

  it("explains when a sport has no recorded matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    render(<Leaderboard sport="disc_golf" />);

    await screen.findByRole("heading", {
      level: 2,
      name: "No Disc Golf matches recorded yet.",
    });
    expect(
      screen.getByText("Be the first to record one!"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Record a Disc Golf match" }),
    ).toHaveAttribute("href", expect.stringContaining("/record/disc-golf"));
  });

  it("mentions when no matches exist for the selected region", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    render(<Leaderboard sport="bowling" country="SE" />);

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

    render(<Leaderboard sport="padel" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByText("We couldn't load the leaderboard right now.");
  });

  it("normalizes a trailing slash when syncing filters", async () => {
    updateMockLocation("/leaderboard/");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    render(<Leaderboard sport="padel" />);

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

    const view = render(<Leaderboard sport="all" />);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard?sport=padel&country=SE",
        { scroll: false },
      ),
    );

    updateMockLocation("/leaderboard?sport=padel&country=SE");
    view.rerender(<Leaderboard sport="padel" />);

    const countrySelect = (await screen.findByRole("combobox", { name: "Country" })) as HTMLSelectElement;
    await waitFor(() => expect(countrySelect.value).toBe("SE"));
  });

  it("preserves additional query params when updating filters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    updateMockLocation("/leaderboard?sport=padel&foo=bar");

    render(<Leaderboard sport="padel" />);

    const countrySelect = (await screen.findByLabelText("Country")) as HTMLSelectElement;
    await user.selectOptions(countrySelect, "SE");
    const applyButton = screen.getByRole("button", { name: "Apply" });

    const initialCallCount = replaceMock.mock.calls.length;
    await user.click(applyButton);
    await waitFor(() =>
      expect(replaceMock.mock.calls.length).toBeGreaterThan(initialCallCount)
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

    const postCountryCallCount = replaceMock.mock.calls.length;
    await user.click(applyButton);
    await waitFor(() =>
      expect(replaceMock.mock.calls.length).toBeGreaterThan(postCountryCallCount)
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
      .getAllByRole("button", { name: "Clear" })
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

    render(<Leaderboard sport="padel" />);

    const table = await screen.findByRole("table");
    expect(table).toHaveAttribute("id", "leaderboard-results");
    expect(table).toHaveClass("leaderboard-table");
    expect(table.parentElement).toHaveClass("leaderboard-table-wrapper");

    const headers = screen.getAllByRole("columnheader");
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });

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

    expect(screen.getByRole("button", { name: "Apply" })).toHaveAttribute(
      "aria-controls",
      "leaderboard-results",
    );

    const clearButtons = screen.getAllByRole("button", { name: "Clear" });
    const filterClear = clearButtons.find((button) =>
      button.getAttribute("aria-controls") === "leaderboard-results"
    );
    expect(filterClear).toBeDefined();
    expect(filterClear).toHaveAttribute("aria-controls", "leaderboard-results");
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

    const { rerender } = render(<Leaderboard sport="padel" />);

    await screen.findByText("Padel Ace");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    updateMockLocation("/leaderboard?sport=disc_golf");
    rerender(<Leaderboard sport="disc_golf" />);

    await screen.findByText("Disc Star");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    updateMockLocation("/leaderboard?sport=padel");
    rerender(<Leaderboard sport="padel" />);

    await screen.findByText("Padel Ace");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
