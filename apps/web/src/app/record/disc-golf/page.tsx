"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type MatchSummary = {
  id: string;
  sport: string;
  location?: string | null;
  playedAt?: string | null;
};

const MATCH_FETCH_LIMIT = 50;

function DiscGolfForm() {
  const params = useSearchParams();
  const router = useRouter();
  const mid = params.get("mid") || "";
  const [currentMatchId, setCurrentMatchId] = useState(mid);
  const hasMatchId = Boolean(currentMatchId);
  const [hole, setHole] = useState(1);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matchPickerError, setMatchPickerError] = useState<string | null>(null);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [availableMatches, setAvailableMatches] = useState<MatchSummary[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const matchOptions = useMemo(
    () => availableMatches.filter((m) => m.sport === "disc_golf"),
    [availableMatches],
  );

  useEffect(() => {
    setCurrentMatchId((prev) => {
      if (prev === mid) {
        return prev;
      }
      return mid;
    });
  }, [mid]);

  useEffect(() => {
    if (mid) return;
    let cancelled = false;
    const controller = new AbortController();
    setIsLoadingMatches(true);
    setMatchPickerError(null);
    (async () => {
      try {
        const res = await fetch(
          `${base}/v0/matches?limit=${MATCH_FETCH_LIMIT}&offset=0`,
          {
            method: "GET",
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          throw new Error("Failed to load matches");
        }
        const data = (await res.json()) as MatchSummary[];
        if (!cancelled) {
          setAvailableMatches(data);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setMatchPickerError("Failed to load existing disc golf matches.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMatches(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mid]);

  const navigateToMatch = (matchId: string) => {
    setCurrentMatchId(matchId);
    setHole(1);
    setA("");
    setB("");
    setError(null);
    setMatchPickerError(null);
    router.push(`/record/disc-golf/?mid=${encodeURIComponent(matchId)}`);
  };

  const startMatch = async () => {
    setCreatingMatch(true);
    setMatchPickerError(null);
    try {
      const res = await fetch(`${base}/v0/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: "disc_golf",
          participants: [],
          details: { sport: "disc_golf" },
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to create match");
      }
      const data = (await res.json()) as { id: string };
      navigateToMatch(data.id);
    } catch {
      setMatchPickerError("Failed to start a new match.");
    } finally {
      setCreatingMatch(false);
    }
  };

  const submit = async () => {
    if (!hasMatchId) return;
    setError(null);
    const events = [
      { type: "HOLE", side: "A", hole, strokes: Number(a) },
      { type: "HOLE", side: "B", hole, strokes: Number(b) },
    ];
    try {
      for (const ev of events) {
        const res = await fetch(`${base}/v0/matches/${currentMatchId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ev),
        });
        if (!res.ok) {
          throw new Error("Failed to record event");
        }
      }
      setHole((h) => h + 1);
      setA("");
      setB("");
    } catch {
      setError("Failed to record event.");
    }
  };

  return (
    <main className="container">
      <h1 className="heading">Record Disc Golf</h1>
      {!hasMatchId && (
        <div className="form-stack">
          <p>
            Start a new match or choose an existing disc golf match before
            recording hole scores.
          </p>
          <div className="form-grid form-grid--two">
            <button type="button" onClick={startMatch} disabled={creatingMatch}>
              {creatingMatch ? "Starting…" : "Start new match"}
            </button>
            <label className="form-field" htmlFor="disc-golf-existing-match">
              <span className="form-label">Existing match</span>
              <select
                id="disc-golf-existing-match"
                onChange={(event) => {
                  const matchId = event.target.value;
                  if (matchId) {
                    navigateToMatch(matchId);
                  }
                }}
                disabled={isLoadingMatches || matchOptions.length === 0}
                defaultValue=""
              >
                <option value="" disabled>
                  {isLoadingMatches
                    ? "Loading matches…"
                    : "Select a disc golf match"}
                </option>
                {matchOptions.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {matchPickerError && <p>{matchPickerError}</p>}
        </div>
      )}
      <p>Hole {hole}</p>
      <div className="scores form-grid form-grid--two">
        <label className="form-field" htmlFor="disc-golf-score-a">
          <span className="form-label">Player A strokes</span>
          <input
            id="disc-golf-score-a"
            type="number"
            placeholder="A"
            value={a}
            onChange={(e) => setA(e.target.value)}
            disabled={!hasMatchId}
            inputMode="numeric"
            min="0"
          />
        </label>
        <label className="form-field" htmlFor="disc-golf-score-b">
          <span className="form-label">Player B strokes</span>
          <input
            id="disc-golf-score-b"
            type="number"
            placeholder="B"
            value={b}
            onChange={(e) => setB(e.target.value)}
            disabled={!hasMatchId}
            inputMode="numeric"
            min="0"
          />
        </label>
      </div>
      <button onClick={submit} disabled={!hasMatchId}>
        Record Hole
      </button>
      {error && <p>{error}</p>}
    </main>
  );
}

function DiscGolfLoading() {
  return (
    <main className="container">
      <h1 className="heading">Record Disc Golf</h1>
    </main>
  );
}

export default function RecordDiscGolfPage() {
  return (
    <Suspense fallback={<DiscGolfLoading />}>
      <DiscGolfForm />
    </Suspense>
  );
}
