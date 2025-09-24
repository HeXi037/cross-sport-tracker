"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";

interface Player {
  id: string;
  name: string;
}

interface IdMap {
  a1: string;
  a2: string;
  b1: string;
  b2: string;
}

interface SetScore {
  A: string;
  B: string;
}

interface CreateMatchPayload {
  sport: string;
  participants: { side: string; playerIds: string[] }[];
  bestOf: number;
  playedAt?: string;
  location?: string;
}

function getDatePlaceholder(locale: string): string {
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const sample = formatter.formatToParts(new Date(Date.UTC(2020, 11, 31)));
    return sample
      .map((part) => {
        switch (part.type) {
          case "day":
            return "dd";
          case "month":
            return "mm";
          case "year":
            return "yyyy";
          default:
            return part.value;
        }
      })
      .join("");
  } catch {
    return "yyyy-mm-dd";
  }
}

export default function RecordPadelPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState<IdMap>({ a1: "", a2: "", b1: "", b2: "" });
  const [bestOf, setBestOf] = useState("3");
  const [sets, setSets] = useState<SetScore[]>([{ A: "", B: "" }]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalidSetIndexes, setInvalidSetIndexes] = useState<number[]>([]);
  const [dateLocale, setDateLocale] = useState<string>("en-US");
  const [datePlaceholder, setDatePlaceholder] = useState<string>(
    getDatePlaceholder("en-US"),
  );

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await apiFetch(`/v0/players`);
        const data = (await res.json()) as { players: Player[] };
        setPlayers(data.players || []);
      } catch (err: unknown) {
        setError("Failed to load players");
        const status = (err as { status?: number }).status;
        if (status === 401) {
          router.push("/login");
        }
      }
    }
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const locale = window.navigator?.language || "en-US";
    setDateLocale(locale);
    setDatePlaceholder(getDatePlaceholder(locale));
  }, []);

  const handleIdChange = (key: keyof IdMap, value: string) => {
    setIds((prev) => ({ ...prev, [key]: value }));
  };

  const handleSetChange = (idx: number, side: keyof SetScore, value: string) => {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [side]: value };
      return next;
    });
    setInvalidSetIndexes((prev) => prev.filter((i) => i !== idx));
  };

  const addSet = () => {
    setSets((prev) => [...prev, { A: "", B: "" }]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    setInvalidSetIndexes([]);

    const idValues = [ids.a1, ids.a2, ids.b1, ids.b2];
    const filtered = idValues.filter((v) => v);
    if (new Set(filtered).size !== filtered.length) {
      setError("Please select unique players.");
      setSaving(false);
      return;
    }

    const sideA = [ids.a1, ids.a2].filter(Boolean);
    const sideB = [ids.b1, ids.b2].filter(Boolean);
    if (!sideA.length || !sideB.length) {
      setError("Select at least one player for each side");
      setSaving(false);
      return;
    }

    const participants = [
      { side: "A", playerIds: sideA },
      { side: "B", playerIds: sideB },
    ];

    const trimmedSets = sets.map((set) => ({
      A: set.A.trim(),
      B: set.B.trim(),
    }));
    const invalidIndexes: number[] = [];
    const completeSets: { index: number; set: { A: number; B: number } }[] = [];

    trimmedSets.forEach((set, index) => {
      const hasA = set.A !== "";
      const hasB = set.B !== "";

      if (!hasA && !hasB) {
        return;
      }

      if (!hasA || !hasB) {
        invalidIndexes.push(index);
        return;
      }

      const parsedA = Number(set.A);
      const parsedB = Number(set.B);

      if (!Number.isFinite(parsedA) || !Number.isFinite(parsedB) || parsedA < 0 || parsedB < 0) {
        invalidIndexes.push(index);
        return;
      }

      completeSets.push({ index, set: { A: parsedA, B: parsedB } });
    });

    if (invalidIndexes.length) {
      setInvalidSetIndexes(invalidIndexes);
      const setList = invalidIndexes.map((i) => `Set ${i + 1}`).join(", ");
      setError(
        invalidIndexes.length === 1
          ? `${setList} is incomplete. Enter both non-negative scores.`
          : `${setList} are incomplete. Enter both non-negative scores.`,
      );
      setSaving(false);
      return;
    }

    const maxSets = Number(bestOf);
    if (completeSets.length > maxSets) {
      const extraSets = completeSets.slice(maxSets);
      const extras = extraSets.map(({ index }) => `Set ${index + 1}`);
      setInvalidSetIndexes(extraSets.map(({ index }) => index));
      setError(
        `Best of ${bestOf} allows at most ${maxSets} completed sets. Remove ${extras.join(
          ", ",
        )} or adjust the format.`,
      );
      setSaving(false);
      return;
    }

    const setsForPayload = completeSets.map(({ set }) => set);

    try {
      const payload: CreateMatchPayload = {
        sport: "padel",
        participants,
        bestOf: Number(bestOf),
      };
      if (date) {
        payload.playedAt = time
          ? new Date(`${date}T${time}`).toISOString()
          : `${date}T00:00:00`;
      }
      if (location) {
        payload.location = location;
      }

      const res = await apiFetch(`/v0/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id: string };
      if (setsForPayload.length) {
        await apiFetch(`/v0/matches/${data.id}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sets: setsForPayload }),
        });
      }
      setSuccess(true);
      router.push(`/matches`);
    } catch (err) {
      console.error("Failed to save padel match", err);
      setSaving(false);
      setSuccess(false);
      setError("Failed to save match. Please try again.");
    }
  };

  return (
    <main className="container">
      <form onSubmit={handleSubmit}>
        <div className="datetime">
          <div className="field-group">
            <label className="field-label" htmlFor="match-date">
              Date
            </label>
            <input
              id="match-date"
              type="date"
              lang={dateLocale}
              aria-describedby="match-date-format"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <small id="match-date-format" className="field-hint">
              Format: {datePlaceholder}
            </small>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="match-time">
              Time
            </label>
            <input
              id="match-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="match-location">
            Location
          </label>
          <input
            id="match-location"
            type="text"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="players">
          <div className="field-group">
            <label className="field-label" htmlFor="player-a1">
              Player A 1
            </label>
            <select
              id="player-a1"
              value={ids.a1}
              onChange={(e) => handleIdChange("a1", e.target.value)}
            >
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="player-a2">
              Player A 2
            </label>
            <select
              id="player-a2"
              value={ids.a2}
              onChange={(e) => handleIdChange("a2", e.target.value)}
            >
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="player-b1">
              Player B 1
            </label>
            <select
              id="player-b1"
              value={ids.b1}
              onChange={(e) => handleIdChange("b1", e.target.value)}
            >
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="player-b2">
              Player B 2
            </label>
            <select
              id="player-b2"
              value={ids.b2}
              onChange={(e) => handleIdChange("b2", e.target.value)}
            >
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="best-of">
            Best of
          </label>
          <select
            id="best-of"
            value={bestOf}
            onChange={(e) => setBestOf(e.target.value)}
          >
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
          </select>
        </div>

        <div className="sets">
          {sets.map((s, idx) => (
            <div key={idx} className="set">
              <input
                type="number"
                min="0"
                step="1"
                placeholder={`Set ${idx + 1} A`}
                value={s.A}
                onChange={(e) => handleSetChange(idx, "A", e.target.value)}
                aria-invalid={invalidSetIndexes.includes(idx) ? true : undefined}
                className={invalidSetIndexes.includes(idx) ? "input-error" : undefined}
              />
              <input
                type="number"
                min="0"
                step="1"
                placeholder={`Set ${idx + 1} B`}
                value={s.B}
                onChange={(e) => handleSetChange(idx, "B", e.target.value)}
                aria-invalid={invalidSetIndexes.includes(idx) ? true : undefined}
                className={invalidSetIndexes.includes(idx) ? "input-error" : undefined}
              />
            </div>
          ))}
        </div>
        <button type="button" onClick={addSet}>
          Add Set
        </button>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="success">
            Match recorded!
          </p>
        )}
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </main>
  );
}

