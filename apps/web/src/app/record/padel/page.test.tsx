import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RecordPadelPage from "./page";
import * as LocaleContext from "../../../lib/LocaleContext";
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

    const playerHints = await screen.findAllByText(/Add players to both sides\./i);
    expect(playerHints).toHaveLength(2);
    expect(
      screen.queryByText(/Add at least one player to side B\./i),
    ).not.toBeInTheDocument();

    fireEvent.change(playerA1, {
      target: { value: "p1" },
    });

    fireEvent.click(saveButton);

    const missingPlayerError = await screen.findByText(
      /Add at least one player to side B\./i,
    );
    expect(missingPlayerError).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveButton).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(playerB1, {
      target: { value: "p2" },
    });
    fireEvent.click(saveButton);
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

    fireEvent.change(playerA1, {
      target: { value: "p1" },
    });
    fireEvent.change(playerB1, {
      target: { value: "p1" },
    });

    fireEvent.click(saveButton);

    const duplicateErrors = await screen.findByText(
      /Players cannot appear on both sides/i,
    );
    expect(duplicateErrors).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveButton).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(playerB1, {
      target: { value: "p2" },
    });
    fireEvent.click(saveButton);
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

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(
        screen.getAllByRole("alert").some((alert) =>
          alert.textContent?.includes("Enter a score for both teams"),
        ),
      ).toBe(true),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /save/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
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
