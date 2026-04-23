import { renderHook, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useLeaderboardData } from "./useLeaderboardData";
import { SPORTS } from "../constants";

describe("useLeaderboardData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error test cleanup
    global.fetch = undefined;
  });

  it("fetches all sport endpoints with paging params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as typeof fetch;

    renderHook(() =>
      useLeaderboardData({
        sport: "all",
        country: "",
        club: "",
        sortState: [],
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(SPORTS.length));

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    const discGolfRequest = urls.find((url) => url.includes("sport=disc_golf"));
    expect(discGolfRequest).toBeDefined();
    const params = new URL(discGolfRequest as string, "https://example.test").searchParams;
    expect(params.get("sport")).toBe("disc_golf");
    expect(params.get("limit")).toBe("50");
    expect(params.get("offset")).toBe("0");
  });

  it("uses master endpoint cache policy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ leaders: [], total: 0, offset: 0 }) });
    global.fetch = fetchMock as typeof fetch;

    renderHook(() =>
      useLeaderboardData({
        sport: "master",
        country: "SE",
        club: "club-1",
        sortState: [],
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/v0/leaderboards/master?limit=50&offset=0");
    expect(init).toMatchObject({ cache: "force-cache", next: { revalidate: 300 } });
  });

  it("loads next page and merges by player for sport leaderboards", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          leaders: [
            { rank: 1, playerId: "p1", playerName: "One", rating: 1000 },
            { rank: 2, playerId: "p2", playerName: "Two", rating: 900 },
          ],
          total: 3,
          offset: 0,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          leaders: [{ rank: 3, playerId: "p3", playerName: "Three", rating: 800 }],
          total: 3,
          offset: 2,
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useLeaderboardData({
        sport: "padel",
        country: "",
        club: "",
        sortState: [],
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leaders).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => expect(result.current.leaders).toHaveLength(3));
    expect(result.current.hasMore).toBe(false);
  });
});
