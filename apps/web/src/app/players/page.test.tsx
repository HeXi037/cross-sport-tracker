import type { ReactNode } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("PlayersPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading message while fetching players", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    global.fetch = fetchMock as typeof fetch;
    const { default: PlayersPage } = await import("./page");
    render(<PlayersPage />);

    expect(screen.getByText(/loading players/i)).toBeTruthy();
  });

  it("disables add button for blank names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [], total: 0, limit: 25, offset: 0 }),
      });
    global.fetch = fetchMock as typeof fetch;
    const { default: PlayersPage } = await import("./page");
    render(<PlayersPage />);

    const button = await screen.findByRole("button", { name: /add/i });
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    // Only initial load should trigger fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.skip("filters players by search input", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "1", name: "Alice" },
            { id: "2", name: "Bob" },
          ],
          total: 2,
          limit: 25,
          offset: 0,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [{ id: "2", name: "Bob" }],
          total: 1,
          limit: 25,
          offset: 0,
        }),
      })
      .mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) });
    global.fetch = fetchMock as typeof fetch;
    const { default: PlayersPage } = await import("./page");
    render(<PlayersPage />);
    await screen.findByText("Alice");
    vi.useFakeTimers();
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "bo" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await screen.findByText("Bob");
    expect(screen.queryByText("Alice")).toBeNull();
    vi.useRealTimers();
  });

  it.skip("filters out Albert accounts", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        players: [
          { id: "1", name: "Albert" },
          { id: "2", name: "Bob" },
        ],
        total: 2,
        limit: 25,
        offset: 0,
      }),
    });
    global.fetch = fetchMock as typeof fetch;
    const { default: PlayersPage } = await import("./page");
    render(<PlayersPage />);

    expect(screen.queryByText("Albert")).toBeNull();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it.skip("shows a message when no players match the search", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "1", name: "Alice" },
            { id: "2", name: "Bob" },
          ],
          total: 2,
          limit: 25,
          offset: 0,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [], total: 0, limit: 25, offset: 0 }),
      })
      .mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) });
    global.fetch = fetchMock as typeof fetch;
    const { default: PlayersPage } = await import("./page");
    render(<PlayersPage />);
    await screen.findByText("Alice");
    vi.useFakeTimers();
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "zo" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await screen.findByText(/no players found/i);
    vi.useRealTimers();
  });

  it("shows a success message after adding a player", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [], total: 0, limit: 25, offset: 0 }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "1" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [], total: 0, limit: 25, offset: 0 }),
      });
    global.fetch = fetchMock as typeof fetch;
    const { default: PlayersPage } = await import("./page");
    vi.useFakeTimers();
    render(<PlayersPage />);

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

  it.skip("allows admin to delete a player", async () => {
    // mock token with admin privileges
    window.localStorage.setItem(
      "token",
      "x.eyJpc19hZG1pbiI6dHJ1ZX0.y"
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [{ id: "1", name: "Alice" }],
          total: 1,
          limit: 25,
          offset: 0,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [] }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [], total: 0, limit: 25, offset: 0 }),
      });
    global.fetch = fetchMock as typeof fetch;
    const { default: PlayersPage } = await import("./page");
    render(<PlayersPage />);

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
});
