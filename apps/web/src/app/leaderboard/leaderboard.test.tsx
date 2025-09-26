import { render, waitFor, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import Leaderboard from "./leaderboard";
import { apiUrl } from "../../lib/api";
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
  beforeEach(() => {
    updateMockLocation("/leaderboard");
    replaceMock.mockReset();
    replaceMock.mockImplementation((nextHref: string, _options?: { scroll?: boolean }) => {
      updateMockLocation(nextHref);
      return undefined;
    });
    window.localStorage.clear();
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(apiUrl("/v0/leaderboards?sport=disc_golf"));
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
      apiUrl("/v0/leaderboards?sport=padel&country=SE")
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
      apiUrl("/v0/leaderboards?sport=padel&clubId=club-a")
    );
  });

  it("passes region filters to each sport when viewing the combined board", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    updateMockLocation("/leaderboard?sport=all");

    render(<Leaderboard sport="all" country="SE" clubId="club-a" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(
      apiUrl("/v0/leaderboards?sport=disc_golf&country=SE&clubId=club-a")
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

    render(<Leaderboard sport="badminton" country="SE" />);

    await screen.findByRole("heading", {
      level: 2,
      name: "No Badminton matches in this region yet.",
    });
    expect(
      screen.getByText("Try adjusting the filters or record a new match."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Record a Badminton match" }),
    ).toHaveAttribute("href", expect.stringContaining("/record/badminton"));
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

    const countryInput = (await screen.findByLabelText("Country")) as HTMLInputElement;
    expect(countryInput.value).toBe("SE");
  });

  it("preserves additional query params when updating filters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    updateMockLocation("/leaderboard?sport=padel&foo=bar");

    render(<Leaderboard sport="padel" />);

    const countryInput = (await screen.findByLabelText("Country")) as HTMLInputElement;
    await user.type(countryInput, "se");
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

    const clubInput = (await screen.findByLabelText("Club")) as HTMLInputElement;
    await user.type(clubInput, "club-123");

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

    const clearButton = screen.getByRole("button", { name: "Clear" });
    const postClubCallCount = replaceMock.mock.calls.length;
    await user.click(clearButton);
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

    const headers = screen.getAllByRole("columnheader");
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });

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

    expect(screen.getByRole("button", { name: "Clear" })).toHaveAttribute(
      "aria-controls",
      "leaderboard-results",
    );
  });
});
