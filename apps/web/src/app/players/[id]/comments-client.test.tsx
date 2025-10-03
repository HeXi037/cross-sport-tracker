import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { SWRConfig } from "swr";

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn<
    [string, RequestInit | undefined],
    Promise<Response>
  >(),
  isLoggedIn: vi.fn<boolean, []>(),
  currentUserId: vi.fn<string | null, []>(),
  isAdmin: vi.fn<boolean, []>(),
}));

const localeMocks = vi.hoisted(() => ({
  useLocale: vi.fn(() => "en-GB"),
  useTimeZone: vi.fn(() => "UTC"),
}));

const notificationMocks = vi.hoisted(() => ({
  invalidateNotificationsCache: vi.fn(async () => {}),
}));

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>(
    "../../../lib/api"
  );
  return {
    ...actual,
    apiFetch: apiMocks.apiFetch,
    isLoggedIn: apiMocks.isLoggedIn,
    currentUserId: apiMocks.currentUserId,
    isAdmin: apiMocks.isAdmin,
  };
});

vi.mock("../../../lib/LocaleContext", () => ({
  useLocale: () => localeMocks.useLocale(),
  useTimeZone: () => localeMocks.useTimeZone(),
}));

vi.mock("../../../lib/useNotifications", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/useNotifications")
  >("../../../lib/useNotifications");
  return {
    ...actual,
    invalidateNotificationsCache:
      notificationMocks.invalidateNotificationsCache,
  };
});

import { formatDateTime } from "../../../lib/i18n";

import PlayerComments from "./comments-client";

describe("PlayerComments", () => {
  beforeEach(() => {
    apiMocks.apiFetch.mockReset();
    apiMocks.isLoggedIn.mockReset();
    apiMocks.currentUserId.mockReset();
    apiMocks.isAdmin.mockReset();
    localeMocks.useLocale.mockReset();
    localeMocks.useTimeZone.mockReset();
    localeMocks.useLocale.mockReturnValue("en-GB");
    localeMocks.useTimeZone.mockReturnValue("UTC");
    notificationMocks.invalidateNotificationsCache.mockReset();
    apiMocks.isLoggedIn.mockReturnValue(false);
    apiMocks.currentUserId.mockReturnValue(null);
    apiMocks.isAdmin.mockReturnValue(false);
    apiMocks.apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  });

  function renderComponent() {
    return act(async () => {
      render(
        <SWRConfig value={{ provider: () => new Map() }}>
          <PlayerComments playerId="player-1" />
        </SWRConfig>,
      );
    });
  }

  it("prompts unauthenticated users to log in", async () => {
    await renderComponent();

    expect(await screen.findByText("No comments.")).toBeInTheDocument();
    expect(
      screen.getByText("Log in to add a comment.")
    ).toBeInTheDocument();
    expect(apiMocks.apiFetch).toHaveBeenCalledWith(
      "/v0/players/player-1/comments",
      undefined
    );
  });

  it("allows logged-in users to post comments and shows success feedback", async () => {
    const comments: Array<Record<string, unknown>> = [];
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.currentUserId.mockReturnValue("user-1");

    apiMocks.apiFetch.mockImplementation(async (path, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const newComment = {
          id: "comment-1",
          playerId: "player-1",
          userId: "user-1",
          username: "alice",
          content: body.content,
          createdAt: new Date("2024-01-01T12:00:00Z").toISOString(),
        } satisfies Record<string, unknown>;
        comments.unshift(newComment);
        return new Response(JSON.stringify(newComment), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          items: comments,
          total: comments.length,
          limit: 50,
          offset: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    await renderComponent();

    const textarea = await screen.findByLabelText("Add a comment");
    fireEvent.change(textarea, { target: { value: "Great match!" } });

    const submitButton = screen.getByRole("button", { name: "Add Comment" });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() =>
      expect(
        screen.getByText("Comment posted successfully.")
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Add a comment")).toHaveValue("");
    expect(await screen.findByText("Great match!")).toBeInTheDocument();
    const expectedTimestamp = formatDateTime(
      "2024-01-01T12:00:00Z",
      "en-GB",
      "default",
      "UTC",
    );
    const commentItem = screen.getByRole("listitem");
    expect(within(commentItem).getByText("alice")).toBeInTheDocument();
    expect(within(commentItem).getByText(expectedTimestamp)).toBeInTheDocument();
    expect(notificationMocks.invalidateNotificationsCache).toHaveBeenCalled();
  });

  it("shows a helpful error message when posting fails", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.currentUserId.mockReturnValue("user-1");

    apiMocks.apiFetch.mockImplementation(async (path, init) => {
      if (init?.method === "POST") {
        const error = new Error("HTTP 400: Comment too short");
        (error as Error & { parsedMessage?: string }).parsedMessage =
          "Comment too short";
        throw error;
      }
      return new Response(
        JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    await renderComponent();

    const textarea = await screen.findByLabelText("Add a comment");
    fireEvent.change(textarea, { target: { value: "Hi" } });

    const submitButton = screen.getByRole("button", { name: "Add Comment" });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() =>
      expect(screen.getByText("Comment too short")).toBeInTheDocument()
    );
  });

  it("validates overly long comments", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.currentUserId.mockReturnValue("user-1");

    await renderComponent();

    const textarea = await screen.findByLabelText("Add a comment");
    const longComment = "a".repeat(501);
    fireEvent.change(textarea, { target: { value: longComment } });

    const submitButton = screen.getByRole("button", { name: "Add Comment" });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() =>
      expect(
        screen.getByText("Comment cannot exceed 500 characters.")
      ).toBeInTheDocument()
    );
    expect(apiMocks.apiFetch).not.toHaveBeenCalledWith(
      "/v0/players/player-1/comments",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("prompts the user to refresh the page when CSRF validation fails", async () => {
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.currentUserId.mockReturnValue("user-1");

    apiMocks.apiFetch.mockImplementation(async (path, init) => {
      if (init?.method === "POST") {
        const error = new Error("HTTP 403: invalid CSRF token");
        (error as Error & { parsedMessage?: string; code?: string }).code =
          "auth_csrf_invalid";
        throw error;
      }
      return new Response(
        JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    await renderComponent();

    const textarea = await screen.findByLabelText("Add a comment");
    fireEvent.change(textarea, { target: { value: "Session?" } });

    const submitButton = screen.getByRole("button", { name: "Add Comment" });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() =>
      expect(
        screen.getByText("Your session expired. Please refresh and try again.")
      ).toBeInTheDocument()
    );
  });
});
