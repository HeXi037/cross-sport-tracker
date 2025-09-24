"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useLocale } from "../../../lib/LocaleContext";

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

export default function RecordPadelPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState<IdMap>({ a1: "", a2: "", b1: "", b2: "" });
  const [bestOf, setBestOf] = useState("3");
  const [sets, setSets] = useState<SetScore[]>([{ A: "", B: "" }]);
  const [setErrors, setSetErrors] = useState<string[]>([""]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const [success, setSuccess] = useState(false);

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

  const handleIdChange = (key: keyof IdMap, value: string) => {
    setIds((prev) => ({ ...prev, [key]: value }));
  };

  const handleSetChange = (idx: number, side: keyof SetScore, value: string) => {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [side]: value };
      return next;
    });
    setSetErrors((prev) => {
      const next = [...prev];
      next[idx] = "";
      return next;
    });
  };

  const addSet = () => {
    setSets((prev) => [...prev, { A: "", B: "" }]);
    setSetErrors((prev) => [...prev, ""]);
  };

  const datePlaceholder = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const parts = formatter.formatToParts(new Date(2001, 10, 21));
    return parts
      .map((part) => {
        if (part.type === "day") return "dd";
        if (part.type === "month") return "mm";
        if (part.type === "year") return "yyyy";
        return part.value;
      })
      .join("");
  }, [locale]);

  const validateSets = () => {
    const errors = sets.map(() => "");
    let hasErrors = false;

    sets.forEach((set, idx) => {
      const a = set.A.trim();
      const b = set.B.trim();

      if (!a && !b) {
        return;
      }

      if ((a && !b) || (!a && b)) {
        errors[idx] = "Enter a score for both teams.";
        hasErrors = true;
        return;
      }

      const aNum = Number(a);
      const bNum = Number(b);
      if (!Number.isInteger(aNum) || aNum < 0 || !Number.isInteger(bNum) || bNum < 0) {
        errors[idx] = "Scores must be whole numbers of zero or more.";
        hasErrors = true;
      }
    });

    setSetErrors(errors);
    return !hasErrors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSuccess(false);
    setSaving(true);

    const idValues = [ids.a1, ids.a2, ids.b1, ids.b2];
    const filtered = idValues.filter((v) => v);
    if (new Set(filtered).size !== filtered.length) {
      setError("Please select unique players.");
      setSaving(false);
      setSuccess(false);
      return;
    }

    const sideA = [ids.a1, ids.a2].filter(Boolean);
    const sideB = [ids.b1, ids.b2].filter(Boolean);
    if (!sideA.length || !sideB.length) {
      setError("Select at least one player for each side");
      setSaving(false);
      setSuccess(false);
      return;
    }

    if (!validateSets()) {
      setError("Please fix the highlighted set scores before saving.");
      setSaving(false);
      return;
    }

    const participants = [
      { side: "A", playerIds: sideA },
      { side: "B", playerIds: sideB },
    ];

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
      const setPayload = {
        sets: sets
          .filter((s) => s.A !== "" && s.B !== "")
          .map((s) => ({ A: Number(s.A), B: Number(s.B) })),
      };
      if (setPayload.sets.length) {
        await apiFetch(`/v0/matches/${data.id}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(setPayload),
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
      <form onSubmit={handleSubmit} className="form-stack">
        <fieldset className="form-fieldset">
          <legend className="form-legend">Match details</legend>
          <div className="form-grid form-grid--two">
            <label className="form-field" htmlFor="padel-date">
              <span className="form-label">Date</span>
              <input
                id="padel-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                lang={locale}
                placeholder={datePlaceholder}
                aria-describedby="padel-date-format"
              />
              <span id="padel-date-format" className="form-hint">
                Format: {datePlaceholder}
              </span>
            </label>
            <label className="form-field" htmlFor="padel-time">
              <span className="form-label" id="padel-time-label">
                Start time
              </span>
              <input
                id="padel-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-labelledby="padel-time-label"
              />
            </label>
          </div>
          <label className="form-field" htmlFor="padel-location">
            <span className="form-label">Location</span>
            <input
              id="padel-location"
              type="text"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="form-fieldset">
          <legend className="form-legend">Players</legend>
          <div className="form-grid form-grid--two">
            <label className="form-field" htmlFor="padel-player-a1">
              <span className="form-label">Player A 1</span>
              <select
                id="padel-player-a1"
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
            </label>

            <label className="form-field" htmlFor="padel-player-a2">
              <span className="form-label">Player A 2</span>
              <select
                id="padel-player-a2"
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
            </label>

            <label className="form-field" htmlFor="padel-player-b1">
              <span className="form-label">Player B 1</span>
              <select
                id="padel-player-b1"
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
            </label>

            <label className="form-field" htmlFor="padel-player-b2">
              <span className="form-label">Player B 2</span>
              <select
                id="padel-player-b2"
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
            </label>
          </div>
          <label className="form-field" htmlFor="padel-best-of">
            <span className="form-label">Best of</span>
            <select
              id="padel-best-of"
              value={bestOf}
              onChange={(e) => setBestOf(e.target.value)}
            >
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="5">5</option>
            </select>
          </label>
        </fieldset>

        <div className="sets">
          {sets.map((s, idx) => {
            const setError = setErrors[idx];
            const errorId = setError ? `padel-set-${idx + 1}-error` : undefined;
            return (
              <div key={idx} className="set">
                <label className="form-field" htmlFor={`padel-set-${idx + 1}-a`}>
                  <span className="form-label">Set {idx + 1} team A</span>
                  <input
                    id={`padel-set-${idx + 1}-a`}
                    type="number"
                    min="0"
                    step="1"
                    placeholder={`Set ${idx + 1} A`}
                    value={s.A}
                    onChange={(e) => handleSetChange(idx, "A", e.target.value)}
                    inputMode="numeric"
                    aria-invalid={Boolean(setError)}
                    aria-describedby={errorId}
                  />
                </label>
                <label className="form-field" htmlFor={`padel-set-${idx + 1}-b`}>
                  <span className="form-label">Set {idx + 1} team B</span>
                  <input
                    id={`padel-set-${idx + 1}-b`}
                    type="number"
                    min="0"
                    step="1"
                    placeholder={`Set ${idx + 1} B`}
                    value={s.B}
                    onChange={(e) => handleSetChange(idx, "B", e.target.value)}
                    inputMode="numeric"
                    aria-invalid={Boolean(setError)}
                    aria-describedby={errorId}
                  />
                </label>
                {setError && (
                  <p id={errorId} role="alert" className="error">
                    {setError}
                  </p>
                )}
              </div>
            );
          })}
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

