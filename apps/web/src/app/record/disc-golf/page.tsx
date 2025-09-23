"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function DiscGolfForm() {
  const params = useSearchParams();
  const mid = params.get("mid") || "";
  const hasMatchId = Boolean(mid);
  const [hole, setHole] = useState(1);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!hasMatchId) return;
    setError(null);
    const events = [
      { type: "HOLE", side: "A", hole, strokes: Number(a) },
      { type: "HOLE", side: "B", hole, strokes: Number(b) },
    ];
    try {
      for (const ev of events) {
        await fetch(`${base}/v0/matches/${mid}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ev),
        });
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
        <p>
          Select a match before recording scores. Open this page from a match
          scoreboard or include a match id in the link.
        </p>
      )}
      <p>Hole {hole}</p>
      <div className="scores">
        <input
          type="number"
          placeholder="A"
          value={a}
          onChange={(e) => setA(e.target.value)}
          disabled={!hasMatchId}
        />
        <input
          type="number"
          placeholder="B"
          value={b}
          onChange={(e) => setB(e.target.value)}
          disabled={!hasMatchId}
        />
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
