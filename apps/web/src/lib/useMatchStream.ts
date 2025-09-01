"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "./api";

export interface MatchEvent {
  sets?: Array<[number, number] | { A: number; B: number }> | null;
  [key: string]: unknown;
}

function buildWsUrl(path: string): string {
  const httpUrl = apiUrl(path);
  if (httpUrl.startsWith("http")) {
    return httpUrl.replace(/^http/, "ws");
  }
  const proto =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss"
      : "ws";
  return `${proto}://${
    typeof window !== "undefined" ? window.location.host : ""
  }${httpUrl}`;
}

export function useMatchStream(id: string) {
  const [event, setEvent] = useState<MatchEvent | null>(null);

  useEffect(() => {
    if (!id) return;

    let ws: WebSocket | null = null;
    // IMPORTANT: use a DOM number, not NodeJS.Timeout/Timer
    let pollTimer: number | null = null;

    const startPolling = () => {
      if (pollTimer !== null) return;
      pollTimer = window.setInterval(async () => {
        try {
          const res = (await apiFetch(
            `/v0/matches/${encodeURIComponent(id)}`
          )) as unknown as Response;
        // ^ apiFetch currently returns a Response in this app
          if (res.ok) {
            setEvent((await res.json()) as MatchEvent);
          }
        } catch {
          // ignore intermittent failures; keep polling
        }
      }, 5000);
    };

    const url = buildWsUrl(`/v0/matches/${encodeURIComponent(id)}/stream`);

    if (typeof window !== "undefined" && "WebSocket" in window) {
      try {
        ws = new WebSocket(url);
        ws.onmessage = (e) => {
          try {
            setEvent(JSON.parse(e.data));
          } catch {
            /* ignore malformed frames */
          }
        };
        // If socket fails or closes, fallback to polling
        ws.onerror = () => startPolling();
        ws.onclose = () => startPolling();
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    // Reconnect when id changes
  }, [id]);

  return event;
}
