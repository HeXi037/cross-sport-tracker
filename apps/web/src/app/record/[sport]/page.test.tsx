import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RecordSportPage from "./page";

let sportParam = "padel";
const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ sport: sportParam }),
}));

describe("RecordSportPage", () => {
  afterEach(() => {
    router.push.mockReset();
    vi.clearAllMocks();
  });

  it("rejects duplicate player selections", async () => {
    sportParam = "padel";
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "1" } });
    fireEvent.change(selects[2], { target: { value: "2" } });
    fireEvent.change(selects[3], { target: { value: "3" } });

    fireEvent.change(screen.getByPlaceholderText("A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("B"), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText("Please select unique players.")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears partner ids when toggling back to singles", async () => {
    sportParam = "pickleball";

    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    // enable doubles and select players
    const toggle = screen.getByLabelText(/doubles/i);
    fireEvent.click(toggle);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "2" } });
    fireEvent.change(selects[2], { target: { value: "3" } });
    fireEvent.change(selects[3], { target: { value: "1" } });

    fireEvent.change(screen.getByPlaceholderText("A"), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByPlaceholderText("B"), {
      target: { value: "9" },
    });

    // switch back to singles
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.teamA).toEqual(["Alice"]);
    expect(payload.teamB).toEqual(["Cara"]);
  });

  it("submits numeric scores", async () => {
    sportParam = "padel";
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "2" } });
    fireEvent.change(selects[2], { target: { value: "3" } });
    fireEvent.change(selects[3], { target: { value: "4" } });

    fireEvent.change(screen.getByPlaceholderText("A"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByPlaceholderText("B"), {
      target: { value: "7" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.sets).toEqual([[5, 7]]);
  });

  it("allows recording multiple bowling players", async () => {
    sportParam = "bowling";
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    fireEvent.click(screen.getByText(/add player/i));
    fireEvent.click(screen.getByText(/add player/i));
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "2" } });
    fireEvent.change(selects[2], { target: { value: "3" } });

    const scoreInputs = screen.getAllByPlaceholderText(/score/i);
    fireEvent.change(scoreInputs[0], { target: { value: "100" } });
    fireEvent.change(scoreInputs[1], { target: { value: "120" } });
    fireEvent.change(scoreInputs[2], { target: { value: "90" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.participants).toEqual([
      { side: "A", playerIds: ["1"] },
      { side: "B", playerIds: ["2"] },
      { side: "C", playerIds: ["3"] },
    ]);
    expect(payload.score).toEqual([100, 120, 90]);
  });
});
