"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "../../../lib/api";
import { formatDateTime } from "../../../lib/i18n";
import { useSessionSnapshot } from "../../../lib/useSessionSnapshot";

interface AuditActor {
  id: string;
  username: string;
  is_admin: boolean;
  photo_url?: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  actor: AuditActor | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

type AuditState = {
  status: "idle" | "loading" | "loaded" | "error";
  items: AuditEntry[];
  error?: string;
};

export default function MatchAuditHistory({
  mid,
  locale,
  timeZone,
}: {
  mid: string;
  locale: string;
  timeZone: string | null;
}) {
  const session = useSessionSnapshot();
  const isAdmin = session.isAdmin;
  const [state, setState] = useState<AuditState>({ status: "idle", items: [] });

  useEffect(() => {
    if (!isAdmin) {
      setState({ status: "idle", items: [] });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ status: "loading", items: prev.items }));

    (async () => {
      try {
        const res = (await apiFetch(
          `/v0/matches/${encodeURIComponent(mid)}/audit`,
        )) as Response;
        if (!res.ok) {
          throw new Error(`Failed to load audit entries (${res.status})`);
        }
        const data = (await res.json()) as AuditEntry[];
        if (!cancelled) {
          setState({ status: "loaded", items: data });
        }
      } catch (error) {
        console.error("Failed to load match audit history", error);
        if (!cancelled) {
          setState({
            status: "error",
            items: [],
            error: "Could not load match history.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, mid]);

  if (!isAdmin) {
    return null;
  }

  let content: ReactNode;
  if (state.status === "loading" && !state.items.length) {
    content = <p className="match-detail-empty">Loading history…</p>;
  } else if (state.status === "error") {
    content = (
      <p className="match-detail-empty" role="alert">
        {state.error || "Could not load match history."}
      </p>
    );
  } else if (!state.items.length) {
    content = (
      <p className="match-detail-empty">No history recorded yet.</p>
    );
  } else {
    content = (
      <ul className="match-detail-list" aria-live="polite">
        {state.items.map((entry) => {
          const actorName = entry.actor?.username ?? "System";
          const timestamp = formatDateTime(
            entry.createdAt,
            locale,
            "compact",
            timeZone,
          );
          return (
            <li key={entry.id} className="match-detail-list__item">
              <div className="match-detail-list__time">{timestamp}</div>
              <div className="match-detail-list__action">{entry.action}</div>
              <div className="match-detail-list__actor">{actorName}</div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section
      className="card match-detail-card"
      aria-labelledby="match-audit-history-heading"
    >
      <h2 id="match-audit-history-heading" className="match-detail-card__title">
        Admin · Match history
      </h2>
      {content}
    </section>
  );
}
