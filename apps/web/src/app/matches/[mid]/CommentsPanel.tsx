"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  SESSION_ENDED_EVENT,
  apiFetch,
  currentUserId,
  isAdmin,
  isLoggedIn,
  type ApiError,
} from "../../../lib/api";
import { useApiSWR } from "../../../lib/useApiSWR";
import { useLocale, useTimeZone } from "../../../lib/LocaleContext";
import { formatDateTime } from "../../../lib/i18n";

interface MatchComment {
  id: string;
  matchId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  parentId?: string | null;
  replies?: MatchComment[];
}

interface CommentPage {
  items: MatchComment[];
  total: number;
  limit: number;
  offset: number;
}

const MAX_LENGTH = 1000;

function flattenComments(items: MatchComment[]): MatchComment[] {
  const ordered: MatchComment[] = [];
  const walk = (node: MatchComment, depth = 0) => {
    ordered.push({ ...node, content: `${"  ".repeat(depth)}${node.content}` });
    (node.replies || []).forEach((reply) => walk(reply, depth + 1));
  };
  items.forEach((c) => walk(c));
  return ordered;
}

export default function CommentsPanel({ matchId }: { matchId: string }) {
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

  const { data, error, isLoading, isValidating, mutate } = useApiSWR<CommentPage>(
    `/v0/matches/${matchId}/comments`,
    {
      swr: { revalidateOnMount: true },
    }
  );

  const comments = useMemo(
    () => flattenComments(data?.items || []),
    [data?.items]
  );

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
      setFeedback({ type: "error", message: "Comment cannot be empty." });
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setFeedback({
        type: "error",
        message: `Comment cannot exceed ${MAX_LENGTH} characters.`,
      });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await apiFetch(`/v0/matches/${matchId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const newComment = (await response.json()) as MatchComment;
      setContent("");
      await mutate(
        (current) => {
          const base: CommentPage =
            current ?? { items: [], total: 0, limit: 50, offset: 0 };
          return {
            ...base,
            items: [newComment, ...base.items],
            total: base.total + 1,
          };
        },
        { populateCache: true, revalidate: false }
      );
      setFeedback({ type: "success", message: "Comment posted successfully." });
    } catch (err) {
      const apiErr = err as ApiError;
      const message =
        apiErr?.parsedMessage || apiErr?.message || "Could not post comment.";
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
    if (!session.admin && session.userId !== ownerId) {
      setFeedback({ type: "error", message: "You can only delete your comments." });
      return;
    }
    try {
      await apiFetch(`/v0/matches/${matchId}/comments/${id}`, { method: "DELETE" });
      await mutate(undefined, { revalidate: true });
      setFeedback({ type: "success", message: "Comment deleted." });
    } catch (err) {
      const apiErr = err as ApiError;
      const message =
        apiErr?.parsedMessage || apiErr?.message || "Could not delete comment.";
      setFeedback({ type: "error", message });
    }
  }

  return (
    <section className="card">
      <h2 className="heading">Comments</h2>
      <form className="stack" onSubmit={submit}>
        <label className="sr-only" htmlFor="match-comment">
          Add a comment
        </label>
        <textarea
          id="match-comment"
          value={content}
          maxLength={MAX_LENGTH}
          onChange={(e) => setContent(e.target.value)}
          placeholder={session.loggedIn ? "Share your thoughts" : "Log in to comment"}
          disabled={submitting || !session.loggedIn}
          rows={3}
        />
        <div className="row space-between">
          <small>
            {content.length}/{MAX_LENGTH}
          </small>
          <button type="submit" disabled={submitting || !session.loggedIn}>
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>
      {feedback && (
        <p className={`status status--${feedback.type}`}>{feedback.message}</p>
      )}
      {error && <p className="status status--error">Could not load comments.</p>}
      {(isLoading || isValidating) && <p>Loading…</p>}
      <ul className="stack">
        {comments.map((c) => (
          <li key={c.id} className="stack">
            <div className="row space-between">
              <span className="text-muted">@{c.username}</span>
              <span className="text-muted">
                {formatDateTime(c.createdAt, locale, timeZone)}
              </span>
            </div>
            <p>{c.content}</p>
            {(session.admin || session.userId === c.userId) && (
              <button
                className="button button--link"
                type="button"
                onClick={() => void remove(c.id, c.userId)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
        {!comments.length && !isLoading && <li className="text-muted">No comments yet.</li>}
      </ul>
    </section>
  );
}
