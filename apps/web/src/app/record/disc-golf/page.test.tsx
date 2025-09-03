import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RecordDiscGolfPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("mid=m1"),
}));

describe("RecordDiscGolfPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts hole events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "3" } });
    fireEvent.change(screen.getByPlaceholderText("B"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /record hole/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payloads = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(payloads).toEqual([
      { type: "HOLE", side: "A", hole: 1, strokes: 3 },
      { type: "HOLE", side: "B", hole: 1, strokes: 4 },
    ]);
  });
});
