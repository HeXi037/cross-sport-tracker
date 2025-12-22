"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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

interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  username: string;
  content: string;
  channel: string;
  createdAt: string;
}

interface ChatPage {
  items: ChatMessage[];
  total: number;
  limit: number;
  offset: number;
}

const MAX_LENGTH = 500;

export default function ChatPanel({ matchId }: { matchId: string }) {
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useState<
    | { type: "success" | "error"; message: string }
    | null
  >(null);
  const [session, setSession] = useState(() => ({
    loggedIn: isLoggedIn(),
    userId: currentUserId(),
    admin: isAdmin(),
  }));
  const inputRef = useRef<HTMLInputElement>(null);
  const locale = useLocale();
  const timeZone = useTimeZone();

  const { data, error, isLoading, mutate } = useApiSWR<ChatPage>(
    `/v0/matches/${matchId}/chat`,
    { swr: { revalidateOnMount: true, refreshInterval: 5000 } }
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
    setFeedback((current) => (current?.type === "error" ? null : current));
    if (session.loggedIn) {
      inputRef.current?.focus();
    }
  }, [session.loggedIn]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!session.loggedIn) {
      setFeedback({ type: "error", message: "Log in to chat." });
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      setFeedback({ type: "error", message: "Message cannot be empty." });
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setFeedback({ type: "error", message: "Message too long." });
      return;
    }
    try {
      const response = await apiFetch(`/v0/matches/${matchId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const message = (await response.json()) as ChatMessage;
      setContent("");
      await mutate(
        (current) => {
          const base: ChatPage =
            current ?? { items: [], total: 0, limit: 50, offset: 0 };
          return {
            ...base,
            items: [message, ...base.items].slice(0, base.limit),
            total: base.total + 1,
          };
        },
        { populateCache: true, revalidate: false }
      );
      setFeedback({ type: "success", message: "Message sent." });
    } catch (err) {
      const apiErr = err as ApiError;
      const message = apiErr?.parsedMessage || apiErr?.message || "Could not send.";
      setFeedback({ type: "error", message });
    }
  }

  async function remove(id: string, ownerId: string) {
    if (!session.loggedIn) {
      setFeedback({ type: "error", message: "Log in to manage chat." });
      return;
    }
    if (!session.admin && session.userId !== ownerId) {
      setFeedback({ type: "error", message: "You can only delete your messages." });
      return;
    }
    try {
      await apiFetch(`/v0/matches/${matchId}/chat/${id}`, { method: "DELETE" });
      await mutate(undefined, { revalidate: true });
    } catch (err) {
      const apiErr = err as ApiError;
      const message = apiErr?.parsedMessage || apiErr?.message || "Could not delete.";
      setFeedback({ type: "error", message });
    }
  }

  return (
    <section className="card">
      <h2 className="heading">Live chat</h2>
      <form className="stack" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-message">
          Chat message
        </label>
        <input
          id="chat-message"
          type="text"
          ref={inputRef}
          value={content}
          maxLength={MAX_LENGTH}
          onChange={(e) => setContent(e.target.value)}
          placeholder={session.loggedIn ? "Say hello" : "Log in to chat"}
          disabled={!session.loggedIn}
        />
        {!session.loggedIn && (
          <p className="text-muted">
            {/* TODO: localize helper copy. */}
            Log in to chat with other fans.{" "}
            <a className="button button--link" href="/login">
              Log in
            </a>
          </p>
        )}
        <button type="submit" disabled={!session.loggedIn}>
          Send
        </button>
      </form>
      {feedback && (
        <p className={`status status--${feedback.type}`}>{feedback.message}</p>
      )}
      {error && <p className="status status--error">Could not load chat.</p>}
      {isLoading && <p>Loading…</p>}
      <ul className="stack">
        {(data?.items || []).map((msg) => (
          <li key={msg.id} className="stack">
            <div className="row space-between">
              <span className="text-muted">@{msg.username}</span>
              <span className="text-muted">
                {formatDateTime(msg.createdAt, locale, "compact", timeZone)}
              </span>
            </div>
            <p>{msg.content}</p>
            {(session.admin || session.userId === msg.userId) && (
              <button
                type="button"
                className="button button--link"
                onClick={() => void remove(msg.id, msg.userId)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
        {!data?.items?.length && !isLoading && (
          <li className="text-muted">No chat yet.</li>
        )}
      </ul>
    </section>
  );
}
