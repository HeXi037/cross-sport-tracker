import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as bowlingSummary from "../../../lib/bowlingSummary";
import * as LocaleContext from "../../../lib/LocaleContext";
import { getDateExample, getTimeExample } from "../../../lib/i18n";
import RecordSportForm from "./RecordSportForm";
import { resolveRecordSportRoute } from "./resolveRecordSportRoute";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

describe("resolveRecordSportRoute", () => {
  afterEach(() => {
    router.push.mockReset();
  });

  it("redirects to the coming soon page when a sport is not implemented", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "badminton" },
      searchParams: { mid: "123" },
    });

    expect(result.type).toBe("redirect");
    if (result.type === "redirect") {
      const url = new URL(result.destination, "https://example.com");
      expect(url.pathname).toBe("/record/coming-soon");
      expect(url.searchParams.get("sport")).toBe("badminton");
      expect(url.searchParams.get("mid")).toBe("123");
    }
  });

  it("redirects to the canonical slug when underscores are used, preserving query params", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "disc_golf" },
      searchParams: { mid: "123" },
    });

    expect(result).toEqual({
      type: "redirect",
      destination: "/record/disc-golf/?mid=123",
    });
  });

  it("redirects disc golf requests to the custom form", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "disc-golf" },
      searchParams: { mid: "7" },
    });

    expect(result).toEqual({
      type: "redirect",
      destination: "/record/disc-golf/?mid=7",
    });
  });

  it("redirects padel Americano requests using underscores to the canonical slug", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "padel_americano" },
    });

    expect(result).toEqual({
      type: "redirect",
      destination: "/record/padel-americano/",
    });
  });

  it("returns not-found for an unknown sport", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "archery" },
    });

    expect(result).toEqual({ type: "not-found" });
  });

  it("renders the dynamic form for implemented sports", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "padel" },
    });

    expect(result).toEqual({ type: "render", sportId: "padel" });
  });

  it("renders the dynamic form for padel Americano", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "padel-americano" },
    });

    expect(result).toEqual({ type: "render", sportId: "padel_americano" });
  });
});

describe("RecordSportForm", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    router.push.mockReset();
    vi.clearAllMocks();
  });

  it("rejects duplicate player selections", async () => {
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

    render(<RecordSportForm sportId="padel" />);

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
      await screen.findByText("Please select unique players."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows an Australian date format when the locale is en-AU", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    const localeSpy = vi
      .spyOn(LocaleContext, "useLocale")
      .mockReturnValue("en-AU");

    try {
      render(<RecordSportForm sportId="bowling" />);

      const dateInput = await screen.findByLabelText(/date/i);
      expect(dateInput).toHaveAttribute("placeholder", "DD/MM/YYYY");
      const expectedDateExample = getDateExample("en-AU");
      expect(
        screen.getByText(`Example: ${expectedDateExample}`)
      ).toBeInTheDocument();

      const expectedTimeExample = getTimeExample("en-AU");
      expect(
        screen.getByText((content) =>
          content.includes(`Example: ${expectedTimeExample}`)
        )
      ).toBeInTheDocument();
    } finally {
      localeSpy.mockRestore();
    }
  });

  it("uses European date placeholders and 24-hour time when locale is de-DE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    const localeSpy = vi
      .spyOn(LocaleContext, "useLocale")
      .mockReturnValue("de-DE");

    try {
      render(<RecordSportForm sportId="padel" />);

      const dateInput = await screen.findByLabelText(/date/i);
      expect(dateInput).toHaveAttribute("placeholder", "DD/MM/YYYY");
      const expectedDateExample = getDateExample("de-DE");
      expect(
        screen.getByText(`Example: ${expectedDateExample}`)
      ).toBeInTheDocument();

      const timeInput = await screen.findByLabelText(/start time/i);
      expect(timeInput).not.toHaveAttribute("placeholder");
      expect(timeInput).toHaveAttribute("inputmode", "numeric");
      expect(timeInput).toHaveAttribute(
        "pattern",
        "([01][0-9]|2[0-3]):[0-5][0-9]",
      );
      expect(timeInput).toHaveAttribute("step", "60");
      const expectedTimeExample = getTimeExample("de-DE");
      expect(
        screen.getByText((content) =>
          content.includes(`Example: ${expectedTimeExample}`)
        )
      ).toBeInTheDocument();
    } finally {
      localeSpy.mockRestore();
    }
  });

  it("clears partner ids when toggling back to singles", async () => {
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

    render(<RecordSportForm sportId="pickleball" />);

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

    render(<RecordSportForm sportId="padel" />);

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

    render(<RecordSportForm sportId="table_tennis" />);

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

      render(<RecordSportForm sportId="bowling" />);

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
    const players = [{ id: "1", name: "Alice" }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="bowling" />);

    await screen.findAllByText("Alice");

    expect(screen.getAllByText("Roll 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Roll 2").length).toBeGreaterThan(0);
  });

  it("validates bowling frames as rolls are entered", async () => {
    const players = [{ id: "1", name: "Alice" }];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="bowling" />);

    await screen.findAllByText("Alice");

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "1" } });

    const playerName = players[0].name;
    const firstRoll = screen.getByLabelText(`${playerName} frame 1 roll 1`);
    const secondRoll = screen.getByLabelText(`${playerName} frame 1 roll 2`);

    fireEvent.change(firstRoll, { target: { value: "10" } });
    expect((secondRoll as HTMLInputElement).value).toBe("");

    fireEvent.change(secondRoll, { target: { value: "5" } });

    expect((secondRoll as HTMLInputElement).value).toBe("");
    expect(
      screen.getByText(
        `${playerName} – Frame 1: leave roll 2 empty after a strike.`,
      ),
    ).toBeInTheDocument();

    fireEvent.change(firstRoll, { target: { value: "4" } });
    fireEvent.change(secondRoll, { target: { value: "6" } });

    await waitFor(() =>
      expect(
        screen.queryByText(
          `${playerName} – Frame 1: leave roll 2 empty after a strike.`,
        ),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows bowling frame totals once all rolls are complete", async () => {
    const players = [{ id: "1", name: "Alice" }];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="bowling" />);

    await screen.findAllByText("Alice");

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "1" } });

    const playerName = players[0].name;

    for (let frame = 1; frame <= 9; frame += 1) {
      const roll1 = screen.getByLabelText(`${playerName} frame ${frame} roll 1`);
      const roll2 = screen.getByLabelText(`${playerName} frame ${frame} roll 2`);
      fireEvent.change(roll1, { target: { value: "3" } });
      fireEvent.change(roll2, { target: { value: "4" } });
    }

    const finalRoll1 = screen.getByLabelText(`${playerName} frame 10 roll 1`);
    const finalRoll2 = screen.getByLabelText(`${playerName} frame 10 roll 2`);
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
      screen.getByText("Total: 70", { selector: ".bowling-total-preview" }),
    ).toBeInTheDocument();
  });
});
