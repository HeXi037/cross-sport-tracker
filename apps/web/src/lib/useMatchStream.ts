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
  const [connected, setConnected] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setConnected(false);
    setFallback(false);
    if (!id) return;

    let ws: WebSocket | null = null;
    // IMPORTANT: use a DOM number, not NodeJS.Timeout/Timer
    let pollTimer: number | null = null;
    let stopped = false;

    const url = buildWsUrl(`/v0/matches/${encodeURIComponent(id)}/stream`);

    const startPolling = () => {
      if (pollTimer !== null || stopped) return;
      setFallback(true);
      pollTimer = window.setInterval(async () => {
        try {
          const res = (await apiFetch(
            `/v0/matches/${encodeURIComponent(id)}`
          )) as Response;
          if (res.ok) {
            setEvent((await res.json()) as MatchEvent);
          }
        } catch (err) {
          console.error("polling failed", err);
        }
      }, 5000);
    };

    if (typeof window !== "undefined" && "WebSocket" in window) {
      try {
        ws = new WebSocket(url);
        ws.onopen = () => setConnected(true);
        ws.onmessage = (e) => {
          try {
            setEvent(JSON.parse(e.data));
          } catch {
            /* ignore malformed frames */
          }
        };
        const handleSocketFallback = () => {
          setConnected(false);
          startPolling();
        };
        ws.onerror = handleSocketFallback;
        ws.onclose = handleSocketFallback;
      } catch (err) {
        console.error("ws connection failed", err);
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      stopped = true;
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

  return { event, connected, fallback };
}
