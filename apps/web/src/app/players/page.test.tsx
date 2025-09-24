import type { ReactNode } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import PlayersPage from "./page";
import { ToastProvider } from "../../lib/toast";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderWithProviders(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

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

describe("PlayersPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("shows a loading message while fetching players", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    expect(screen.getByText(/loading players/i)).toBeTruthy();
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
      );
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });
    await screen.findByText("Alice");
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

  it("shows stats unavailable when the stats API returns an empty summary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [{ id: "1", name: "Alice" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          playerId: "1",
          matchSummary: { wins: 0, losses: 0, draws: 0, total: 0, winPct: 0 },
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(await screen.findByText(/stats unavailable/i)).toBeTruthy();
  });

  it("surfaces a toast when loading stats fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [{ id: "1", name: "Alice" }] }),
      })
      .mockRejectedValueOnce(new Error("network error"));
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(await screen.findByText(/stats unavailable/i)).toBeTruthy();
    const statusMessages = await screen.findAllByRole("status");
    expect(
      statusMessages.some((element) =>
        /player stats failed to load\. displayed records may be incomplete\./i.test(
          element.textContent ?? ""
        )
      )
    ).toBe(true);
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
