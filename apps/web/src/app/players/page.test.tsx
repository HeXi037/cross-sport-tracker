import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("disables add button for blank names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    render(<PlayersPage />);

    const button = screen.getByRole("button", { name: /add/i });
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    // Only initial load should trigger fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

