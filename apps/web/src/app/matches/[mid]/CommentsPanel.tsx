"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  SESSION_CHANGED_EVENT,
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
const REPLY_COLLAPSE_THRESHOLD = 4;
const REPLY_PREVIEW_COUNT = 2;

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
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>(
    {}
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const t = useTranslations("Matches.comments");
  const commonT = useTranslations("Common");
  const locale = useLocale();
  const timeZone = useTimeZone();

  const { data, error, isLoading, isValidating, mutate } = useApiSWR<CommentPage>(
    `/v0/matches/${matchId}/comments`,
    {
      swr: { revalidateOnMount: true },
    }
  );

  const comments = data?.items ?? [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateSession = () =>
      setSession({
        loggedIn: isLoggedIn(),
        userId: currentUserId(),
        admin: isAdmin(),
      });
    window.addEventListener(SESSION_CHANGED_EVENT, updateSession);
    window.addEventListener(SESSION_ENDED_EVENT, updateSession);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, updateSession);
      window.removeEventListener(SESSION_ENDED_EVENT, updateSession);
    };
  }, []);

  useEffect(() => {
    if (!session.loggedIn) {
      setContent("");
    }
  }, [session.loggedIn]);

  useEffect(() => {
    setFeedback((current) => (current?.type === "error" ? null : current));
    if (session.loggedIn) {
      textareaRef.current?.focus();
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

  function toggleReplies(id: string) {
    setExpandedThreads((current) => ({ ...current, [id]: !current[id] }));
  }

  function renderComment(comment: MatchComment, depth: number) {
    const replies = comment.replies ?? [];
    const hasManyReplies = replies.length >= REPLY_COLLAPSE_THRESHOLD;
    const isExpanded = expandedThreads[comment.id] ?? !hasManyReplies;
    const visibleReplies =
      isExpanded || !hasManyReplies
        ? replies
        : replies.slice(0, REPLY_PREVIEW_COUNT);
    const hiddenCount = replies.length - visibleReplies.length;

    return (
      <li
        key={comment.id}
        className="stack comment"
        style={{ marginLeft: `${depth * 16}px` }}
      >
        <div className="row space-between">
          <span className="text-muted">@{comment.username}</span>
          <span className="text-muted">
            {formatDateTime(comment.createdAt, locale, "compact", timeZone)}
          </span>
        </div>
        <p>{comment.content}</p>
        {(session.admin || session.userId === comment.userId) && (
          <button
            className="button button--link"
            type="button"
            onClick={() => void remove(comment.id, comment.userId)}
          >
            {t("actions.delete")}
          </button>
        )}
        {hasManyReplies && (
          <button
            className="button button--link text-muted"
            type="button"
            onClick={() => toggleReplies(comment.id)}
            aria-expanded={isExpanded}
          >
            {isExpanded
              ? t("replies.hide")
              : t("replies.viewMore", { count: hiddenCount })}
          </button>
        )}
        {visibleReplies.length > 0 && (
          <ul className="stack comment__replies">
            {visibleReplies.map((reply) => renderComment(reply, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <section className="card">
      <h2 className="heading">{t("title")}</h2>
      <form className="stack" onSubmit={submit}>
        <label className="sr-only" htmlFor="match-comment">
          {t("label")}
        </label>
        <textarea
          id="match-comment"
          ref={textareaRef}
          value={content}
          maxLength={MAX_LENGTH}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            session.loggedIn
              ? t("placeholder.authenticated")
              : t("placeholder.guest")
          }
          disabled={submitting || !session.loggedIn}
          rows={3}
        />
        {!session.loggedIn && (
          <p className="text-muted">
            {t("helper")}{" "}
            <a className="button button--link" href="/login">
              {commonT("actions.login")}
            </a>
          </p>
        )}
        <div className="row space-between">
          <small>
            {content.length}/{MAX_LENGTH}
          </small>
          <button type="submit" disabled={submitting || !session.loggedIn}>
            {submitting ? commonT("status.saving") : t("actions.post")}
          </button>
        </div>
      </form>
      {feedback && (
        <p className={`status status--${feedback.type}`}>{feedback.message}</p>
      )}
      {error && <p className="status status--error">{t("errors.load")}</p>}
      {(isLoading || isValidating) && <p>{commonT("status.loading")}</p>}
      <ul className="stack">
        {comments.map((c) => renderComment(c, 0))}
        {!comments.length && !isLoading && (
          <li className="text-muted">{t("empty")}</li>
        )}
      </ul>
    </section>
  );
}
