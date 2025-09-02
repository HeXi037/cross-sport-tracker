import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import PlayersPage from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("PlayersPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading message while fetching players", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    render(<PlayersPage />);

    expect(screen.getByText(/loading players/i)).toBeTruthy();
  });

  it("disables add button for blank names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    render(<PlayersPage />);

    const button = await screen.findByRole("button", { name: /add/i });
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    // Only initial load should trigger fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("filters players by search input", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        players: [
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
        ],
      }),
    });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    render(<PlayersPage />);
    await screen.findByText("Alice");
    vi.useFakeTimers();
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "bo" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.getByText("Bob")).toBeTruthy();
    vi.useRealTimers();
  });

  it("shows a message when no players match the search", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        players: [
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
        ],
      }),
    });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    render(<PlayersPage />);
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
});

