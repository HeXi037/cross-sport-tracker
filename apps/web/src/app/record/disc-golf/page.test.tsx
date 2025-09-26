import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import RecordDiscGolfPage from "./page";

const useSearchParamsMock = vi.fn<URLSearchParams, []>();

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

const originalFetch = global.fetch;

describe("RecordDiscGolfPage", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("mid=m1"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).fetch;
    }
    useSearchParamsMock.mockReset();
  });

  it("posts hole events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

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

  it("shows an error and preserves input when an event submission fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordDiscGolfPage />);

    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "3" } });
    fireEvent.change(screen.getByPlaceholderText("B"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /record hole/i }));

    await screen.findByText("Failed to record event.");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Hole 1/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("A")).toHaveDisplayValue("3");
    expect(screen.getByPlaceholderText("B")).toHaveDisplayValue("4");
  });

  it("does not advance or clear inputs when the first submission fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordDiscGolfPage />);

    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("B"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /record hole/i }));

    await screen.findByText("Failed to record event.");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Hole 1/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("A")).toHaveDisplayValue("2");
    expect(screen.getByPlaceholderText("B")).toHaveDisplayValue("5");
  });

  it("disables recording guidance when no match id is provided", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());

    render(<RecordDiscGolfPage />);

    expect(
      screen.getByText(
        /select a match before recording scores\. open this page from a match scoreboard or include a match id in the link\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record hole/i })).toBeDisabled();
  });
});
