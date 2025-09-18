import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Leaderboard from "./leaderboard";

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
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    expect(urls).toContain("/api/v0/leaderboards?sport=disc_golf");
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
      "/api/v0/leaderboards?sport=padel&country=SE"
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
      "/api/v0/leaderboards?sport=padel&clubId=club-a"
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
      "/api/v0/leaderboards?sport=disc_golf&country=SE&clubId=club-a"
    );
  });
});
