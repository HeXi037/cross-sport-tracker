import type { ReactNode } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import PlayersPage from "./page";
import ToastProvider from "../../components/ToastProvider";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function playerWithRecord(
  id: string,
  name: string,
  record?: { wins: number; losses: number; draws?: number; winPct: number }
) {
  if (!record) {
    return { id, name };
  }
  const { wins, losses, draws = 0, winPct } = record;
  return {
    id,
    name,
    match_summary: {
      wins,
      losses,
      draws,
      total: wins + losses + draws,
      winPct,
    },
  };
}

function renderWithProviders(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function setAdminSession() {
  const payload = {
    uid: "admin-id",
    username: "admin",
    is_admin: true,
    must_change_password: false,
  };
  const hint = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  document.cookie = `session_hint=${hint}; path=/`;
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
    document.cookie = "session_hint=; Max-Age=0; path=/";
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

  it("shows server specific messaging and recovery links when loading players fails", async () => {
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
    expect(alert.textContent).toMatch(/server error/i);
    const navigation = screen.getByRole("navigation", {
      name: /player loading recovery options/i,
    });
    expect(screen.getByRole("link", { name: /go back home/i })).toBeTruthy();
    const retry = screen.getByRole("button", {
      name: /retry/i,
    });
    await act(async () => {
      fireEvent.click(retry);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const toast = await screen.findByTestId("toast");
    expect(toast.textContent).toMatch(/server error/i);
    expect(navigation).toBeTruthy();
  });

  it("shows network specific messaging when loading players fails due to connectivity", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/network/i);
    expect(
      screen.getByRole("button", { name: /retry/i })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /go back home/i })).toBeTruthy();
    const toast = await screen.findByTestId("toast");
    expect(toast.textContent).toMatch(/network/i);
  });

  it("shows a timeout message with a retry option when loading players takes too long", async () => {
    vi.useFakeTimers();
    const abortError = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(abortError);
          });
        });
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    vi.useRealTimers();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/unable to load players/i);
    const retryButton = screen.getByRole("button", { name: /retry/i });

    await act(async () => {
      fireEvent.click(retryButton);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("disables add button for blank names", async () => {
    setAdminSession();
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
            playerWithRecord("1", "Alice", {
              wins: 3,
              losses: 1,
              winPct: 0.75,
            }),
            playerWithRecord("2", "Bob", {
              wins: 2,
              losses: 3,
              winPct: 0.4,
            }),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            playerWithRecord("2", "Bob", {
              wins: 2,
              losses: 3,
              winPct: 0.4,
            }),
          ],
        }),
      });
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

  it("guides users when their search returns no players", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            playerWithRecord("1", "Alice", {
              wins: 3,
              losses: 1,
              winPct: 0.75,
            }),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [] }),
      });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const search = screen.getByPlaceholderText(/search players/i);
    fireEvent.change(search, { target: { value: "Zo" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    const statuses = screen.getAllByRole("status");
    const status = statuses.find((el) =>
      el.textContent?.includes("No players match your search")
    );
    expect(status).toBeTruthy();
    expect(status?.textContent).toMatch(/no players match your search/i);
    expect(status?.textContent).toMatch(/remove filters/i);
    vi.useRealTimers();
  });

  it("offers a CTA when the roster is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const statuses = await screen.findAllByRole("status");
    const status = statuses.find((el) =>
      el.textContent?.includes("No players have been added yet")
    );
    expect(status).toBeTruthy();
    expect(status?.textContent).toMatch(/no players have been added yet/i);
    const cta = screen.getByRole("link", {
      name: /record a match to start building the roster/i,
    });
    expect(cta.getAttribute("href")).toBe("/record");
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
                  playerWithRecord("1", "Alice", {
                    wins: 1,
                    losses: 0,
                    winPct: 1,
                  }),
                  playerWithRecord("2", "Bob", {
                    wins: 0,
                    losses: 1,
                    winPct: 0,
                  }),
                ],
              }
            : {
                players: [
                  playerWithRecord("1", "Alice", {
                    wins: 1,
                    losses: 0,
                    winPct: 1,
                  }),
                ],
              };
        playersRequestIndex += 1;
        return {
          ok: true,
          json: async () => response,
        };
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
            playerWithRecord("1", "Albert", {
              wins: 5,
              losses: 2,
              winPct: 0.7142857143,
            }),
            playerWithRecord("2", "Bob", {
              wins: 4,
              losses: 1,
              winPct: 0.8,
            }),
          ],
        }),
      });
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
            playerWithRecord("1", "Alice", {
              wins: 1,
              losses: 2,
              winPct: 0.33,
            }),
            playerWithRecord("2", "Bob", {
              wins: 5,
              losses: 5,
              winPct: 0.5,
            }),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [] }),
      });
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
    const statuses = screen.getAllByRole("status");
    const status = statuses.find((el) =>
      el.textContent?.includes("No players match your search")
    );
    expect(status).toBeTruthy();
    expect(status?.textContent).toMatch(/no players match your search/i);
    expect(status?.textContent).toMatch(/remove filters/i);
    vi.useRealTimers();
  });

  it("shows a success message after adding a player", async () => {
    setAdminSession();
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

  it("indicates when a player has no recorded matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [{ id: "1", name: "Alice" }] }),
      });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    await screen.findByText("Alice");
    expect(await screen.findByText("No matches yet")).toBeTruthy();
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
      screen.getByText(/sign in as an admin to add players/i)
    ).toBeTruthy();
    const loginCta = screen.getByRole("link", { name: /login/i });
    expect(loginCta).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
    expect(screen.queryByTestId("player-create-controls")).toBeNull();
  });

  it("hides per-player admin controls for non-admin users", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            playerWithRecord("1", "Alice", {
              wins: 3,
              losses: 1,
              winPct: 0.75,
            }),
            playerWithRecord("2", "Bob", {
              wins: 1,
              losses: 2,
              winPct: 0.33,
            }),
          ],
        }),
      });
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
    setAdminSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    expect(screen.getByTestId("player-create-controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeTruthy();
  });

  it("allows admin to delete a player", async () => {
    setAdminSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            playerWithRecord("1", "Alice", {
              wins: 6,
              losses: 2,
              winPct: 0.75,
            }),
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [] }),
      });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const button = await screen.findByRole("button", { name: /^delete$/i });
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

  it("allows admin to hard delete a player", async () => {
    setAdminSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            playerWithRecord("1", "Alice", {
              wins: 6,
              losses: 2,
              winPct: 0.75,
            }),
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [] }),
      });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const button = await screen.findByRole("button", { name: /hard delete/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/v0/players/1?hard=true") &&
          (init as RequestInit | undefined)?.method === "DELETE"
      )
    ).toBe(true);
    window.localStorage.removeItem("token");
  });

  it("allows admin to toggle player visibility", async () => {
    setAdminSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            playerWithRecord("1", "Alice", {
              wins: 4,
              losses: 2,
              winPct: 0.67,
            }),
          ].map((player) => ({ ...player, hidden: false })),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1", name: "Alice", hidden: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1", name: "Alice", hidden: false }),
      });
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
    setAdminSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            playerWithRecord("1", "Alice", {
              wins: 2,
              losses: 1,
              winPct: 0.67,
            }),
          ],
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderWithProviders(<PlayersPage />);
    });

    const select = await screen.findByLabelText("Country for Alice");
    expect(select).toBeTruthy();
    window.localStorage.removeItem("token");
  });

  it("updates player country via API", async () => {
    setAdminSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            {
              ...playerWithRecord("1", "Alice", {
                wins: 1,
                losses: 0,
                winPct: 1,
              }),
              country_code: null,
            },
          ],
        }),
      })
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
      });
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
