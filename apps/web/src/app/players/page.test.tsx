import type { ReactNode } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import PlayersPage from "./page";
import ToastProvider from "../../components/ToastProvider";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function mockStatsResponse({
  playerId,
  wins,
  losses,
  draws = 0,
  winPct,
}: {
  playerId: string;
  wins: number;
  losses: number;
  draws?: number;
  winPct: number;
}) {
  return {
    ok: true,
    json: async () => ({
      playerId,
      matchSummary: {
        wins,
        losses,
        draws,
        total: wins + losses + draws,
        winPct,
      },
    }),
  };
}

function renderWithProviders(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function toUrl(value: RequestInfo | URL): string {
  if (typeof value === "string") return value;
  const candidate = value as { url?: string };
  if (typeof candidate.url === "string") {
    return candidate.url;
  }
  return value.toString();
}

describe("PlayersPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("shows a loading message while fetching players", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    expect(screen.getByText(/loading players/i)).toBeTruthy();
  });

  it("shows a retryable error when loading players fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 500,
          statusText: "Server error",
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/failed to load players/i);
    const retry = screen.getByRole("button", { name: /retry/i });
    await act(async () => {
      fireEvent.click(retry);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const toast = await screen.findByTestId("toast");
    expect(toast.textContent).toMatch(/failed to load players/i);
  });

  it("disables add button for blank names", async () => {
    window.localStorage.setItem("token", "x.eyJpc19hZG1pbiI6dHJ1ZX0.y");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const button = await screen.findByRole("button", { name: /add/i });
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    // Only initial load should trigger fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("filters players by search input", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "1", name: "Alice" },
            { id: "2", name: "Bob" },
          ],
        }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 3,
          losses: 1,
          winPct: 0.75,
        })
      )
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "2",
          wins: 2,
          losses: 3,
          winPct: 0.4,
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [{ id: "2", name: "Bob" }],
        }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "2",
          wins: 2,
          losses: 3,
          winPct: 0.4,
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Alice")).toBeTruthy();
    await screen.findByText("3-1 (75%)");
    vi.useFakeTimers();
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "bo" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("2-3 (40%)")).toBeTruthy();
    vi.useRealTimers();
  });

  it("debounces player search requests", async () => {
    vi.useFakeTimers();
    let playersRequestIndex = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrl(input);
      if (url.includes("/v0/players")) {
        const response =
          playersRequestIndex === 0
            ? {
                players: [
                  { id: "1", name: "Alice" },
                  { id: "2", name: "Bob" },
                ],
              }
            : {
                players: [{ id: "1", name: "Alice" }],
              };
        playersRequestIndex += 1;
        return {
          ok: true,
          json: async () => response,
        };
      }
      const statsMatch = url.match(/\/v0\/players\/([^/]+)\/stats/);
      if (statsMatch) {
        const playerId = statsMatch[1];
        return mockStatsResponse({
          playerId,
          wins: 1,
          losses: 0,
          winPct: 1,
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Alice")).toBeTruthy();

    const playersRequests = () =>
      fetchMock.mock.calls.filter(([request]) =>
        toUrl(request as RequestInfo | URL).includes("/v0/players?")
      );

    expect(playersRequests()).toHaveLength(1);

    const search = screen.getByPlaceholderText(/search players/i);

    act(() => {
      fireEvent.change(search, { target: { value: "A" } });
      fireEvent.change(search, { target: { value: "Al" } });
      fireEvent.change(search, { target: { value: "Ali" } });
    });

    expect(playersRequests()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(playersRequests()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(playersRequests()).toHaveLength(2);
    const [, latestRequest] = playersRequests();
    const latestUrlCandidate = latestRequest[0] as RequestInfo | URL;
    const latestRequestUrl = toUrl(latestUrlCandidate);
    expect(latestRequestUrl).toContain("q=Ali");
    expect((search as HTMLInputElement).value).toBe("Ali");
    vi.useRealTimers();
  });

  it("renders players even when named Albert", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "1", name: "Albert" },
            { id: "2", name: "Bob" },
          ],
        }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 5,
          losses: 2,
          winPct: 0.7142857143,
        })
      )
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "2",
          wins: 4,
          losses: 1,
          winPct: 0.8,
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    expect(await screen.findByText("Albert")).toBeTruthy();
    expect(await screen.findByText("Bob")).toBeTruthy();
    expect(await screen.findByText("5-2 (71%)")).toBeTruthy();
    expect(await screen.findByText("4-1 (80%)")).toBeTruthy();
  });

  it("shows a message when no players match the search", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "1", name: "Alice" },
            { id: "2", name: "Bob" },
          ],
        }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 1,
          losses: 2,
          winPct: 0.33,
        })
      )
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "2",
          wins: 5,
          losses: 5,
          winPct: 0.5,
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });
    await screen.findByText("Alice");
    vi.useFakeTimers();
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "zo" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(/no players found/i)).toBeTruthy();
    vi.useRealTimers();
  });

  it("shows a success message after adding a player", async () => {
    window.localStorage.setItem("token", "x.eyJpc19hZG1pbiI6dHJ1ZX0.y");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    vi.useFakeTimers();
    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const input = screen.getByPlaceholderText(/name/i);
    fireEvent.change(input, { target: { value: "New Player" } });
    const button = screen.getByRole("button", { name: /add/i });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    screen.getByText(/added successfully/i);
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(screen.queryByText(/added successfully/i)).toBeNull();
    vi.useRealTimers();
  });

  it("shows stats unavailable and displays a toast when stats fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [{ id: "1", name: "Alice" }] }),
      })
      .mockRejectedValueOnce(new Error("boom"));
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    await screen.findByText("Alice");
    expect(await screen.findByText("Stats unavailable")).toBeTruthy();
    const warnings = screen.getAllByText(/could not load stats/i);
    expect(warnings.length).toBeGreaterThanOrEqual(2);

    vi.useFakeTimers();
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it("informs non-admins that the add form is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    expect(
      screen.getByText(/only administrators can add new players/i)
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
    const controls = document.querySelector(
      "[data-testid=\"player-create-controls\"]"
    ) as HTMLElement | null;
    expect(controls).toBeTruthy();
    expect(controls?.hasAttribute("hidden")).toBe(true);
    expect(controls?.getAttribute("aria-hidden")).toBe("true");
    expect(controls?.hasAttribute("inert")).toBe(true);
  });

  it("hides per-player admin controls for non-admin users", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "1", name: "Alice" },
            { id: "2", name: "Bob" },
          ],
        }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 3,
          losses: 1,
          winPct: 0.75,
        })
      )
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "2",
          wins: 1,
          losses: 2,
          winPct: 0.33,
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    await screen.findByText("Alice");
    await screen.findByText("Bob");

    expect(document.querySelector(".player-list__admin")).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByLabelText(/country for alice/i)).toBeNull();
    expect(screen.queryByLabelText(/country for bob/i)).toBeNull();
  });

  it("shows the create form when the viewer is an admin", async () => {
    window.localStorage.setItem("token", "x.eyJpc19hZG1pbiI6dHJ1ZX0.y");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const controls = screen.getByTestId("player-create-controls");
    expect(controls.hasAttribute("hidden")).toBe(false);
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    expect(controls.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("button", { name: /add/i })).toBeTruthy();
    window.localStorage.removeItem("token");
  });

  it("allows admin to delete a player", async () => {
    // mock token with admin privileges
    window.localStorage.setItem(
      "token",
      "x.eyJpc19hZG1pbiI6dHJ1ZX0.y"
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [{ id: "1", name: "Alice" }] }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 6,
          losses: 2,
          winPct: 0.75,
        })
      )
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [] }),
      });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const button = await screen.findByRole("button", { name: /delete/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/v0/players/1") &&
          (init as RequestInit | undefined)?.method === "DELETE"
      )
    ).toBe(true);
    window.localStorage.removeItem("token");
  });

  it("allows admin to toggle player visibility", async () => {
    window.localStorage.setItem("token", "x.eyJpc19hZG1pbiI6dHJ1ZX0.y");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [{ id: "1", name: "Alice", hidden: false }] }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 4,
          losses: 2,
          winPct: 0.67,
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1", name: "Alice", hidden: true }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 4,
          losses: 2,
          winPct: 0.67,
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1", name: "Alice", hidden: false }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 4,
          losses: 2,
          winPct: 0.67,
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const hideButton = await screen.findByRole("button", { name: /hide/i });
    await act(async () => {
      fireEvent.click(hideButton);
    });

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/v0/players/1/visibility") &&
          (init as RequestInit | undefined)?.method === "PATCH" &&
          (init as RequestInit | undefined)?.body === JSON.stringify({ hidden: true })
      )
    ).toBe(true);
    await screen.findByText(/hidden/i);

    const unhideButton = screen.getByRole("button", { name: /unhide/i });
    await act(async () => {
      fireEvent.click(unhideButton);
    });

    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/v0/players/1/visibility") &&
          (init as RequestInit | undefined)?.method === "PATCH"
      ).some(([, init]) => (init as RequestInit).body === JSON.stringify({ hidden: false }))
    ).toBe(true);
    window.localStorage.removeItem("token");
  });

  it("shows country selector for admins", async () => {
    window.localStorage.setItem("token", "x.eyJpc19hZG1pbiI6dHJ1ZX0.y");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [{ id: "1", name: "Alice" }] }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 2,
          losses: 1,
          winPct: 0.67,
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const select = await screen.findByLabelText("Country for Alice");
    expect(select).toBeTruthy();
    window.localStorage.removeItem("token");
  });

  it("updates player country via API", async () => {
    window.localStorage.setItem("token", "x.eyJpc19hZG1pbiI6dHJ1ZX0.y");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [{ id: "1", name: "Alice", country_code: null }],
        }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 1,
          losses: 0,
          winPct: 1,
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "1",
          name: "Alice",
          country_code: "US",
          location: "US",
          region_code: "NA",
          club_id: null,
        }),
      })
      .mockResolvedValueOnce(
        mockStatsResponse({
          playerId: "1",
          wins: 1,
          losses: 0,
          winPct: 1,
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const select = await screen.findByLabelText("Country for Alice");
    await act(async () => {
      fireEvent.change(select, { target: { value: "US" } });
      await Promise.resolve();
    });

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/v0/players/1/location") &&
          (init as RequestInit | undefined)?.method === "PATCH" &&
          (init as RequestInit | undefined)?.body === JSON.stringify({ country_code: "US" })
      )
    ).toBe(true);
    window.localStorage.removeItem("token");
  });
});
