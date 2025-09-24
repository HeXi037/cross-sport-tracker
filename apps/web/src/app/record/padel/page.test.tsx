import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RecordPadelPage from "./page";

const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const originalFetch = global.fetch;

describe("RecordPadelPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).fetch;
    }
    window.localStorage.clear();
  });

  it("creates match and records set scores", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "p1", name: "A" },
            { id: "p2", name: "B" },
            { id: "p3", name: "C" },
            { id: "p4", name: "D" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "m1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByPlaceholderText("Location"), {
      target: { value: "Center Court" },
    });

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Player A 2"), {
      target: { value: "p2" },
    });
    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p3" },
    });
    fireEvent.change(screen.getByLabelText("Player B 2"), {
      target: { value: "p4" },
    });

    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Court 1" },
    });

    fireEvent.change(screen.getByPlaceholderText("Set 1 A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 1 B"), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add set/i }));

    fireEvent.change(screen.getByPlaceholderText("Set 2 A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 2 B"), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/match recorded/i),
    );
    const createPayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    const setsPayload = JSON.parse(fetchMock.mock.calls[2][1].body);

    expect(createPayload).toMatchObject({
      sport: "padel",
      bestOf: 3,
      participants: [
        { side: "A", playerIds: ["p1", "p2"] },
        { side: "B", playerIds: ["p3", "p4"] },
      ],
      location: "Court 1",
    });
    expect(setsPayload).toEqual({
      sets: [
        { A: 6, B: 4 },
        { A: 6, B: 2 },
      ],
    });
  });

  it("rejects submission with empty sides", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "p1", name: "A" },
            { id: "p2", name: "B" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "m1" }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "p1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /select at least one player for each side/i,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("rejects duplicate player selections", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "p1", name: "A" },
            { id: "p2", name: "B" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "m1" }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /please select unique players/i,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("validates incomplete set scores before submission", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "p1", name: "A" },
            { id: "p2", name: "B" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "m1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p2" },
    });

    fireEvent.change(screen.getByPlaceholderText("Set 1 A"), {
      target: { value: "6" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Set 1 is incomplete/i),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("Set 1 A")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByPlaceholderText("Set 1 B")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText("Set 1 B"), {
      target: { value: "4" },
    });

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Set 1 A")).not.toHaveAttribute("aria-invalid"),
    );
    expect(screen.getByPlaceholderText("Set 1 B")).not.toHaveAttribute("aria-invalid");

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("shows an error when saving the match fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "p1", name: "A" },
            { id: "p2", name: "B" },
          ],
        }),
      })
      .mockRejectedValueOnce(new Error("Network error"));
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /failed to save match/i,
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).toBeEnabled(),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("includes auth token in API requests", async () => {
    window.localStorage.setItem("token", "tkn");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "p1", name: "A" },
            { id: "p2", name: "B" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "m1" }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fetchMock.mock.calls.forEach(([, init]) => {
      const headers = init?.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer tkn");
    });
  });

  it("shows error on unauthorized players request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /failed to load players/i,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
