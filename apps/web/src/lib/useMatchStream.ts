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
    typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${typeof window !== "undefined" ? window.location.host : ""}${httpUrl}`;
}

export function useMatchStream(id: string) {
  const [event, setEvent] = useState<MatchEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setConnected(false);
    setFallback(false);

    let ws: WebSocket | null = null;
    let timer: NodeJS.Timer | null = null;
    let stopped = false;
    const url = buildWsUrl(`/v0/matches/${encodeURIComponent(id)}/stream`);

    const startPolling = () => {
      if (timer || stopped) return;
      setFallback(true);
      timer = setInterval(async () => {
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
        ws.onclose = () => {
          setConnected(false);
          startPolling();
        };
        ws.onmessage = (e) => {
          try {
            setEvent(JSON.parse(e.data));
          } catch (err) {
            console.error("ws message parse failed", err);
          }
        };
      } catch (err) {
        console.error("ws connection failed", err);
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      stopped = true;
      ws?.close();
      if (timer) clearInterval(timer);
    };
  }, [id]);

  return { event, connected, fallback };
}

