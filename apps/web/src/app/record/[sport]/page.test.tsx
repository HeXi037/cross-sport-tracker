import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as Api from "../../../lib/api";
import type { ApiError } from "../../../lib/api";
import * as bowlingSummary from "../../../lib/bowlingSummary";
import * as LocaleContext from "../../../lib/LocaleContext";
import { rememberLoginRedirect } from "../../../lib/loginRedirect";
import * as NotificationCache from "../../../lib/useNotifications";
import * as MatchCache from "../../../lib/useApiSWR";
import { useSessionSnapshot } from "../../../lib/useSessionSnapshot";
import * as datetime from "../../../lib/datetime";
import {
  getDateExample,
  getTimeExample,
} from "../../../lib/i18n";
import { saveUserSettings } from "../../user-settings";
import RecordSportForm, { getBowlingRollAriaLabel } from "./RecordSportForm";
import { resolveRecordSportRoute } from "./resolveRecordSportRoute";
import enMessages from "../../../messages/en-GB.json";

const router = { push: vi.fn() };

function translate(namespace: string | undefined, key: string): string {
  const path = namespace ? `${namespace}.${key}` : key;
  return path.split(".").reduce((acc: unknown, segment) => {
    if (typeof acc !== "object" || acc === null) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[segment];
  }, enMessages as unknown) as string | undefined;
}

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) =>
    (key: string) => translate(namespace, key) ?? `${namespace ? `${namespace}.` : ""}${key}`,
}));

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

function getPlayerSelects() {
  return screen
    .getAllByRole("combobox")
    .filter((element) => element.id.startsWith("record-player"));
}

function bowlingRollLabel(playerName: string, frame: number, roll: number) {
  return getBowlingRollAriaLabel(playerName, frame - 1, roll - 1);
}

function getBowlingRollInput(playerName: string, frame: number, roll: number) {
  return screen.getByRole("textbox", {
    name: bowlingRollLabel(playerName, frame, roll),
  });
}

