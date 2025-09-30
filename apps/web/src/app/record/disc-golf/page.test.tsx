import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import RecordDiscGolfPage from "./page";

const useSearchParamsMock = vi.fn<URLSearchParams, []>();
const pushMock = vi.fn();
const apiSWRMocks = vi.hoisted(() => ({
  invalidateMatchesCacheMock: vi.fn(async () => {}),
}));

const notificationMocks = vi.hoisted(() => ({
  invalidateNotificationsCacheMock: vi.fn(async () => {}),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../../../lib/useApiSWR", () => ({
  invalidateMatchesCache: apiSWRMocks.invalidateMatchesCacheMock,
}));

vi.mock("../../../lib/useNotifications", () => ({
  invalidateNotificationsCache:
    notificationMocks.invalidateNotificationsCacheMock,
}));

const originalFetch = global.fetch;

describe("RecordDiscGolfPage", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("mid=m1"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    pushMock.mockReset();
    apiSWRMocks.invalidateMatchesCacheMock.mockReset();
    notificationMocks.invalidateNotificationsCacheMock.mockReset();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).fetch;
    }
  });

  it("posts hole events", async () => {
    const fetchMock = vi.fn((url: unknown, init: RequestInit | undefined) => {
      if (url === "/api/v0/players?limit=200&offset=0") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            players: [
              { id: "p1", name: "Player One" },
              { id: "p2", name: "Player Two" },
            ],
          }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m1") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "m1",
            participants: [
              { side: "A", playerIds: ["p1"] },
              { side: "B", playerIds: ["p2"] },
            ],
            summary: {
              pars: [3, 3],
              scores: { A: [null, null], B: [null, null] },
            },
          }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m1/events") {
        return Promise.resolve({ ok: true, json: async () => ({}) }) as Promise<Response>;
      }
      throw new Error(`Unexpected fetch to ${String(url)}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    await screen.findByText(/Side A:/i);
    const sideAInput = await screen.findByLabelText<HTMLInputElement>(/side a strokes/i);
    const sideBInput = screen.getByLabelText<HTMLInputElement>(/side b strokes/i);

    fireEvent.change(sideAInput, { target: { value: "3" } });
    fireEvent.change(sideBInput, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /record hole/i }));

    await waitFor(() => {
      const eventCalls = fetchMock.mock.calls.filter(([calledUrl]) =>
        typeof calledUrl === "string" && calledUrl.includes("/events"),
      );
      expect(eventCalls).toHaveLength(2);
    });

    const payloads = fetchMock.mock.calls
      .filter(([calledUrl]) => typeof calledUrl === "string" && calledUrl.includes("/events"))
      .map(([, requestInit]) => JSON.parse(String(requestInit?.body)));

    expect(payloads).toEqual([
      { type: "HOLE", side: "A", hole: 1, strokes: 3 },
      { type: "HOLE", side: "B", hole: 1, strokes: 4 },
    ]);
  });

  it("shows an error and preserves input when an event submission fails", async () => {
    let eventCallCount = 0;
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/v0/players?limit=200&offset=0") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ players: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }] }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m1") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "m1",
            participants: [
              { side: "A", playerIds: ["p1"] },
              { side: "B", playerIds: ["p2"] },
            ],
            summary: {
              pars: [3, 3],
              scores: { A: [null, null], B: [null, null] },
            },
          }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m1/events") {
        eventCallCount += 1;
        if (eventCallCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({}) }) as Promise<Response>;
        }
        return Promise.resolve({ ok: false, json: async () => ({}) }) as Promise<Response>;
      }
      throw new Error(`Unexpected fetch to ${String(url)}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    await screen.findByText(/Side A:/i);
    const sideAInput = await screen.findByLabelText<HTMLInputElement>(/side a strokes/i);
    const sideBInput = screen.getByLabelText<HTMLInputElement>(/side b strokes/i);
    fireEvent.change(sideAInput, { target: { value: "3" } });
    fireEvent.change(sideBInput, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /record hole/i }));

    await screen.findByText("Failed to record event.");

    const eventCalls = fetchMock.mock.calls.filter(([calledUrl]) =>
      typeof calledUrl === "string" && calledUrl.includes("/events"),
    );
    expect(eventCalls).toHaveLength(2);
    expect(screen.getByText(/Hole 1 of/i)).toBeInTheDocument();
    expect(sideAInput).toHaveDisplayValue("3");
    expect(sideBInput).toHaveDisplayValue("4");
  });

  it("does not advance or clear inputs when the first submission fails", async () => {
    let eventCallCount = 0;
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/v0/players?limit=200&offset=0") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ players: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }] }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m1") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "m1",
            participants: [
              { side: "A", playerIds: ["p1"] },
              { side: "B", playerIds: ["p2"] },
            ],
            summary: {
              pars: [3, 3],
              scores: { A: [null, null], B: [null, null] },
            },
          }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m1/events") {
        eventCallCount += 1;
        if (eventCallCount === 1) {
          return Promise.resolve({ ok: false, json: async () => ({}) }) as Promise<Response>;
        }
      }
      throw new Error(`Unexpected fetch to ${String(url)}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    await screen.findByText(/Side A:/i);
    const sideAInput = await screen.findByLabelText<HTMLInputElement>(/side a strokes/i);
    const sideBInput = screen.getByLabelText<HTMLInputElement>(/side b strokes/i);
    fireEvent.change(sideAInput, { target: { value: "2" } });
    fireEvent.change(sideBInput, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /record hole/i }));

    await screen.findByText("Failed to record event.");

    const eventCalls = fetchMock.mock.calls.filter(([calledUrl]) =>
      typeof calledUrl === "string" && calledUrl.includes("/events"),
    );
    expect(eventCalls).toHaveLength(1);
    expect(screen.getByText(/Hole 1 of/i)).toBeInTheDocument();
    expect(sideAInput).toHaveDisplayValue("2");
    expect(sideBInput).toHaveDisplayValue("5");
  });

  it("disables recording guidance when no match id is provided", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/v0/players?limit=200&offset=0") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ players: [] }),
        }) as Promise<Response>;
      }
      if (typeof url === "string" && url.startsWith("/api/v0/matches?")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: "m-existing", sport: "disc_golf" },
          ],
        }) as Promise<Response>;
      }
      throw new Error(`Unexpected fetch to ${String(url)}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v0/players?limit=200&offset=0",
        expect.any(Object),
      );
    });

    expect(
      await screen.findByText(
        /start a new match or choose an existing disc golf match before recording hole scores\./i
      )
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /start new match/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /record hole/i })
    ).not.toBeInTheDocument();
  });

  it("creates a new match and enables scoring when requested", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const fetchMock = vi.fn((url: unknown, init: RequestInit | undefined) => {
      if (url === "/api/v0/players?limit=200&offset=0") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            players: [
              { id: "p1", name: "Player One" },
              { id: "p2", name: "Player Two" },
            ],
          }),
        }) as Promise<Response>;
      }
      if (typeof url === "string" && url.startsWith("/api/v0/matches?")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: "m-existing", sport: "disc_golf" },
          ],
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "new-match" }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/new-match") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "new-match",
            participants: [
              { side: "A", playerIds: ["p1"] },
              { side: "B", playerIds: ["p2"] },
            ],
            summary: {
              pars: [3, 4, 3],
              scores: { A: [null, null, null], B: [null, null, null] },
            },
          }),
        }) as Promise<Response>;
      }
      throw new Error(`Unexpected fetch to ${String(url)}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    const user = userEvent.setup();
    const sideASelect = await screen.findByLabelText<HTMLSelectElement>(/side a players/i);
    const sideBSelect = screen.getByLabelText<HTMLSelectElement>(/side b players/i);
    await user.selectOptions(sideASelect, ["p1"]);
    await user.selectOptions(sideBSelect, ["p2"]);

    const holeCountInput = screen.getByLabelText<HTMLInputElement>(/number of holes/i);
    fireEvent.change(holeCountInput, { target: { value: "3" } });
    await waitFor(() => {
      expect(screen.getAllByLabelText(/hole \d+/i)).toHaveLength(3);
    });
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(/hole 2/i), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /start new match/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v0/matches",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(apiSWRMocks.invalidateMatchesCacheMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(notificationMocks.invalidateNotificationsCacheMock).toHaveBeenCalled();
    });

    const createCall = fetchMock.mock.calls.find(([calledUrl]) => calledUrl === "/api/v0/matches");
    const payload = JSON.parse(String(createCall?.[1]?.body));
    expect(payload.participants).toEqual([
      { side: "A", playerIds: ["p1"] },
      { side: "B", playerIds: ["p2"] },
    ]);
    expect(payload.details).toEqual({
      sport: "disc_golf",
      config: { holes: 3, pars: [3, 4, 3] },
      pars: [3, 4, 3],
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/record/disc-golf/?mid=new-match");
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText<HTMLInputElement>(/side a strokes/i),
      ).not.toBeDisabled();
    });
    expect(
      screen.getByLabelText<HTMLInputElement>(/side b strokes/i),
    ).not.toBeDisabled();
  });

  it("allows selecting an existing match to enable recording", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/v0/players?limit=200&offset=0") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ players: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }] }),
        }) as Promise<Response>;
      }
      if (typeof url === "string" && url.startsWith("/api/v0/matches?")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: "m-existing", sport: "disc_golf" },
          ],
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m-existing") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "m-existing",
            participants: [
              { side: "A", playerIds: ["p1"] },
              { side: "B", playerIds: ["p2"] },
            ],
            summary: {
              pars: [3, 3],
              scores: { A: [null, null], B: [null, null] },
            },
          }),
        }) as Promise<Response>;
      }
      throw new Error(`Unexpected fetch to ${String(url)}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    const select = await screen.findByLabelText<HTMLSelectElement>(/existing match/i);
    fireEvent.change(select, { target: { value: "m-existing" } });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/record/disc-golf/?mid=m-existing");
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText<HTMLInputElement>(/side a strokes/i),
      ).not.toBeDisabled();
    });
    expect(
      screen.getByLabelText<HTMLInputElement>(/side b strokes/i),
    ).not.toBeDisabled();
  });

  it("keeps the form interactive when an existing match id is provided", async () => {
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/v0/players?limit=200&offset=0") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ players: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }] }),
        }) as Promise<Response>;
      }
      if (url === "/api/v0/matches/m1") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "m1",
            participants: [
              { side: "A", playerIds: ["p1"] },
              { side: "B", playerIds: ["p2"] },
            ],
            summary: {
              pars: [3, 3],
              scores: { A: [null, null], B: [null, null] },
            },
          }),
        }) as Promise<Response>;
      }
      throw new Error(`Unexpected fetch to ${String(url)}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<RecordDiscGolfPage />);

    await waitFor(() => {
      expect(
        screen.getByLabelText<HTMLInputElement>(/side a strokes/i),
      ).not.toBeDisabled();
    });
    expect(
      screen.getByLabelText<HTMLInputElement>(/side b strokes/i),
    ).not.toBeDisabled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
