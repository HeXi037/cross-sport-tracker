"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function RecordPage() {
  const router = useRouter();
  const [names, setNames] = useState({ a1: "", a2: "", b1: "", b2: "" });
  const [suggest, setSuggest] = useState<Record<string, any[]>>({});
  const [sets, setSets] = useState([{ A: "", B: "" }]);
  const [playedAt, setPlayedAt] = useState("");
  const [location, setLocation] = useState("");

  async function search(term: string, key: string) {
    if (!term) return;
    const res = await fetch(`${base}/v0/players?q=${encodeURIComponent(term)}`);
    if (res.ok) setSuggest(s => ({ ...s, [key]: await res.json() }));
  }

  function onNameChange(key: string, value: string) {
    setNames({ ...names, [key]: value });
    search(value, key);
  }

  function onSetChange(idx: number, field: "A" | "B", value: string) {
    const copy = sets.slice();
    copy[idx][field] = value;
    setSets(copy);
  }

  function addSet() {
    setSets([...sets, { A: "", B: "" }]);
  }

  async function submit() {
    const body = {
      sport: "padel",
      participants: [
        { side: "A", playerNames: [names.a1, names.a2] },
        { side: "B", playerNames: [names.b1, names.b2] }
      ],
      bestOf: 3,
      playedAt: playedAt ? new Date(playedAt).toISOString() : undefined,
      location: location || undefined,
    };
    const res = await fetch(`${base}/v0/matches/by-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const { id } = await res.json();
    const payload = { sets: sets.map(s => [Number(s.A), Number(s.B)]) };
    await fetch(`${base}/v0/matches/${id}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    router.push(`/matches/${id}`);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Record Match</h1>
      <div>
        <input value={names.a1} onChange={e => onNameChange("a1", e.target.value)} list="a1" placeholder="Player A1" />
        <datalist id="a1">{(suggest.a1 || []).map(p => <option key={p.id} value={p.name} />)}</datalist>
        <input value={names.a2} onChange={e => onNameChange("a2", e.target.value)} list="a2" placeholder="Player A2" />
        <datalist id="a2">{(suggest.a2 || []).map(p => <option key={p.id} value={p.name} />)}</datalist>
      </div>
      <div>
        <input value={names.b1} onChange={e => onNameChange("b1", e.target.value)} list="b1" placeholder="Player B1" />
        <datalist id="b1">{(suggest.b1 || []).map(p => <option key={p.id} value={p.name} />)}</datalist>
        <input value={names.b2} onChange={e => onNameChange("b2", e.target.value)} list="b2" placeholder="Player B2" />
        <datalist id="b2">{(suggest.b2 || []).map(p => <option key={p.id} value={p.name} />)}</datalist>
      </div>
      <div>
        {sets.map((s, idx) => (
          <div key={idx}>
            <input value={s.A} onChange={e => onSetChange(idx, "A", e.target.value)} placeholder="A" />
            -
            <input value={s.B} onChange={e => onSetChange(idx, "B", e.target.value)} placeholder="B" />
          </div>
        ))}
        <button onClick={addSet}>Add Set</button>
      </div>
      <div>
        <input type="date" value={playedAt} onChange={e => setPlayedAt(e.target.value)} />
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" />
      </div>
      <button onClick={submit}>Save</button>
    </main>
  );
}