describe("resolveRecordSportRoute", () => {
  afterEach(() => {
    router.push.mockReset();
  });

  it("renders implemented racket sports like badminton", () => {
    const result = resolveRecordSportRoute({
      params: { sport: "badminton" },
      searchParams: { mid: "123" },
    });

    expect(result).toEqual({ type: "render", sportId: "badminton" });
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
  let fetchClubsSpy: vi.SpyInstance<
    [init?: Api.ApiRequestInit | undefined],
    Promise<Api.ClubSummary[]>
  >;

  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedUseSessionSnapshot.mockReset();
    mockedUseSessionSnapshot.mockReturnValue({
      isAdmin: false,
      isLoggedIn: true,
      userId: "user-1",
    });
    mockedRememberLoginRedirect.mockReset();
    fetchClubsSpy = vi.spyOn(Api, "fetchClubs").mockResolvedValue([]);
  });

  afterEach(() => {
    router.push.mockReset();
    fetchClubsSpy.mockRestore();
    window.localStorage.clear();
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

      const selects = getPlayerSelects();
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

      const selects = getPlayerSelects();
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
      expect(
        screen.getByText((content) =>
          content.includes(`Example: ${expectedTimeExample}`) &&
          !content.includes("include AM or PM")
        )
      ).toBeInTheDocument();
    } finally {
      localeSpy.mockRestore();
    }
  });

  it("shows AM/PM guidance when time format preference is set", async () => {
    saveUserSettings({ preferredTimeFormat: "am-pm" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    const localeSpy = vi
      .spyOn(LocaleContext, "useLocale")
      .mockReturnValue("en-AU");

    try {
      render(<RecordSportForm sportId="bowling" />);

      const expectedTimeExample = getTimeExample("en-AU", "am-pm");
      expect(
        screen.getByText((content) =>
          content.includes(`Example: ${expectedTimeExample}`) &&
          content.includes("include AM or PM")
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
      expect(
        screen.getByText((content) =>
          content.includes(`Example: ${expectedTimeExample}`) &&
          !content.includes("include AM or PM")
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
    const doublesRadio = screen.getByLabelText(/doubles/i);
    fireEvent.click(doublesRadio);
    const selects = getPlayerSelects();
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

  it("defaults to today's date and the rounded current time slot", async () => {
    const dateSpy = vi
      .spyOn(datetime, "getTodayDateInputValue")
      .mockReturnValue("2024-05-10");
    const timeSpy = vi
      .spyOn(datetime, "getCurrentRoundedTimeSlot")
      .mockReturnValue("10:00");

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players: [] }) });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      render(<RecordSportForm sportId="padel" />);

      const dateInput = (await screen.findByLabelText(/date/i)) as HTMLInputElement;
      const timeInput = screen.getByLabelText(/start time/i) as HTMLInputElement;

      expect(dateInput.value).toBe("2024-05-10");
      expect(timeInput.value).toBe("10:00");

      fireEvent.change(dateInput, { target: { value: "2024-05-11" } });
      fireEvent.change(timeInput, { target: { value: "12:30" } });

      fireEvent.click(screen.getByRole("button", { name: /today/i }));
      fireEvent.click(screen.getByRole("button", { name: /now/i }));

      expect(dateInput.value).toBe("2024-05-10");
      expect(timeInput.value).toBe("10:00");
    } finally {
      dateSpy.mockRestore();
      timeSpy.mockRestore();
      global.fetch = originalFetch;
    }
  });

  it("prefills the club from the user's profile and hides the location input", async () => {
    const players = [
      { id: "user-1", name: "Home Player", club_id: "club-9" },
      { id: "2", name: "Friend" },
    ];

    fetchClubsSpy.mockResolvedValue([{ id: "club-9", name: "Home Club" }]);

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players }) });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      render(<RecordSportForm sportId="padel_americano" />);

      await screen.findAllByText("Home Player");

      expect(screen.queryByLabelText(/location/i)).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Played at club", { selector: "select" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /change/i }));

      const clubSelect = await screen.findByLabelText("Played at club", {
        selector: "select",
      });
      fireEvent.change(clubSelect, { target: { value: "" } });

      expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("stores padel Americano session details and keeps them after saving", async () => {
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];
    const clubs = [
      { id: "club-1", name: "Centre Court" },
      { id: "club-2", name: "City Club" },
    ];

    fetchClubsSpy.mockResolvedValue(clubs);

    const fetchMock = vi.fn().mockImplementation(
      (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.toString();
        if (url?.includes("/v0/players")) {
          return Promise.resolve({ ok: true, json: async () => ({ players }) });
        }
        if (url?.includes("/v0/matches/by-name")) {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      },
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    const matchesCacheSpy = vi
      .spyOn(MatchCache, "invalidateMatchesCache")
      .mockResolvedValue();
    const notificationsSpy = vi
      .spyOn(NotificationCache, "invalidateNotificationsCache")
      .mockResolvedValue();

    try {
      render(<RecordSportForm sportId="padel_americano" />);

      await screen.findAllByText("Alice");

      const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2024-08-10" } });
      const timeInput = screen.getByLabelText(/start time/i) as HTMLInputElement;
      fireEvent.change(timeInput, { target: { value: "18:30" } });
      const locationInput = screen.getByLabelText(/location/i) as HTMLInputElement;
      fireEvent.change(locationInput, { target: { value: "Court 5" } });
      const friendlyCheckbox = screen.getByLabelText(/mark as friendly/i);
      fireEvent.click(friendlyCheckbox);

      const clubSelect = screen.getByLabelText("Played at club", {
        selector: "select",
      }) as HTMLSelectElement;
      await waitFor(() => expect(clubSelect.options.length).toBeGreaterThan(1));
      fireEvent.change(clubSelect, { target: { value: "club-1" } });

      const selects = screen.getAllByRole("combobox").filter((element) =>
        element.id.startsWith("record-player"),
      );
      fireEvent.change(selects[0], { target: { value: "1" } });
      fireEvent.change(selects[1], { target: { value: "2" } });
      fireEvent.change(selects[2], { target: { value: "3" } });
      fireEvent.change(selects[3], { target: { value: "4" } });

      fireEvent.change(screen.getByLabelText(/team a score/i), {
        target: { value: "24" },
      });
      fireEvent.change(screen.getByLabelText(/team b score/i), {
        target: { value: "8" },
      });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(
        await screen.findByText(
          "Padel Americano tie saved. Update the players and scores to record the next tie.",
        ),
      ).toBeInTheDocument();

      expect(router.push).not.toHaveBeenCalledWith("/matches");

      expect(clubSelect).toHaveValue("club-1");
      expect(dateInput.value).toBe("2024-08-10");
      expect(timeInput.value).toBe("18:30");
      expect(locationInput.value).toBe("Court 5");
      expect(screen.getByLabelText(/mark as friendly/i)).toBeChecked();
      expect(screen.getByLabelText(/team a player 1/i)).toHaveValue("");
      expect(screen.getByLabelText(/team a player 2/i)).toHaveValue("");
      expect(screen.getByLabelText(/team b player 1/i)).toHaveValue("");
      expect(screen.getByLabelText(/team b player 2/i)).toHaveValue("");
      expect(screen.getByLabelText(/team a score/i)).toHaveValue(0);
      expect(screen.getByLabelText(/team b score/i)).toHaveValue(0);

      const stored = window.localStorage.getItem(
        "record:padel-americano:defaults",
      );
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored ?? "{}");
      expect(parsed).toMatchObject({
        date: "2024-08-10",
        time: "18:30",
        isFriendly: true,
        clubId: "club-1",
        tieTarget: "32",
      });
      expect(parsed.location ?? "").toBe("");

      const payloadCall = fetchMock.mock.calls.find(([request]) =>
        (typeof request === "string" ? request : request.toString()).includes(
          "/v0/matches/by-name",
        ),
      );
      expect(payloadCall).toBeDefined();
      const body = payloadCall?.[1]?.body;
      expect(typeof body).toBe("string");
      const submitted = JSON.parse(body as string);
      expect(submitted.clubId).toBe("club-1");
      expect(submitted.location).toBeUndefined();

      expect(matchesCacheSpy).toHaveBeenCalled();
      expect(notificationsSpy).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      matchesCacheSpy.mockRestore();
      notificationsSpy.mockRestore();
    }
  });

  it("allows adjusting the padel Americano tie target", async () => {
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const originalFetch = global.fetch;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="padel_americano" />);

    await screen.findAllByText("Alice");

    fireEvent.change(screen.getByLabelText(/tie target/i), {
      target: { value: "16" },
    });

    const selects = screen
      .getAllByRole("combobox")
      .filter((element) => element.id.startsWith("record-player"));
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "2" } });
    fireEvent.change(selects[2], { target: { value: "3" } });
    fireEvent.change(selects[3], { target: { value: "4" } });

    fireEvent.change(screen.getByLabelText(/team a score/i), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText(/team b score/i), {
      target: { value: "5" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(payload.sets).toEqual([[11, 5]]);

    global.fetch = originalFetch;
  });

  it("shows an error when padel Americano totals do not match the tie target", async () => {
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const originalFetch = global.fetch;

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players }) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordSportForm sportId="padel_americano" />);

    await screen.findAllByText("Alice");

    const selects = screen
      .getAllByRole("combobox")
      .filter((element) => element.id.startsWith("record-player"));
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "2" } });
    fireEvent.change(selects[2], { target: { value: "3" } });
    fireEvent.change(selects[3], { target: { value: "4" } });

    fireEvent.change(screen.getByLabelText(/team a score/i), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/team b score/i), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText(
        /totals must match your tie target of 32 points/i,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    global.fetch = originalFetch;
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

    const selects = getPlayerSelects();
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

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([url]) => String(url).includes("/v0/matches")),
        ).toBe(true),
      );
      const matchCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/v0/matches"),
      );
      const payload = JSON.parse(matchCall?.[1]?.body ?? "{}");
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
      const playerOneSelect = screen.getByRole("combobox", {
        name: /player 1/i,
      });
      const playerTwoSelect = screen.getByRole("combobox", {
        name: /player 2/i,
      });
      const playerThreeSelect = screen.getByRole("combobox", {
        name: /player 3/i,
      });
      fireEvent.change(playerOneSelect, { target: { value: "1" } });
      fireEvent.change(playerTwoSelect, { target: { value: "2" } });
      fireEvent.change(playerThreeSelect, { target: { value: "3" } });

      getBowlingRollInput("Alice", 1, 1);
      getBowlingRollInput("Bob", 1, 1);
      getBowlingRollInput("Cara", 1, 1);

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([url]) => String(url).includes("/v0/matches")),
        ).toBe(true),
      );
      const matchCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/v0/matches"),
      );
      const payload = JSON.parse(matchCall?.[1]?.body ?? "{}");
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
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });

    const playerLabel = players[0].name;
    const firstRollLabel = bowlingRollLabel(playerLabel, 1, 1);
    const secondRollLabel = bowlingRollLabel(playerLabel, 1, 2);
    const finalRollLabel = bowlingRollLabel(playerLabel, 10, 3);
    const firstRollInput = screen.getByRole("textbox", { name: firstRollLabel });
    const secondRollInput = screen.getByRole("textbox", { name: secondRollLabel });
    const finalRollInput = screen.getByRole("textbox", { name: finalRollLabel });

    expect(firstRollInput).toBeInTheDocument();
    expect(secondRollInput).toBeInTheDocument();
    expect(finalRollInput).toBeInTheDocument();
    expect(screen.getAllByText("Roll 1")[0]).toBeVisible();
    expect(screen.getAllByText("Roll 2")[0]).toBeVisible();
    expect(screen.getAllByText("Roll 3")[0]).toBeVisible();
    expect(firstRollInput).toHaveAttribute("aria-label", firstRollLabel);
    expect(secondRollInput).toHaveAttribute("aria-label", secondRollLabel);
    expect(finalRollInput).toHaveAttribute("aria-label", finalRollLabel);
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
    const firstRoll = getBowlingRollInput(playerName, 1, 1);
    const secondRoll = getBowlingRollInput(playerName, 1, 2);

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
      const roll1 = getBowlingRollInput(playerName, frame, 1);
      const roll2 = getBowlingRollInput(playerName, frame, 2);
      fireEvent.change(roll1, { target: { value: "3" } });
      fireEvent.change(roll2, { target: { value: "4" } });
    }

    const finalRoll1 = getBowlingRollInput(playerName, 10, 1);
    const finalRoll2 = getBowlingRollInput(playerName, 10, 2);
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
