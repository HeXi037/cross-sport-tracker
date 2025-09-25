import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as bowlingSummary from "../../../lib/bowlingSummary";
import RecordSportPage from "./page";
import * as LocaleContext from "../../../lib/LocaleContext";

let sportParam = "padel";
let searchParamString = "";
const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ sport: sportParam }),
  useSearchParams: () => new URLSearchParams(searchParamString),
}));

describe("RecordSportPage", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    router.push.mockReset();
    router.replace.mockReset();
    vi.clearAllMocks();
    searchParamString = "";
  });

  it("redirects to the coming soon page when a sport is not implemented", async () => {
    sportParam = "badminton";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        "/record/coming-soon?sport=badminton",
      );
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects to the disc golf form when the slug uses underscores, preserving query params", async () => {
    sportParam = "disc_golf";
    searchParamString = "mid=123";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/record/disc-golf/?mid=123");
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("shows an Australian date format when the locale is en-AU", async () => {
    sportParam = "bowling";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    const localeSpy = vi
      .spyOn(LocaleContext, "useLocale")
      .mockReturnValue("en-AU");

    try {
      render(<RecordSportPage />);

      const dateInput = await screen.findByLabelText(/date/i);
      expect(dateInput).toHaveAttribute("placeholder", "dd/mm/yyyy");
      expect(screen.getByText("Format: dd/mm/yyyy")).toBeInTheDocument();
    } finally {
      localeSpy.mockRestore();
    }
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

  it("renders descriptive labels for each bowling roll", async () => {
    sportParam = "bowling";
    const players = [{ id: "1", name: "Alice" }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    expect(screen.getAllByText("Roll 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Roll 2").length).toBeGreaterThan(0);
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
