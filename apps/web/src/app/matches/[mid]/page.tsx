"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Match = {
  id: number | string;
  sport: "padel" | "bowling" | string;
  details?: unknown;
};

type WsState = "idle" | "connecting" | "open" | "closed" | "error";

const httpBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function makeWsUrl(mid: string | number) {
  if (/^https?:\/\//i.test(httpBase)) {
    return (
      httpBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:") +
      `/v0/matches/${mid}/stream`
    );
  }
  const proto =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss"
      : "ws";
  return `${proto}://${window.location.host}${httpBase}/v0/matches/${mid}/stream`;
}

export default function MatchPage({ params }: { params: { mid: string } }) {
  const mid = params.mid;
  const [match, setMatch] = useState<Match | null>(null);
  const [details, setDetails] = useState<unknown>(null);
  const [events, setEvents] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [wsState, setWsState] = useState<WsState>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<{ tries: number; timer: ReturnType<typeof setTimeout> | null }>({
    tries: 0,
    timer: null,
  });

  async function loadInitial() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${httpBase}/v0/matches/${mid}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load match: ${res.status} ${await res.text()}`);
      const m = (await res.json()) as Match & { events?: unknown };
      setMatch(m);
      setDetails(m.details ?? null);

      if (Array.isArray((m as { events?: unknown }).events)) {
        setEvents((m as { events: unknown[] }).events);
      } else {
        const ev = await fetch(`${httpBase}/v0/matches/${mid}/events`, { cache: "no-store" });
        if (ev.ok) setEvents(await ev.json());
      }
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Could not load match.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid]);

  useEffect(() => {
    if (!match) return;

    function connect() {
      try {
        setWsState("connecting");
        const ws = new WebSocket(makeWsUrl(mid));
        wsRef.current = ws;

        ws.onopen = () => {
          setWsState("open");
          if (reconnectRef.current.timer) clearTimeout(reconnectRef.current.timer);
          reconnectRef.current.tries = 0;
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data) as Record<string, unknown>;
            if ("event" in msg) {
              setEvents((prev) => [...prev, (msg as { event: unknown }).event]);
            }
            if ("details" in msg) {
              setDetails((msg as { details: unknown }).details);
            }
            if ("match" in msg) setMatch((msg as { match: Match }).match);
            if (Array.isArray((msg as { events?: unknown }).events)) {
              setEvents((msg as { events: unknown[] }).events);
            }
          } catch (e) {
            console.warn("WS message parse error:", e);
          }
        };

        ws.onerror = () => {
          setWsState("error");
        };

        ws.onclose = () => {
          setWsState("closed");
          const next = Math.min(10000, 500 * Math.pow(2, reconnectRef.current.tries++));
          reconnectRef.current.timer = setTimeout(connect, next);
        };
      } catch {
        setWsState("error");
      }
    }

    connect();
    return () => {
      if (reconnectRef.current.timer) clearTimeout(reconnectRef.current.timer);
      reconnectRef.current.tries = 0;
      if (wsRef.current && (wsRef.current.readyState === 0 || wsRef.current.readyState === 1)) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [match, mid]);

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

  const prettyScore = useMemo(() => {
    if (!details) return null;

    if (match?.sport === "padel") {
      const d = details as Record<string, unknown>;
      const s = (d.score as Record<string, unknown>) || d;
      const games =
        (s.games as Record<string, unknown>) ||
        (s.set as Record<string, unknown>) ||
        (s.gamesWon as Record<string, unknown>) || {};
      const points =
        (s.points as Record<string, unknown>) ||
        (s.game as Record<string, unknown>) ||
        (s.current as Record<string, unknown>) || {};
      const gA = (games.A as number) ?? (games.a as number) ?? 0;
      const gB = (games.B as number) ?? (games.b as number) ?? 0;
      const pA = (points.A as number | string) ?? (points.a as number | string) ?? 0;
      const pB = (points.B as number | string) ?? (points.b as number | string) ?? 0;
      return (
        <div style={{ fontSize: 20 }}>
          <div>
            <strong>Games</strong> — A: {gA} • B: {gB}
          </div>
          <div>
            <strong>Points</strong> — A: {String(pA)} • B: {String(pB)}
          </div>
        </div>
      );
    }

    if (match?.sport === "bowling") {
      const d = details as Record<string, unknown>;
      const total =
        (d.total as number | undefined) ??
        (d.score as number | undefined) ??
        (d.sum as number | undefined) ??
        (Array.isArray(d.rolls)
          ? (d.rolls as unknown[]).reduce(
              (a, b) => a + (typeof b === "number" ? b : 0),
              0,
            )
          : 0);
      return (
        <div style={{ fontSize: 20 }}>
          <div>
            <strong>Total</strong>: {total}
          </div>
          {"frames" in d && Array.isArray(d.frames) && (
            <div style={{ marginTop: 6 }}>
              <strong>Frames</strong>: {(d.frames as unknown[])
                .map((f, i) =>
                  `[${i + 1}:${Array.isArray(f) ? (f as unknown[]).join(",") : String(f)}]`,
                )
                .join(" ")}
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
            <strong>Sport:</strong> {match.sport} {" · "}
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
                <button className="button" disabled={posting} onClick={() => sendPadelPoint("A")}>
                  Point A
                </button>
                <button className="button" disabled={posting} onClick={() => sendPadelPoint("B")}>
                  Point B
                </button>
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
