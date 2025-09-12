import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RecordPadelPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("RecordPadelPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    await waitFor(() => screen.getByLabelText("Player A1"));

    fireEvent.change(screen.getByPlaceholderText("Location"), {
      target: { value: "Center Court" },
    });

    fireEvent.change(screen.getByLabelText("Player A1"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Player A2"), {
      target: { value: "p2" },
    });
    fireEvent.change(screen.getByLabelText("Player B1"), {
      target: { value: "p3" },
    });
    fireEvent.change(screen.getByLabelText("Player B2"), {
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
      });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A1"));

    fireEvent.change(screen.getByLabelText("Player A1"), {
      target: { value: "p1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /select at least one player for each side/i,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
