import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RecordPadelPage from "./page";
import * as LocaleContext from "../../../lib/LocaleContext";
import * as NotificationCache from "../../../lib/useNotifications";
import {
  getDateExample,
  getTimeExample,
  usesTwentyFourHourClock,
} from "../../../lib/i18n";

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

    const invalidateSpy = vi
      .spyOn(NotificationCache, "invalidateNotificationsCache")
      .mockResolvedValue();

    try {
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
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    } finally {
      invalidateSpy.mockRestore();
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
      render(<RecordPadelPage />);

      const dateInput = await screen.findByLabelText(/date/i);
      expect(dateInput).toHaveAttribute("placeholder", "DD/MM/YYYY");
      const expectedDateExample = getDateExample("en-AU");
      expect(
        screen.getByText((content) =>
          content.toLowerCase().includes(expectedDateExample.toLowerCase()) &&
          /example|e\.g\./i.test(content)
        )
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

  it("uses European date placeholders and 24-hour time when locale is fr-FR", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as typeof fetch;

    const localeSpy = vi
      .spyOn(LocaleContext, "useLocale")
      .mockReturnValue("fr-FR");

    try {
      render(<RecordPadelPage />);

      const dateInput = await screen.findByLabelText(/date/i);
      expect(dateInput).toHaveAttribute("placeholder", "DD/MM/YYYY");
      const expectedDateExample = getDateExample("fr-FR");
      expect(
        screen.getByText((content) =>
          content.toLowerCase().includes(expectedDateExample.toLowerCase()) &&
          /example|e\.g\./i.test(content)
        )
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
      const expectedTimeExample = getTimeExample("fr-FR");
      expect(
        screen.getByText((content) =>
          content.includes(`Example: ${expectedTimeExample}`)
        )
      ).toBeInTheDocument();
      if (usesTwentyFourHourClock("fr-FR")) {
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

    const playerA1 = await screen.findByRole("combobox", { name: "Player A 1" });
    const playerB1 = await screen.findByRole("combobox", { name: "Player B 1" });
    const saveButton = screen.getByRole("button", { name: /save/i });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();

    const sideAHint = await screen.findByText(
      /Add at least one player to side A$/i,
    );
    expect(sideAHint).toBeInTheDocument();
    const sideBHint = await screen.findByText(
      /Add at least one player to side B$/i,
    );
    expect(sideBHint).toBeInTheDocument();
    expect(
      screen.queryByText(/Add at least one player to side B\./i),
    ).not.toBeInTheDocument();

    fireEvent.change(playerA1, {
      target: { value: "p1" },
    });

    if (form) {
      fireEvent.submit(form);
    }

    const missingPlayerError = await screen.findByText(
      /Add at least one player to side B\./i,
    );
    expect(missingPlayerError).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveButton).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(playerB1, {
      target: { value: "p2" },
    });
    if (form) {
      fireEvent.submit(form);
    }
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

    const playerA1 = await screen.findByRole("combobox", { name: "Player A 1" });
    const playerB1 = await screen.findByRole("combobox", { name: "Player B 1" });
    const saveButton = screen.getByRole("button", { name: /save/i });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();

    fireEvent.change(playerA1, {
      target: { value: "p1" },
    });
    fireEvent.change(playerB1, {
      target: { value: "p1" },
    });

    if (form) {
      fireEvent.submit(form);
    }

    const duplicateErrors = await screen.findByText(
      /Players cannot appear on both sides/i,
    );
    expect(duplicateErrors).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveButton).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(playerB1, {
      target: { value: "p2" },
    });
    if (form) {
      fireEvent.submit(form);
    }
  });

  it("shows validation errors for incomplete set scores", async () => {
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

    const saveButton = screen.getByRole("button", { name: /save/i });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() =>
      expect(
        screen.getByText(/Enter a score for both teams\./i),
      ).toBeInTheDocument(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveButton).toHaveAttribute("aria-disabled", "true");
  });

  it("enforces the best-of selection when validating sets", async () => {
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
      });
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
    fireEvent.change(screen.getByPlaceholderText("Set 1 B"), {
      target: { value: "4" },
    });

    const saveButton = screen.getByRole("button", { name: /save/i });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() =>
      expect(
        screen.getByText("Best of 3 requires 2 set wins for a team."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /add set/i }));
    fireEvent.change(screen.getByPlaceholderText("Set 2 A"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 2 B"), {
      target: { value: "6" },
    });

    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() =>
      expect(
        screen.getByText("Best of 3 requires 2 set wins for a team."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /add set/i }));
    fireEvent.change(screen.getByPlaceholderText("Set 3 A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 3 B"), {
      target: { value: "2" },
    });

    expect(
      screen.getByRole("button", { name: /save/i }),
    ).toHaveAttribute("aria-disabled", "false");
    expect(
      screen.getByText("Completed sets ready to save: 3."),
    ).toBeInTheDocument();
  });

  it("rejects set scores outside the allowed range", async () => {
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

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "p2" },
    });

    fireEvent.change(screen.getByPlaceholderText("Set 1 A"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 1 B"), {
      target: { value: "6" },
    });

    const saveButton = screen.getByRole("button", { name: /save/i });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    const alertMessage = await screen.findByText(
      /Please fix the highlighted set scores before saving./i,
    );
    expect(alertMessage).toHaveAttribute("role", "alert");
    const scoreErrors = await screen.findAllByText(
      "Scores in set 1 must be whole numbers between 0 and 7.",
    );
    expect(scoreErrors.length).toBeGreaterThan(0);
    expect(saveButton).toHaveAttribute("aria-disabled", "true");
  });

  it("requires tie-break points for 7–6 sets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "p1", name: "Player 1" },
            { id: "p2", name: "Player 2" },
          ],
        }),
      });
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
      target: { value: "7" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 1 B"), {
      target: { value: "6" },
    });

    expect(
      screen.getByText(/Set 1 went to a tie-break/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Tie-break points team A"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Tie-break points team B"),
    ).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: /save/i });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    const tieBreakErrors = await screen.findAllByText(
      "Enter tie-break points for set 1.",
    );
    expect(tieBreakErrors.length).toBeGreaterThan(0);
    tieBreakErrors.forEach((error) => {
      expect(error).toHaveAttribute("role", "alert");
    });

    fireEvent.change(screen.getByLabelText("Tie-break points team A"), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText("Tie-break points team B"), {
      target: { value: "7" },
    });

    await waitFor(() => {
      expect(
        screen.queryByText("Enter tie-break points for set 1."),
      ).not.toBeInTheDocument();
    });
  });

  it("sends tie-break points when saving a 7–6 set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            { id: "pa1", name: "Player A1" },
            { id: "pa2", name: "Player A2" },
            { id: "pb1", name: "Player B1" },
            { id: "pb2", name: "Player B2" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "m7" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

    fireEvent.change(screen.getByLabelText("Player A 1"), {
      target: { value: "pa1" },
    });
    fireEvent.change(screen.getByLabelText("Player A 2"), {
      target: { value: "pa2" },
    });
    fireEvent.change(screen.getByLabelText("Player B 1"), {
      target: { value: "pb1" },
    });
    fireEvent.change(screen.getByLabelText("Player B 2"), {
      target: { value: "pb2" },
    });

    fireEvent.change(screen.getByPlaceholderText("Set 1 A"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 1 B"), {
      target: { value: "6" },
    });

    fireEvent.change(screen.getByLabelText("Tie-break points team A"), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText("Tie-break points team B"), {
      target: { value: "7" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add set/i }));
    fireEvent.change(screen.getByPlaceholderText("Set 2 A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 2 B"), {
      target: { value: "3" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const setRequest = fetchMock.mock.calls[2];
    expect(setRequest?.[0]).toBe("/api/v0/matches/m7/sets");
    const payload = JSON.parse(setRequest?.[1]?.body ?? "{}");
    expect(Array.isArray(payload?.sets)).toBe(true);
    expect(payload?.sets?.[0]).toEqual({
      A: 7,
      B: 6,
      tieBreak: { A: 9, B: 7 },
    });
  });

  it("prevents recording extra sets once the winner is decided", async () => {
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
      });
    global.fetch = fetchMock as typeof fetch;

    render(<RecordPadelPage />);

    await waitFor(() => screen.getByLabelText("Player A 1"));

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

    fireEvent.change(screen.getByPlaceholderText("Set 1 A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 1 B"), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add set/i }));
    fireEvent.change(screen.getByPlaceholderText("Set 2 A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 2 B"), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add set/i }));
    fireEvent.change(screen.getByPlaceholderText("Set 3 A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("Set 3 B"), {
      target: { value: "4" },
    });

    const saveButton = screen.getByRole("button", { name: /save/i });
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() =>
      expect(
        screen.getByText(
          "Best of 3 ends when a side wins 2 sets. Remove extra set scores.",
        ),
      ).toBeInTheDocument(),
    );
    expect(saveButton).toHaveAttribute("aria-disabled", "true");
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
      target: { value: "3" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /failed to save match/i,
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).toHaveAttribute(
        "aria-disabled",
        "false",
      ),
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
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    fetchMock.mock.calls.slice(0, 2).forEach(([, init]) => {
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

    const errorMessage = await screen.findByText(/failed to load players/i);
    expect(errorMessage).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
