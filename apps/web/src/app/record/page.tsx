"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function RecordPage() {
  const router = useRouter();

  const [names, setNames] = useState({ a1: "", a2: "", b1: "", b2: "" });
  const [suggest, setSuggest] = useState<Record<string, any[]>>({});
  const [sets, setSets] = useState<Array<{ A: string; B: string }>>([
    { A: "", B: "" },
  ]);
  const [playedAt, setPlayedAt] = useState("");
  const [location, setLocation] = useState("");

  // QoL: debounce lookups so we don't spam the API
  const timers = useRef<
    Record<string, ReturnType<typeof setTimeout> | undefined>
  >({});

  async function search(term: string, key: string) {
    if (timers.current[key]) clearTimeout(timers.current[key]!);
    if (!term) return;

    timers.current[key] = setTimeout(async () => {
      try {
        const res = await fetch(
          `${base}/v0/players?q=${encodeURIComponent(term)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggest((s) => ({ ...s, [key]: data }));
      } catch {
        // ignore transient errors
      }
    }, 250);
  }

  function onNameChange(key: keyof typeof names, value: string) {
    setNames((n) => ({ ...n, [key]: value }));
    search(value, key);
  }

  function onSetChange(idx: number, field: "A" | "B", value: string) {
    setSets((prev) => {
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  }

  function addSet() {
    setSets((prev) => [...prev, { A: "", B: "" }]);
  }

  async function submit() {
    // QoL: parse and drop incomplete/blank rows to avoid NaN payloads
    const parsedSets = sets
      .map(
        (s) => [parseInt(s.A, 10), parseInt(s.B, 10)] as [number, number]
      )
      .filter(
        ([a, b]) => Number.isFinite(a) && Number.isFinite(b)
      );

    if (parsedSets.length === 0) {
      alert("Please enter at least one completed set score.");
      return;
    }

    // 1) Create the match using player *names*
    const body = {
      sport: "padel",
      participants: [
        { side: "A", playerNames: [names.a1, names.a2] },
        { side: "B", playerNames: [names.b1, names.b2] },
      ],
      bestOf: 3,
      playedAt: playedAt ? new Date(playedAt).toISOString() : undefined,
      location: location || undefined,
    };

    const createRes = await fetch(`${base}/v0/matches/by-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!createRes.ok) {
      alert("Failed to create match.");
      return;
    }
    const { id } = (await createRes.json()) as { id: string };

    // 2) Push the set results
    const setsRes = await fetch(`${base}/v0/matches/${id}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sets: parsedSets }),
    });
    if (!setsRes.ok) {
      alert("Failed to submit set scores.");
      return;
    }

    router.push(`/matches/${id}`);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Record Match</h1>

      <section style={{ marginBottom: 16 }}>
        <h2>Players</h2>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <input
              value={names.a1}
              onChange={(e) => onNameChange("a1", e.target.value)}
              list="a1"
              placeholder="Player A1"
            />
            <datalist id="a1">
              {(suggest.a1 || []).map((p: any) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>
          <div>
            <input
              value={names.a2}
              onChange={(e) => onNameChange("a2", e.target.value)}
              list="a2"
              placeholder="Player A2"
            />
            <datalist id="a2">
              {(suggest.a2 || []).map((p: any) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>
          <div>
            <input
              value={names.b1}
              onChange={(e) => onNameChange("b1", e.target.value)}
              list="b1"
              placeholder="Player B1"
            />
            <datalist id="b1">
              {(suggest.b1 || []).map((p: any) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>
          <div>
            <input
              value={names.b2}
              onChange={(e) => onNameChange("b2", e.target.value)}
              list="b2"
              placeholder="Player B2"
            />
            <datalist id="b2">
              {(suggest.b2 || []).map((p: any) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2>Sets</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {sets.map((s, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={s.A}
                onChange={(e) => onSetChange(idx, "A", e.target.value)}
                placeholder="A"
                style={{ width: 64 }}
              />
              <span>-</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={s.B}
                onChange={(e) => onSetChange(idx, "B", e.target.value)}
                placeholder="B"
                style={{ width: 64 }}
              />
            </div>
          ))}
        </div>
        <button style={{ marginTop: 8 }} onClick={addSet} type="button">
          Add Set
        </button>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2>Details</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
          />
        </div>
      </section>

      <button onClick={submit} type="button">
        Save
      </button>
    </main>
  );
}

