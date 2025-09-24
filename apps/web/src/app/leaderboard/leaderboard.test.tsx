import { render, waitFor, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Leaderboard from "./leaderboard";
import { apiUrl } from "../../lib/api";
import { USER_SETTINGS_STORAGE_KEY } from "../user-settings";

const replaceMock = vi.fn();
let mockPathname = "/leaderboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => mockPathname,
}));

describe("Leaderboard", () => {
  beforeEach(() => {
    mockPathname = "/leaderboard";
    replaceMock.mockReset();
    window.history.replaceState(null, "", "/leaderboard");
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(apiUrl("/v0/leaderboards?sport=disc_golf"));
  });

  it("includes the country filter when provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;
    mockPathname = "/leaderboard/padel";

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
    mockPathname = "/leaderboard/padel";

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

    await screen.findByText(
      "No Disc Golf matches have been recorded yet. Check back soon!",
    );
  });

  it("mentions when no matches exist for the selected region", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    render(<Leaderboard sport="badminton" country="SE" />);

    await screen.findByText(
      "No Badminton matches have been recorded for this region yet. Try clearing the filters or check back soon.",
    );
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
    window.history.replaceState(null, "", "/leaderboard/");
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

    render(<Leaderboard sport="all" />);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/leaderboard?sport=padel&country=SE",
        { scroll: false },
      ),
    );

    const countryInput = (await screen.findByLabelText("Country")) as HTMLInputElement;
    expect(countryInput.value).toBe("SE");
  });
});
