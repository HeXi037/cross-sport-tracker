import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as Api from "../../../lib/api";
import type { ApiError } from "../../../lib/api";
import * as bowlingSummary from "../../../lib/bowlingSummary";
import * as LocaleContext from "../../../lib/LocaleContext";
import { rememberLoginRedirect } from "../../../lib/loginRedirect";
import * as NotificationCache from "../../../lib/useNotifications";
import { useSessionSnapshot } from "../../../lib/useSessionSnapshot";
import {
  getDateExample,
  getTimeExample,
  usesTwentyFourHourClock,
} from "../../../lib/i18n";
import RecordSportForm from "./RecordSportForm";
import { resolveRecordSportRoute } from "./resolveRecordSportRoute";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("../../../lib/loginRedirect", () => ({
  rememberLoginRedirect: vi.fn(),
}));

vi.mock("../../../lib/useSessionSnapshot", () => ({
  useSessionSnapshot: vi.fn(),
}));

const mockedUseSessionSnapshot = vi.mocked(useSessionSnapshot);
const mockedRememberLoginRedirect = vi.mocked(rememberLoginRedirect);

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
      params: { sport: "table_tennis" },
      searchParams: { mid: "123" },
    });

    expect(result).toEqual({
      type: "redirect",
      destination: "/record/table-tennis/?mid=123",
    });
  });

  it("redirects disc golf requests to the canonical trailing slash path", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "disc-golf" },
    });

    expect(result).toEqual({ type: "redirect", destination: "/record/disc-golf/" });
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
    mockedUseSessionSnapshot.mockReset();
    mockedUseSessionSnapshot.mockReturnValue({
      isAdmin: false,
      isLoggedIn: true,
      userId: "user-1",
    });
    mockedRememberLoginRedirect.mockReset();
  });

  afterEach(() => {
    router.push.mockReset();
    vi.clearAllMocks();
  });

  it("prompts anonymous users to log in before recording", () => {
    mockedUseSessionSnapshot.mockReturnValue({
      isAdmin: false,
      isLoggedIn: false,
      userId: null,
    });
    const apiFetchSpy = vi.spyOn(Api, "apiFetch");

    render(<RecordSportForm sportId="padel" />);

    expect(
      screen.getByText(
        "You need to be logged in to record matches. Please log in or sign up.",
      ),
    ).toBeInTheDocument();
    const loginLink = screen.getByRole("link", { name: /log in/i });
    expect(loginLink).toHaveAttribute("href", "/login");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(screen.getByLabelText(/date/i)).toBeDisabled();
    expect(apiFetchSpy).not.toHaveBeenCalled();

    apiFetchSpy.mockRestore();
  });

  it("redirects to login when loading players returns 401", async () => {
    const apiError = new Error("HTTP 401: Not authenticated") as ApiError;
    apiError.status = 401;
    const apiFetchSpy = vi
      .spyOn(Api, "apiFetch")
      .mockRejectedValueOnce(apiError);

    render(<RecordSportForm sportId="padel" />);

    await waitFor(() => {
      expect(mockedRememberLoginRedirect).toHaveBeenCalled();
    });
    expect(router.push).toHaveBeenCalledWith("/login");

    apiFetchSpy.mockRestore();
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
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      render(<RecordSportForm sportId="padel" />);

      await screen.findAllByText("Alice");

      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[0], { target: { value: "1" } });
      fireEvent.change(selects[1], { target: { value: "1" } });
      fireEvent.change(selects[2], { target: { value: "2" } });
      fireEvent.change(selects[3], { target: { value: "3" } });

      fireEvent.change(screen.getByLabelText(/team a score/i), {
        target: { value: "2" },
      });
      fireEvent.change(screen.getByLabelText(/team b score/i), {
        target: { value: "1" },
      });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(
        await screen.findByText("Please select unique players."),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("highlights duplicate player names returned by the API", async () => {
    const players = [
      { id: "1", name: "Alex Smith" },
      { id: "2", name: "Alex Smith" },
      { id: "3", name: "Beth Jones" },
      { id: "4", name: "Cara Lee" },
    ];
    const duplicateDetail = "duplicate players: Alex Smith";

    const fetchMock = vi
      .fn()
      .mockImplementation((input: RequestInfo, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.toString();
        if (url?.includes("/v0/players")) {
          return Promise.resolve({ ok: true, json: async () => ({ players }) });
        }
        if (url?.includes("/v0/matches/by-name")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                detail: duplicateDetail,
                code: "match_duplicate_players",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      render(<RecordSportForm sportId="padel" />);

      await screen.findAllByText("Alex Smith");

      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[0], { target: { value: "1" } });
      fireEvent.change(selects[1], { target: { value: "3" } });
      fireEvent.change(selects[2], { target: { value: "2" } });
      fireEvent.change(selects[3], { target: { value: "4" } });

      fireEvent.change(screen.getByLabelText(/team a score/i), {
        target: { value: "2" },
      });
      fireEvent.change(screen.getByLabelText(/team b score/i), {
        target: { value: "1" },
      });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(
        await screen.findByText(
          "Duplicate player names returned: Alex Smith. Each player name must be unique before saving.",
        ),
      ).toBeInTheDocument();
      expect(selects[0]).toHaveAttribute("aria-invalid", "true");
      expect(selects[2]).toHaveAttribute("aria-invalid", "true");
      expect(
        screen.getByText("Resolve duplicate player names before saving."),
      ).toBeInTheDocument();
    } finally {
      consoleErrorSpy.mockRestore();
      global.fetch = originalFetch;
    }
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
      expect(
        screen.getByText("Date format follows your profile preferences.")
      ).toBeInTheDocument();

      const expectedTimeExample = getTimeExample("en-AU");
      expect(
        screen.getByText((content) =>
          content.includes(`Example: ${expectedTimeExample}`)
        )
      ).toBeInTheDocument();
      if (!usesTwentyFourHourClock("en-AU")) {
        expect(
          screen.getByText((content) => content.includes("include AM or PM"))
        ).toBeInTheDocument();
      }
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
      expect(
        screen.getByText("Date format follows your profile preferences.")
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
      if (usesTwentyFourHourClock("de-DE")) {
        expect(
          screen.getByText((content) =>
            content.includes(`Example: ${expectedTimeExample}`) &&
            !content.includes("include AM or PM")
          )
        ).toBeInTheDocument();
      }
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
    const doublesRadio = screen.getByLabelText(/doubles/i);
    fireEvent.click(doublesRadio);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "2" } });
    fireEvent.change(selects[2], { target: { value: "3" } });
    fireEvent.change(selects[3], { target: { value: "1" } });

    fireEvent.change(screen.getByLabelText(/game 1.*team a points/i), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText(/game 1.*team b points/i), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByLabelText(/game 2.*team a points/i), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText(/game 2.*team b points/i), {
      target: { value: "8" },
    });

    // switch back to singles
    const singlesRadio = screen.getByLabelText(/singles/i);
    fireEvent.click(singlesRadio);
    await waitFor(() => expect(singlesRadio).toBeChecked());
    expect(doublesRadio).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.teamA).toEqual(["Alice"]);
    expect(payload.teamB).toEqual(["Cara"]);
  });

  it("lets padel matches switch between singles and doubles", async () => {
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="padel" />);

    await screen.findAllByText("Alice");

    const singlesRadio = screen.getByLabelText(/singles/i);
    const doublesRadio = screen.getByLabelText(/doubles/i);
    expect(doublesRadio).toBeChecked();
    expect(singlesRadio).not.toBeChecked();

    fireEvent.click(singlesRadio);
    await waitFor(() => expect(singlesRadio).toBeChecked());
    expect(doublesRadio).not.toBeChecked();
    expect(screen.queryByLabelText(/team a player 2/i)).not.toBeInTheDocument();

    fireEvent.click(doublesRadio);
    await waitFor(() => expect(doublesRadio).toBeChecked());
    expect(screen.getByLabelText(/team a player 2/i)).toBeInTheDocument();
  });

  it("always records padel Americano ties as doubles", async () => {
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="padel_americano" />);

    await screen.findAllByText("Alice");

    expect(screen.queryByLabelText(/singles/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/doubles/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/team a player 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/team b player 2/i)).toBeInTheDocument();
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
    const invalidateSpy = vi
      .spyOn(NotificationCache, "invalidateNotificationsCache")
      .mockResolvedValue();

    try {
      render(<RecordSportForm sportId="padel" />);

      await screen.findAllByText("Alice");

      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[0], { target: { value: "1" } });
      fireEvent.change(selects[1], { target: { value: "2" } });
      fireEvent.change(selects[2], { target: { value: "3" } });
      fireEvent.change(selects[3], { target: { value: "4" } });

      fireEvent.change(screen.getByLabelText(/team a score/i), {
        target: { value: "2" },
      });
      fireEvent.change(screen.getByLabelText(/team b score/i), {
        target: { value: "1" },
      });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(payload.sets).toEqual([[2, 1]]);
      expect(typeof payload.sets[0][0]).toBe("number");
      expect(typeof payload.sets[0][1]).toBe("number");
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    } finally {
      invalidateSpy.mockRestore();
    }
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

    fireEvent.change(screen.getByLabelText(/game 1.*team a points/i), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText(/game 1.*team b points/i), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByLabelText(/game 2.*team a points/i), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText(/game 2.*team b points/i), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText(/game 3.*team a points/i), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText(/game 3.*team b points/i), {
      target: { value: "7" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.sport).toBe("table_tennis");
  });

  it("lets table tennis matches switch between singles and doubles", async () => {
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="table_tennis" />);

    await screen.findAllByText("Alice");
    expect(screen.queryByLabelText(/team a player 2/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/doubles/i));
    expect(
      await screen.findByLabelText(/team a player 2/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/singles/i));
    await waitFor(() =>
      expect(screen.queryByLabelText(/team a player 2/i)).not.toBeInTheDocument(),
    );
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
    fireEvent.blur(secondRoll);

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
