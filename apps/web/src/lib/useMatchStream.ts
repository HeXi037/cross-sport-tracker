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

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: NodeJS.Timer | null = null;
    const url = buildWsUrl(`/v0/matches/${encodeURIComponent(id)}/stream`);

    if (typeof window !== "undefined" && "WebSocket" in window) {
      try {
        ws = new WebSocket(url);
        ws.onmessage = (e) => {
          try {
            setEvent(JSON.parse(e.data));
          } catch (err) {
            console.error("ws message parse failed", err);
          }
        };
      } catch (err) {
        console.error("ws connection failed", err);
      }
    } else {
      // Fallback: poll via HTTP every 5 seconds
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
    }

    return () => {
      ws?.close();
      if (timer) clearInterval(timer);
    };
  }, [id]);

  return event;
}

