"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Match = {
  id: number | string;
  sport: "padel" | "bowling" | string;
  details?: any;
};

type WsState = "idle" | "connecting" | "open" | "closed" | "error";

const httpBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function makeWsUrl(mid: string | number) {
  // Works whether NEXT_PUBLIC_API_BASE_URL is absolute (http/https) or relative (/api)
  if (/^https?:\/\//i.test(httpBase)) {
    return httpBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:") + `/v0/matches/${mid}/stream`;
  }
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${httpBase}/v0/matches/${mid}/stream`;
}

export default function MatchPage({ params }: { params: { mid: string } }) {
  const mid = params.mid;
  const [match, setMatch] = useState<Match | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // WebSocket state
  const [wsState, setWsState] = useState<WsState>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef({ tries: 0, timer: 0 as any });

  // ---- Data load (REST) ----
  async function loadInitial() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${httpBase}/v0/matches/${mid}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load match: ${res.status} ${await res.text()}`);
      const m = (await res.json()) as Match & { events?: any[] };
      setMatch(m);
      setDetails(m.details ?? null);

      // If backend returns events alongside the match, use them; otherwise try a dedicated endpoint (optional).
      if ((m as any).events) {
        setEvents((m as any).events);
      } else {
        const ev = await fetch(`${httpBase}/v0/matches/${mid}/events`, { cache: "no-store" });
        if (ev.ok) setEvents(await ev.json());
      }
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "Could not load match.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid]);

  // ---- WebSocket (live updates) ----
  useEffect(() => {
    if (!match) return;

    function connect() {
      try {
        setWsState("connecting");
        const ws = new WebSocket(makeWsUrl(mid));
        wsRef.current = ws;

        ws.onopen = () => {
          setWsState("open");
          // reset backoff
          clearTimeout(reconnectRef.current.timer);
          reconnectRef.current.tries = 0;
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            // Accept a few flexible shapes from backend:
            // - { type: "event", event: {...} }
            // - { type: "details", details: {...} }
            // - { event: {...} } or { details: {...} } (no type)
            if (msg?.event) {
              setEvents((prev) => [...prev, msg.event]);
            }
            if (msg?.details) {
              setDetails(msg.details);
            }
            // Some implementations may send a full snapshot:
            if (msg?.match) setMatch(msg.match);
            if (Array.isArray(msg?.events)) setEvents(msg.events);
          } catch (e) {
            console.warn("WS message parse error:", e);
          }
        };

        ws.onerror = () => {
          setWsState("error");
        };

        ws.onclose = () => {
          setWsState("closed");
          // Reconnect with exponential backoff (cap at ~10s)
          const next = Math.min(10000, 500 * Math.pow(2, reconnectRef.current.tries++));
          reconnectRef.current.timer = setTimeout(connect, next);
        };
      } catch (e) {
        setWsState("error");
      }
    }

    connect();
    return () => {
      clearTimeout(reconnectRef.current.timer);
      reconnectRef.current.tries = 0;
      if (wsRef.current && (wsRef.current.readyState === 0 || wsRef.current.readyState === 1)) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [match, mid]);

  // ---- Post scoring events ----
  async function sendPadelPoint(side: "A" | "B") {
    setPosting(true);
    try {
      const res = await fetch(`${httpBase}/v0/matches/${mid}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "POINT", by: side }),
      });
      if (!res.ok) {
        const txt = await res.text();
        alert(`Failed to record point: ${res.status} ${txt}`);
      }
    } finally {
      setPosting(false);
    }
  }

  async function sendBowlingRoll(pins: number) {
    if (Number.isNaN(pins) || pins < 0 || pins > 10) return;
    setPosting(true);
    try {
      const res = await fetch(`${httpBase}/v0/matches/${mid}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ROLL", pins: Number(pins) }),
      });
      if (!res.ok) {
        const txt = await res.text();
        alert(`Failed to record roll: ${res.status} ${txt}`);
      }
    } finally {
      setPosting(false);
    }
  }

  // ---- Pretty score helpers (best-effort; falls back to JSON) ----
  const prettyScore = useMemo(() => {
    if (!details) return null;

    // Try a couple of common shapes:
    // Padel example shapes this will try to honor:
    // - details.score?.games: { A: number, B: number }
    // - details.score?.points: { A: string|number, B: string|number }
    if (match?.sport === "padel") {
      const s = (details as any).score || details;
      const games = s?.games ?? s?.set ?? s?.gamesWon;
      const points = s?.points ?? s?.game ?? s?.current;
      const gA = games?.A ?? games?.a ?? 0;
      const gB = games?.B ?? games?.b ?? 0;
      const pA = points?.A ?? points?.a ?? points?.A_points ?? points?.Apoint ?? points?.Apts ?? points?.A ?? 0;
      const pB = points?.B ?? points?.b ?? points?.B_points ?? points?.Bpoint ?? points?.Bpts ?? points?.B ?? 0;
      return (
        <div style={{ fontSize: 20 }}>
          <div><strong>Games</strong> — A: {gA} • B: {gB}</div>
          <div><strong>Points</strong> — A: {String(pA)} • B: {String(pB)}</div>
        </div>
      );
    }

    // Bowling: try to show total + frame-by-frame if present
    if (match?.sport === "bowling") {
      const total =
        (details.total ??
          details.score ??
          details.sum ??
          (Array.isArray(details.rolls) ? details.rolls.reduce((a: number, b: number) => a + (Number(b) || 0), 0) : 0)) as number;
      return (
        <div style={{ fontSize: 20 }}>
          <div><strong>Total</strong>: {total}</div>
          {"frames" in details && Array.isArray(details.frames) && (
            <div style={{ marginTop: 6 }}>
              <strong>Frames</strong>: {details.frames.map((f: any, i: number) => `[${i + 1}:${Array.isArray(f) ? f.join(",") : String(f)}]`).join(" ")}
            </div>
          )}
        </div>
      );
    }

    return null;
  }, [details, match?.sport]);

  return (
    <main className="container">
      <div className="mb-12">
        <Link href="/matches">← Back to matches</Link>
      </div>

      <h1 className="heading">Match {mid}</h1>

      {loading && <p>Loading…</p>}
      {err && <p className="error">{err}</p>}

      {!loading && !err && match && (
        <>
          <p>
            <strong>Sport:</strong> {match.sport}
            {" · "}
            <strong>Live:</strong> {wsState === "open" ? "connected" : wsState}
          </p>

          <section className="card">
            <h2 className="heading">Score</h2>
            {prettyScore || <p>No pretty score for this sport yet.</p>}
            <details className="mt-8">
              <summary>Raw details JSON</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(details ?? match.details ?? {}, null, 2)}</pre>
            </details>
          </section>

          <section className="card">
            <h2 className="heading">Add Event</h2>
            {match.sport === "padel" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button" disabled={posting} onClick={() => sendPadelPoint("A")}>Point A</button>
                <button className="button" disabled={posting} onClick={() => sendPadelPoint("B")}>Point B</button>
              </div>
            )}

            {match.sport === "bowling" && (
              <BowlingControls disabled={posting} onRoll={sendBowlingRoll} />
            )}

            {match.sport !== "padel" && match.sport !== "bowling" && (
              <p>Event controls not implemented for this sport.</p>
            )}
          </section>

          <section className="card">
            <h2 className="heading">Events</h2>
            {events.length === 0 ? (
              <p>No events yet.</p>
            ) : (
              <ul>
                {events.map((e, i) => (
                  <li key={i}>
                    <code style={{ fontSize: 12 }}>{JSON.stringify(e)}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function BowlingControls({
  disabled,
  onRoll,
}: {
  disabled?: boolean;
  onRoll: (pins: number) => void;
}) {
  const [pins, setPins] = useState<string>("");

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="number"
        min={0}
        max={10}
        step={1}
        value={pins}
        onChange={(e) => setPins(e.target.value)}
        placeholder="Pins (0–10)"
        aria-label="Pins knocked down"
      />
      <button
        className="button"
        disabled={disabled || pins === "" || Number(pins) < 0 || Number(pins) > 10}
        onClick={() => {
          const n = Number(pins);
          if (!Number.isNaN(n) && n >= 0 && n <= 10) {
            onRoll(n);
            setPins("");
          }
        }}
      >
        Roll
      </button>
      <div aria-hidden style={{ fontSize: 12, opacity: 0.7 }}>
        Tip: For strikes, enter 10.
      </div>
    </div>
  );
}
