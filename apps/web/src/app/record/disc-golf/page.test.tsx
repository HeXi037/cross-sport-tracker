import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import RecordDiscGolfPage from "./page";

const useSearchParamsMock = vi.fn<URLSearchParams, []>();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
  useRouter: () => ({ push: pushMock }),
}));

const originalFetch = global.fetch;

describe("RecordDiscGolfPage", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("mid=m1"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    pushMock.mockReset();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).fetch;
    }
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

  it("disables recording guidance when no match id is provided", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] as const });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordDiscGolfPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(
        /start a new match or choose an existing disc golf match before recording hole scores\./i
      )
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /start new match/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record hole/i })).toBeDisabled();
  });

  it("creates a new match and enables scoring when requested", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "m-existing", sport: "disc_golf" },
          { id: "padel-1", sport: "padel" },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new-match" }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordDiscGolfPage />);

    fireEvent.click(await screen.findByRole("button", { name: /start new match/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v0/matches",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/record/disc-golf/?mid=new-match");
    });

    expect(
      screen.getByLabelText<HTMLInputElement>(/player a strokes/i)
    ).not.toBeDisabled();
    expect(
      screen.getByLabelText<HTMLInputElement>(/player b strokes/i)
    ).not.toBeDisabled();
  });

  it("allows selecting an existing match to enable recording", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "m-existing", sport: "disc_golf" },
          { id: "other", sport: "padel" },
        ],
      });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordDiscGolfPage />);

    const select = await screen.findByLabelText<HTMLSelectElement>(/existing match/i);
    fireEvent.change(select, { target: { value: "m-existing" } });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/record/disc-golf/?mid=m-existing");
    });

    expect(
      screen.getByLabelText<HTMLInputElement>(/player a strokes/i)
    ).not.toBeDisabled();
    expect(
      screen.getByLabelText<HTMLInputElement>(/player b strokes/i)
    ).not.toBeDisabled();
  });

  it("keeps the form interactive when an existing match id is provided", () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    render(<RecordDiscGolfPage />);

    expect(
      screen.getByLabelText<HTMLInputElement>(/player a strokes/i)
    ).not.toBeDisabled();
    expect(
      screen.getByLabelText<HTMLInputElement>(/player b strokes/i)
    ).not.toBeDisabled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
