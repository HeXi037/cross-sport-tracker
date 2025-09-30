"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { invalidateMatchesCache } from "../../../lib/useApiSWR";
import { ensureTrailingSlash } from "../../../lib/routes";
import { useLocale } from "../../../lib/LocaleContext";
import {
  getDateExample,
  getDatePlaceholder,
  getTimeExample,
  usesTwentyFourHourClock,
} from "../../../lib/i18n";
import { buildPlayedAtISOString } from "../../../lib/datetime";

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
  isFriendly?: boolean;
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
  const [isFriendly, setIsFriendly] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [playerErrors, setPlayerErrors] = useState<Record<keyof IdMap, string>>({
    a1: "",
    a2: "",
    b1: "",
    b2: "",
  });
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const [success, setSuccess] = useState(false);
  const saveSummaryId = useId();

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((player) => {
      map.set(player.id, player.name);
    });
    return map;
  }, [players]);

  const sideASelected = useMemo(
    () => [ids.a1, ids.a2].filter(Boolean) as string[],
    [ids.a1, ids.a2],
  );

  const sideBSelected = useMemo(
    () => [ids.b1, ids.b2].filter(Boolean) as string[],
    [ids.b1, ids.b2],
  );

  const duplicatePlayerIds = useMemo(() => {
    const selections = [...sideASelected, ...sideBSelected];
    return selections.filter(
      (value, index, arr) => arr.indexOf(value) !== index,
    );
  }, [sideASelected, sideBSelected]);

  const duplicatePlayerNames = useMemo(() => {
    const uniqueDuplicates = Array.from(new Set(duplicatePlayerIds));
    return uniqueDuplicates.map(
      (id) => playerNameById.get(id) ?? "Selected player",
    );
  }, [duplicatePlayerIds, playerNameById]);

  const sideAPlayerNames = useMemo(
    () => sideASelected.map((id) => playerNameById.get(id) ?? "Selected player"),
    [playerNameById, sideASelected],
  );

  const sideBPlayerNames = useMemo(
    () => sideBSelected.map((id) => playerNameById.get(id) ?? "Selected player"),
    [playerNameById, sideBSelected],
  );

  const setStatus = useMemo(() => {
    let completed = 0;
    let message: string | null = null;

    sets.forEach((set, idx) => {
      const a = set.A.trim();
      const b = set.B.trim();

      if (!a && !b) {
        return;
      }

      if (!a || !b) {
        if (!message) {
          message = `Enter a score for both teams in set ${idx + 1}.`;
        }
        return;
      }

      const aNum = Number(a);
      const bNum = Number(b);

      if (
        !Number.isInteger(aNum) ||
        aNum < 0 ||
        !Number.isInteger(bNum) ||
        bNum < 0
      ) {
        if (!message) {
          message = `Scores in set ${idx + 1} must be whole numbers of zero or more.`;
        }
        return;
      }

      completed += 1;
    });

    if (!message && completed === 0) {
      message = "Add scores for at least one completed set.";
    }

    return {
      completed,
      message,
    };
  }, [sets]);

  const hasSideAPlayers = sideASelected.length > 0;
  const hasSideBPlayers = sideBSelected.length > 0;

  const canSave =
    !saving &&
    hasSideAPlayers &&
    hasSideBPlayers &&
    setStatus.completed > 0 &&
    !setStatus.message &&
    duplicatePlayerIds.length === 0;

  const buttonCursor = saving
    ? "progress"
    : canSave
      ? "pointer"
      : "not-allowed";
  const buttonOpacity = canSave ? 1 : 0.75;
  const sideASummaryMessage = hasSideAPlayers
    ? `Side A: ${sideAPlayerNames.join(", ")}`
    : "Add at least one player to side A.";
  const sideBSummaryMessage = hasSideBPlayers
    ? `Side B: ${sideBPlayerNames.join(", ")}`
    : "Add at least one player to side B.";
  const duplicatePlayersMessage = duplicatePlayerNames.length
    ? `Players cannot appear on both sides: ${duplicatePlayerNames.join(", ")}.`
    : null;
  const completedSetsMessage = setStatus.message
    ? setStatus.message
    : `Completed sets ready to save: ${setStatus.completed}.`;

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await apiFetch(`/v0/players`);
        const data = (await res.json()) as { players: Player[] };
        setPlayers(data.players || []);
      } catch (err: unknown) {
        setGlobalError("Failed to load players");
        const status = (err as { status?: number }).status;
        if (status === 401) {
          router.push(ensureTrailingSlash("/login"));
        }
      }
    }
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIdChange = (key: keyof IdMap, value: string) => {
    setIds((prev) => ({ ...prev, [key]: value }));
    setPlayerErrors((prev) => ({ ...prev, [key]: "" }));
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

  const datePlaceholder = useMemo(() => getDatePlaceholder(locale), [locale]);
  const dateExample = useMemo(() => getDateExample(locale), [locale]);
  const uses24HourTime = useMemo(
    () => usesTwentyFourHourClock(locale),
    [locale],
  );
  const timeExample = useMemo(() => getTimeExample(locale), [locale]);
  const timeHintId = useMemo(() => 'padel-time-hint', []);
  const timeHintText = useMemo(
    () => `Example: ${timeExample}.`,
    [timeExample],
  );

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
    if (saving || !canSave) {
      return;
    }
    setGlobalError(null);
    setSuccess(false);
    setSaving(true);

    const newPlayerErrors: Record<keyof IdMap, string> = {
      a1: "",
      a2: "",
      b1: "",
      b2: "",
    };
    let hasPlayerErrors = false;

    const idValues = [ids.a1, ids.a2, ids.b1, ids.b2];
    const filtered = idValues.filter((v) => v);
    const duplicateIds = new Set(
      filtered.filter((value, index, arr) => arr.indexOf(value) !== index),
    );
    if (duplicateIds.size > 0) {
      (Object.entries(ids) as [keyof IdMap, string][]).forEach(([key, value]) => {
        if (value && duplicateIds.has(value)) {
          newPlayerErrors[key] = "Player already selected on another team.";
          hasPlayerErrors = true;
        }
      });
    }

    const sideA = [ids.a1, ids.a2].filter(Boolean);
    const sideB = [ids.b1, ids.b2].filter(Boolean);
    if (!sideA.length) {
      newPlayerErrors.a1 =
        newPlayerErrors.a1 || "Select at least one player for side A.";
      newPlayerErrors.a2 =
        newPlayerErrors.a2 || "Select at least one player for side A.";
      hasPlayerErrors = true;
    }
    if (!sideB.length) {
      newPlayerErrors.b1 =
        newPlayerErrors.b1 || "Select at least one player for side B.";
      newPlayerErrors.b2 =
        newPlayerErrors.b2 || "Select at least one player for side B.";
      hasPlayerErrors = true;
    }

    setPlayerErrors(newPlayerErrors);
    if (hasPlayerErrors) {
      setSaving(false);
      setSuccess(false);
      return;
    }

    if (!validateSets()) {
      setGlobalError("Please fix the highlighted set scores before saving.");
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
      const playedAt = buildPlayedAtISOString(date, time);
      if (playedAt) {
        payload.playedAt = playedAt;
      }
      if (location) {
        payload.location = location;
      }
      if (isFriendly) {
        payload.isFriendly = true;
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
      try {
        await invalidateMatchesCache();
      } catch (cacheErr) {
        console.error("Failed to invalidate match caches", cacheErr);
      }
      router.push(`/matches`);
    } catch (err) {
      console.error("Failed to save padel match", err);
      setSaving(false);
      setSuccess(false);
      setGlobalError("Failed to save match. Please try again.");
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
                e.g., {dateExample}
              </span>
            </label>
            <label className="form-field" htmlFor="padel-time">
              <span className="form-label">Start time</span>
              <input
                id="padel-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                lang={locale}
                aria-describedby={timeHintId}
                step={60}
                inputMode={uses24HourTime ? "numeric" : undefined}
                pattern={
                  uses24HourTime ? "([01][0-9]|2[0-3]):[0-5][0-9]" : undefined
                }
              />
              <span id={timeHintId} className="form-hint">
                {timeHintText}
              </span>
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
          <label
            className="form-field form-field--checkbox"
            htmlFor="padel-friendly"
          >
            <input
              id="padel-friendly"
              type="checkbox"
              checked={isFriendly}
              onChange={(e) => setIsFriendly(e.target.checked)}
              aria-describedby="padel-friendly-hint"
            />
            <span className="form-label">Mark as friendly</span>
          </label>
          <p id="padel-friendly-hint" className="form-hint">
            Friendly matches appear in match history but do not impact leaderboards
            or player statistics.
          </p>
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
                aria-invalid={playerErrors.a1 ? "true" : "false"}
                aria-describedby={
                  playerErrors.a1 ? "padel-player-a1-error" : undefined
                }
              >
                <option value="">Select player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {playerErrors.a1 && (
                <p id="padel-player-a1-error" role="alert" className="error">
                  {playerErrors.a1}
                </p>
              )}
            </label>

            <label className="form-field" htmlFor="padel-player-a2">
              <span className="form-label">Player A 2</span>
              <select
                id="padel-player-a2"
                value={ids.a2}
                onChange={(e) => handleIdChange("a2", e.target.value)}
                aria-invalid={playerErrors.a2 ? "true" : "false"}
                aria-describedby={
                  playerErrors.a2 ? "padel-player-a2-error" : undefined
                }
              >
                <option value="">Select player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {playerErrors.a2 && (
                <p id="padel-player-a2-error" role="alert" className="error">
                  {playerErrors.a2}
                </p>
              )}
            </label>

            <label className="form-field" htmlFor="padel-player-b1">
              <span className="form-label">Player B 1</span>
              <select
                id="padel-player-b1"
                value={ids.b1}
                onChange={(e) => handleIdChange("b1", e.target.value)}
                aria-invalid={playerErrors.b1 ? "true" : "false"}
                aria-describedby={
                  playerErrors.b1 ? "padel-player-b1-error" : undefined
                }
              >
                <option value="">Select player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {playerErrors.b1 && (
                <p id="padel-player-b1-error" role="alert" className="error">
                  {playerErrors.b1}
                </p>
              )}
            </label>

            <label className="form-field" htmlFor="padel-player-b2">
              <span className="form-label">Player B 2</span>
              <select
                id="padel-player-b2"
                value={ids.b2}
                onChange={(e) => handleIdChange("b2", e.target.value)}
                aria-invalid={playerErrors.b2 ? "true" : "false"}
                aria-describedby={
                  playerErrors.b2 ? "padel-player-b2-error" : undefined
                }
              >
                <option value="">Select player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {playerErrors.b2 && (
                <p id="padel-player-b2-error" role="alert" className="error">
                  {playerErrors.b2}
                </p>
              )}
            </label>
          </div>
          <fieldset className="form-subfieldset">
            <legend className="form-label">Best of</legend>
            <div className="radio-group">
              {["1", "3", "5"].map((option) => {
                const optionId = `padel-best-of-${option}`;
                const optionLabel = `${option} ${option === "1" ? "set" : "sets"}`;
                return (
                  <label key={option} className="radio-group__option" htmlFor={optionId}>
                    <input
                      id={optionId}
                      type="radio"
                      name="padel-best-of"
                      value={option}
                      checked={bestOf === option}
                      onChange={(e) => setBestOf(e.target.value)}
                    />
                    <span>{optionLabel}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
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
        <p id="padel-add-set-hint" className="form-hint">
          Add another set if the match extended beyond the recorded sets.
        </p>
        <button
          type="button"
          onClick={addSet}
          aria-describedby="padel-add-set-hint"
        >
          Add Set
        </button>

        {globalError && (
          <p role="alert" className="error">
            {globalError}
          </p>
        )}

        {success && (
          <p role="status" className="success">
            Match recorded!
          </p>
        )}
        <p id="padel-save-hint" className="form-hint">
          Save once each side has at least one player and completed sets are
          entered as needed.
        </p>
        <div id={saveSummaryId} aria-live="polite">
          <p
            className={hasSideAPlayers ? "form-hint" : "error"}
            role={hasSideAPlayers ? undefined : "alert"}
          >
            {sideASummaryMessage}
          </p>
          <p
            className={hasSideBPlayers ? "form-hint" : "error"}
            role={hasSideBPlayers ? undefined : "alert"}
          >
            {sideBSummaryMessage}
          </p>
          {duplicatePlayersMessage && (
            <p className="error" role="alert">
              {duplicatePlayersMessage}
            </p>
          )}
          <p
            className={setStatus.message ? "error" : "form-hint"}
            role={setStatus.message ? "alert" : undefined}
          >
            {completedSetsMessage}
          </p>
        </div>
        <button
          type="submit"
          aria-disabled={!canSave ? "true" : "false"}
          aria-describedby={`padel-save-hint ${saveSummaryId}`}
          disabled={!canSave}
          data-saving={saving}
          style={{
            opacity: buttonOpacity,
            cursor: buttonCursor,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </main>
  );
}

