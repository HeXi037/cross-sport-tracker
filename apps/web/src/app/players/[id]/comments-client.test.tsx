import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn<
    [string, RequestInit | undefined],
    Promise<Response>
  >(),
  isLoggedIn: vi.fn<boolean, []>(),
  currentUserId: vi.fn<string | null, []>(),
  isAdmin: vi.fn<boolean, []>(),
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

import PlayerComments from "./comments-client";

describe("PlayerComments", () => {
  beforeEach(() => {
    apiMocks.apiFetch.mockReset();
    apiMocks.isLoggedIn.mockReset();
    apiMocks.currentUserId.mockReset();
    apiMocks.isAdmin.mockReset();
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

  it("prompts unauthenticated users to log in", async () => {
    await act(async () => {
      render(<PlayerComments playerId="player-1" />);
    });

    expect(await screen.findByText("No comments.")).toBeInTheDocument();
    expect(
      screen.getByText("Log in to add a comment.")
    ).toBeInTheDocument();
    expect(apiMocks.apiFetch).toHaveBeenCalledWith(
      "/v0/players/player-1/comments",
      { cache: "no-store" }
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

    await act(async () => {
      render(<PlayerComments playerId="player-1" />);
    });

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

    await act(async () => {
      render(<PlayerComments playerId="player-1" />);
    });

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
});
