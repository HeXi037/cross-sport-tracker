"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  SESSION_CHANGED_EVENT,
  SESSION_ENDED_EVENT,
  apiFetch,
  currentUserId,
  isAdmin,
  isLoggedIn,
  type ApiError,
} from "../../../lib/api";
import { invalidateNotificationsCache } from "../../../lib/useNotifications";
import { useApiSWR } from "../../../lib/useApiSWR";
import { useLocale, useTimeZone } from "../../../lib/LocaleContext";
import { formatDateTime } from "../../../lib/i18n";

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

const MAX_COMMENT_LENGTH = 500;

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
  const locale = useLocale();
  const timeZone = useTimeZone();

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
    window.addEventListener(SESSION_CHANGED_EVENT, updateSession);
    window.addEventListener(SESSION_ENDED_EVENT, handleSessionEnded);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, updateSession);
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
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setFeedback({
        type: "error",
        message: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters.`,
      });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await apiFetch(`/v0/players/${playerId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: trimmed }),
      });
      const newComment = (await response.json()) as Comment;
      setContent("");
      setFeedback({
        type: "success",
        message: "Comment posted successfully.",
      });
      try {
        await mutate(
          (current) => {
            const base: PaginatedComments = current
              ? {
                  ...current,
                  items: [...current.items],
                }
              : {
                  items: [],
                  total: 0,
                  limit: data?.limit ?? 50,
                  offset: data?.offset ?? 0,
                };
            const filteredItems = base.items.filter(
              (existing) => existing.id !== newComment.id,
            );
            const isExistingComment = filteredItems.length !== base.items.length;
            return {
              ...base,
              items: [newComment, ...filteredItems],
              total: base.total + (isExistingComment ? 0 : 1),
            };
          },
          { populateCache: true, revalidate: false },
        );
      } catch (refreshErr) {
        console.error("Failed to update comments cache", refreshErr);
      }
      try {
        await invalidateNotificationsCache();
      } catch (notificationErr) {
        console.error("Failed to refresh notifications", notificationErr);
      }
    } catch (err) {
      const apiError = err as ApiError;
      const message =
        apiError?.code === "auth_csrf_missing" ||
        apiError?.code === "auth_csrf_invalid"
          ? "Your session expired. Please refresh and try again."
          : apiError?.parsedMessage ||
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
      try {
        await invalidateNotificationsCache();
      } catch (notificationErr) {
        console.error("Failed to refresh notifications", notificationErr);
      }
    } catch (err) {
      const apiError = err as ApiError;
      const message =
        apiError?.code === "auth_csrf_missing" ||
        apiError?.code === "auth_csrf_invalid"
          ? "Your session expired. Please refresh and try again."
          : apiError?.parsedMessage ||
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
          {comments.map((c) => {
            const createdAtLabel = formatDateTime(
              c.createdAt,
              locale,
              "default",
              timeZone,
            );
            const createdAtDate = new Date(c.createdAt);
            const createdAtDateTime = Number.isNaN(createdAtDate.getTime())
              ? undefined
              : createdAtDate.toISOString();
            const canDelete =
              session.loggedIn && (session.admin || session.userId === c.userId);
            return (
              <li key={c.id} className="mb-4">
                <header className="flex flex-wrap items-baseline gap-x-2 text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{c.username}</span>
                  <time dateTime={createdAtDateTime}>{createdAtLabel}</time>
                  {canDelete && (
                    <button
                      onClick={() => remove(c.id, c.userId)}
                      className="ml-2 text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </header>
                <p className="mt-1 whitespace-pre-line break-words">{c.content}</p>
              </li>
            );
          })}
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
          aria-live={feedback.type === "error" ? "assertive" : "polite"}
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
            maxLength={MAX_COMMENT_LENGTH}
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
