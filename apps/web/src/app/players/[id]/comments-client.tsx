"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  SESSION_ENDED_EVENT,
  apiFetch,
  currentUserId,
  isAdmin,
  isLoggedIn,
  type ApiError,
} from "../../../lib/api";
import { useApiSWR } from "../../../lib/useApiSWR";

interface Comment {
  id: string;
  playerId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

interface PaginatedComments {
  items: Comment[];
  total: number;
  limit: number;
  offset: number;
}

export default function PlayerComments({ playerId }: { playerId: string }) {
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useState<
    | { type: "success" | "error"; message: string }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState(() => ({
    loggedIn: isLoggedIn(),
    userId: currentUserId(),
    admin: isAdmin(),
  }));

  const {
    data,
    error: commentsError,
    isLoading,
    isValidating,
    mutate,
  } = useApiSWR<PaginatedComments>(`/v0/players/${playerId}/comments`, {
    swr: {
      revalidateOnMount: true,
    },
  });

  const comments = data?.items ?? [];
  const commentsLoading = !data && isLoading;
  const commentsRevalidating = Boolean(data) && isValidating;
  const loadError = commentsError
    ? "We couldn't load comments. Please try again."
    : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateSession = () =>
      setSession({
        loggedIn: isLoggedIn(),
        userId: currentUserId(),
        admin: isAdmin(),
      });
    const handleSessionEnded = () => updateSession();
    window.addEventListener("storage", updateSession);
    window.addEventListener(SESSION_ENDED_EVENT, handleSessionEnded);
    return () => {
      window.removeEventListener("storage", updateSession);
      window.removeEventListener(SESSION_ENDED_EVENT, handleSessionEnded);
    };
  }, []);

  useEffect(() => {
    if (!session.loggedIn) {
      setContent("");
    }
  }, [session.loggedIn]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session.loggedIn) {
      setFeedback({ type: "error", message: "Log in to add a comment." });
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      setFeedback({
        type: "error",
        message: "Comment cannot be empty.",
      });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await apiFetch(`/v0/players/${playerId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: trimmed }),
      });
      setContent("");
      setFeedback({
        type: "success",
        message: "Comment posted successfully.",
      });
      try {
        await mutate(undefined, { revalidate: true });
      } catch (refreshErr) {
        console.error("Failed to refresh comments", refreshErr);
      }
    } catch (err) {
      const apiError = err as ApiError;
      const message =
        apiError?.parsedMessage ||
        apiError?.message ||
        "We couldn't post your comment. Please try again.";
      setFeedback({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string, ownerId: string) {
    if (!session.loggedIn) {
      setFeedback({ type: "error", message: "Log in to manage comments." });
      return;
    }
    const isAuthor = Boolean(session.userId) && session.userId === ownerId;
    if (!session.admin && !isAuthor) {
      setFeedback({
        type: "error",
        message: "You can only delete your own comments.",
      });
      return;
    }
    try {
      await apiFetch(`/v0/players/${playerId}/comments/${id}`, {
        method: "DELETE",
      });
      setFeedback({
        type: "success",
        message: "Comment deleted.",
      });
      try {
        await mutate(undefined, { revalidate: true });
      } catch (refreshErr) {
        console.error("Failed to refresh comments", refreshErr);
      }
    } catch (err) {
      const apiError = err as ApiError;
      const message =
        apiError?.parsedMessage ||
        apiError?.message ||
        "We couldn't delete the comment. Please try again.";
      setFeedback({ type: "error", message });
    }
  }

  return (
    <section className="mt-4">
      <h2 className="heading">Comments</h2>
      {commentsRevalidating ? (
        <p className="sr-only" role="status" aria-live="polite">
          Updating comments…
        </p>
      ) : null}
      {commentsLoading ? (
        <p>Loading comments…</p>
      ) : comments.length ? (
        <ul>
          {comments.map((c) => (
            <li key={c.id} className="mb-2">
              <div>{c.content}</div>
              <div className="text-sm text-gray-700">
                {c.username} · {new Date(c.createdAt).toLocaleString()}
                {session.loggedIn &&
                  (session.admin || session.userId === c.userId) && (
                    <button
                    onClick={() => remove(c.id, c.userId)}
                    className="ml-2 text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No comments.</p>
      )}
      {loadError && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {loadError}
        </p>
      )}
      {feedback && (
        <p
          className={`mt-2 text-sm ${
            feedback.type === "error" ? "text-red-600" : "text-green-600"
          }`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}
      {session.loggedIn ? (
        <form onSubmit={submit} className="mt-2">
          <label className="sr-only" htmlFor="player-comment-input">
            Add a comment
          </label>
          <textarea
            id="player-comment-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="border p-2 w-full"
            disabled={submitting}
          />
          <button type="submit" className="btn mt-2" disabled={submitting}>
            {submitting ? "Posting…" : "Add Comment"}
          </button>
        </form>
      ) : (
        <p className="mt-2 text-sm text-gray-700">
          Log in to add a comment.
        </p>
      )}
    </section>
  );
}
