"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SESSION_ENDED_EVENT,
  SESSION_ENDED_STORAGE_KEY,
  type SessionEndDetail,
} from "../lib/api";

function parseSessionEnd(value: string | null): SessionEndDetail | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SessionEndDetail>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed.reason !== "expired" && parsed.reason !== "error") ||
      typeof parsed.timestamp !== "number"
    ) {
      return null;
    }
    return { reason: parsed.reason, timestamp: parsed.timestamp } as SessionEndDetail;
  } catch {
    return null;
  }
}

export default function SessionBanner() {
  const [sessionEnd, setSessionEnd] = useState<SessionEndDetail | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage?.getItem(SESSION_ENDED_STORAGE_KEY) ?? null;
      return parseSessionEnd(raw);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSessionEnded = (event: Event) => {
      const detail = (event as CustomEvent<SessionEndDetail | null>).detail;
      if (detail) {
        setSessionEnd(detail);
      } else {
        try {
          const raw = window.localStorage?.getItem(SESSION_ENDED_STORAGE_KEY) ?? null;
          setSessionEnd(parseSessionEnd(raw));
        } catch {
          setSessionEnd(null);
        }
      }
    };

    window.addEventListener(SESSION_ENDED_EVENT, handleSessionEnded as EventListener);
    return () => {
      window.removeEventListener(
        SESSION_ENDED_EVENT,
        handleSessionEnded as EventListener
      );
    };
  }, []);

  const dismiss = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage?.removeItem(SESSION_ENDED_STORAGE_KEY);
    } catch {
      // Ignore storage errors when dismissing the banner.
    }
    setSessionEnd(null);
  }, []);

  if (!sessionEnd || sessionEnd.reason !== "expired") {
    return null;
  }

  return (
    <div className="session-banner" role="status" aria-live="assertive">
      <span>Your session has expired. Please log in again.</span>
      <button
        type="button"
        className="session-banner__close"
        onClick={dismiss}
        aria-label="Dismiss session expiration notice"
      >
        ×
      </button>
    </div>
  );
}
