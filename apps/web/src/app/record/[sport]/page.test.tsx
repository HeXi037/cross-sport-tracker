import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as bowlingSummary from "../../../lib/bowlingSummary";
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
    expect(typeof payload.sets[0][0]).toBe("number");
    expect(typeof payload.sets[0][1]).toBe("number");
  });

  it("sends the canonical sport id when the route uses a dashed slug", async () => {
    sportParam = "table-tennis";
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

    fireEvent.change(screen.getByLabelText(/team a player 1/i), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText(/team b player 1/i), {
      target: { value: "3" },
    });

    fireEvent.change(screen.getByPlaceholderText("A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("B"), {
      target: { value: "8" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.sport).toBe("table_tennis");
  });

  it("allows recording multiple bowling players", async () => {
    sportParam = "bowling";
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
    ];

    const totalsByPlayer: Record<string, number> = {
      Alice: 100,
      Bob: 120,
      Cara: 90,
    };
    const summarizeSpy = vi
      .spyOn(bowlingSummary, "summarizeBowlingInput")
      .mockImplementation((_, options) => {
        const total = totalsByPlayer[options.playerLabel] ?? 0;
        return {
          frames: Array.from({ length: 10 }, () => [0, 0]),
          frameScores: Array.from({ length: 10 }, () => total),
          total,
        };
      });

    try {
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

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(payload.participants).toEqual([
        { side: "A", playerIds: ["1"] },
        { side: "B", playerIds: ["2"] },
        { side: "C", playerIds: ["3"] },
      ]);
      expect(payload.score).toEqual([100, 120, 90]);
      expect(payload.details.players).toEqual([
        expect.objectContaining({
          side: "A",
          playerId: "1",
          playerName: "Alice",
          total: 100,
        }),
        expect.objectContaining({
          side: "B",
          playerId: "2",
          playerName: "Bob",
          total: 120,
        }),
        expect.objectContaining({
          side: "C",
          playerId: "3",
          playerName: "Cara",
          total: 90,
        }),
      ]);
    } finally {
      summarizeSpy.mockRestore();
    }
  });

  it("validates bowling frames as rolls are entered", async () => {
    sportParam = "bowling";
    const players = [{ id: "1", name: "Alice" }];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "1" } });

    const playerName = players[0].name;
    const firstRoll = screen.getByLabelText(
      `${playerName} frame 1 roll 1`
    );
    const secondRoll = screen.getByLabelText(
      `${playerName} frame 1 roll 2`
    );

    fireEvent.change(firstRoll, { target: { value: "10" } });
    expect((secondRoll as HTMLInputElement).value).toBe("");

    fireEvent.change(secondRoll, { target: { value: "5" } });

    expect((secondRoll as HTMLInputElement).value).toBe("");
    expect(
      screen.getByText(
        `${playerName} – Frame 1: leave roll 2 empty after a strike.`
      )
    ).toBeInTheDocument();

    fireEvent.change(firstRoll, { target: { value: "4" } });
    fireEvent.change(secondRoll, { target: { value: "6" } });

    await waitFor(() =>
      expect(
        screen.queryByText(
          `${playerName} – Frame 1: leave roll 2 empty after a strike.`
        )
      ).not.toBeInTheDocument()
    );
  });

  it("shows bowling frame totals once all rolls are complete", async () => {
    sportParam = "bowling";
    const players = [{ id: "1", name: "Alice" }];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "1" } });

    const playerName = players[0].name;

    for (let frame = 1; frame <= 9; frame += 1) {
      const roll1 = screen.getByLabelText(
        `${playerName} frame ${frame} roll 1`
      );
      const roll2 = screen.getByLabelText(
        `${playerName} frame ${frame} roll 2`
      );
      fireEvent.change(roll1, { target: { value: "3" } });
      fireEvent.change(roll2, { target: { value: "4" } });
    }

    const finalRoll1 = screen.getByLabelText(
      `${playerName} frame 10 roll 1`
    );
    const finalRoll2 = screen.getByLabelText(
      `${playerName} frame 10 roll 2`
    );
    fireEvent.change(finalRoll1, { target: { value: "3" } });
    fireEvent.change(finalRoll2, { target: { value: "4" } });

    const firstFrameTotal = await screen.findByRole("status", {
      name: `${playerName} frame 1 total`,
    });
    expect(firstFrameTotal).toHaveTextContent("Total: 7");

    const finalFrameTotal = await screen.findByRole("status", {
      name: `${playerName} frame 10 total`,
    });
    expect(finalFrameTotal).toHaveTextContent("Total: 70");

    expect(
      screen.getByText("Total: 70", { selector: ".bowling-total-preview" })
    ).toBeInTheDocument();
  });
});
