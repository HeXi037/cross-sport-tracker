"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { invalidateMatchesCache } from "../../../lib/useApiSWR";
import { invalidateNotificationsCache } from "../../../lib/useNotifications";
import { ensureTrailingSlash } from "../../../lib/routes";
import { useLocale } from "../../../lib/LocaleContext";
import {
  getDateExample,
  getDatePlaceholder,
  getTimeExample,
  usesTwentyFourHourClock,
} from "../../../lib/i18n";
import { buildPlayedAtISOString } from "../../../lib/datetime";
import { rememberLoginRedirect } from "../../../lib/loginRedirect";

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

const VALID_BEST_OF = new Set([1, 3, 5]);
const MIN_SET_SCORE = 0;
const MAX_REGULAR_SET_SCORE = 6;
const MAX_TIEBREAK_SET_SCORE = 7;
const TIEBREAK_ELIGIBLE_LOSING_SCORES = new Set([5, 6]);

const DUPLICATE_PLAYER_MESSAGE = "Player already selected on another team.";
const PLAYER_SIDE_REQUIRED_MESSAGE = {
  A: "Select at least one player for side A.",
  B: "Select at least one player for side B.",
} as const;

function isValidPadelSetScore(score: number, opponentScore: number): boolean {
  if (!Number.isInteger(score) || score < MIN_SET_SCORE) {
    return false;
  }

  if (score <= MAX_REGULAR_SET_SCORE) {
    return true;
  }

  return (
    score === MAX_TIEBREAK_SET_SCORE &&
    TIEBREAK_ELIGIBLE_LOSING_SCORES.has(opponentScore)
  );
}

interface PadelSetAnalysis {
  errors: string[];
  completed: number;
  winsA: number;
  winsB: number;
  summaryMessage: string;
  summaryError: string | null;
  isValid: boolean;
}

function analysePadelSets(sets: SetScore[], rawBestOf: number): PadelSetAnalysis {
  const bestOf = VALID_BEST_OF.has(rawBestOf) ? rawBestOf : 3;
  const neededWins = Math.floor(bestOf / 2) + 1;
  const errors = sets.map(() => "");
  let completed = 0;
  let winsA = 0;
  let winsB = 0;
  let summaryError: string | null = null;

  sets.forEach((set, idx) => {
    const setLabel = `set ${idx + 1}`;
    const a = set.A.trim();
    const b = set.B.trim();

    if (!a && !b) {
      return;
    }

    if (!a || !b) {
      errors[idx] = "Enter a score for both teams.";
      if (!summaryError) {
        summaryError = `Enter a score for both teams in ${setLabel}.`;
      }
      return;
    }

    const aNum = Number(a);
    const bNum = Number(b);

    if (
      !isValidPadelSetScore(aNum, bNum) ||
      !isValidPadelSetScore(bNum, aNum)
    ) {
      errors[idx] = `Scores in ${setLabel} must be whole numbers between 0 and 6.`;
      if (!summaryError) {
        summaryError = `Scores in ${setLabel} must be whole numbers between 0 and 6.`;
      }
      return;
    }

    if (aNum === bNum) {
      errors[idx] = `Set ${idx + 1} must have a winner.`;
      if (!summaryError) {
        summaryError = `Set ${idx + 1} must have a winner.`;
      }
      return;
    }

    completed += 1;
    if (aNum > bNum) {
      winsA += 1;
    } else {
      winsB += 1;
    }
  });

  if (!summaryError) {
    if (completed === 0) {
      summaryError = "Add scores for at least one completed set.";
    } else if (completed > bestOf) {
      summaryError = `Best of ${bestOf} allows at most ${bestOf} completed sets.`;
    } else if (winsA > neededWins || winsB > neededWins) {
      summaryError = `Best of ${bestOf} ends when a side wins ${neededWins} sets. Remove extra set scores.`;
    } else if (winsA < neededWins && winsB < neededWins) {
      summaryError = `Best of ${bestOf} requires ${neededWins} set wins for a team.`;
    } else if (winsA === winsB) {
      summaryError = "Sets must produce a winner.";
    }
  }

  const summaryMessage = summaryError
    ? summaryError
    : `Completed sets ready to save: ${completed}.`;

  return {
    errors,
    completed,
    winsA,
    winsB,
    summaryMessage,
    summaryError,
    isValid: !summaryError && errors.every((error) => !error),
  };
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

type PlayerValidationResult = {
  errors: Record<keyof IdMap, string>;
  hasErrors: boolean;
};

const emptyPlayerErrors = (): Record<keyof IdMap, string> => ({
  a1: "",
  a2: "",
  b1: "",
  b2: "",
});

const evaluatePlayerSelections = (
  candidateIds: IdMap,
  touchedState: Record<keyof IdMap, boolean>,
): PlayerValidationResult => {
  const errors = emptyPlayerErrors();

  const entries = Object.entries(candidateIds) as [keyof IdMap, string][];
  const selectedValues = entries
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value));
  const duplicateValues = new Set(
    selectedValues.filter(
      (value, index, arr) => arr.indexOf(value) !== index,
    ),
  );

  if (duplicateValues.size > 0) {
    entries.forEach(([key, value]) => {
      if (value && duplicateValues.has(value)) {
        errors[key] = DUPLICATE_PLAYER_MESSAGE;
      }
    });
  }

  const sideASelected = [candidateIds.a1, candidateIds.a2].filter(Boolean);
  const sideBSelected = [candidateIds.b1, candidateIds.b2].filter(Boolean);
  const sideATouched = touchedState.a1 || touchedState.a2;
  const sideBTouched = touchedState.b1 || touchedState.b2;

  if (sideATouched && sideASelected.length === 0) {
    (["a1", "a2"] as (keyof IdMap)[]).forEach((key) => {
      if (touchedState[key]) {
        errors[key] = errors[key] || PLAYER_SIDE_REQUIRED_MESSAGE.A;
      }
    });
  }

  if (sideBTouched && sideBSelected.length === 0) {
    (["b1", "b2"] as (keyof IdMap)[]).forEach((key) => {
      if (touchedState[key]) {
        errors[key] = errors[key] || PLAYER_SIDE_REQUIRED_MESSAGE.B;
      }
    });
  }

  return {
    errors,
    hasErrors: Object.values(errors).some(Boolean),
  };
};

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
  const [playerTouched, setPlayerTouched] = useState<
    Record<keyof IdMap, boolean>
  >({
    a1: false,
    a2: false,
    b1: false,
    b2: false,
  });
  const [saving, setSaving] = useState(false);
  const [showSummaryValidation, setShowSummaryValidation] = useState(false);
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

  const bestOfNumber = useMemo(() => {
    const parsed = Number(bestOf);
    return VALID_BEST_OF.has(parsed) ? parsed : 3;
  }, [bestOf]);

  const setAnalysis = useMemo(
    () => analysePadelSets(sets, bestOfNumber),
    [sets, bestOfNumber],
  );

  const setAnalysisErrors = setAnalysis.errors;

  const playerValidation = useMemo(
    () => evaluatePlayerSelections(ids, playerTouched),
    [ids, playerTouched],
  );

  const playerErrors = playerValidation.errors;

  const hasSideAPlayers = sideASelected.length > 0;
  const hasSideBPlayers = sideBSelected.length > 0;

  const canSave =
    !saving &&
    hasSideAPlayers &&
    hasSideBPlayers &&
    setAnalysis.isValid &&
    duplicatePlayerIds.length === 0;

  const buttonCursor = saving
    ? "progress"
    : canSave
      ? "pointer"
      : "not-allowed";
  const buttonOpacity = canSave ? 1 : 0.75;
  const sideASummaryMessage = hasSideAPlayers
    ? `Side A: ${sideAPlayerNames.join(", ")}`
    : showSummaryValidation
      ? "Add at least one player to side A."
      : "Add players to both sides.";
  const sideBSummaryMessage = hasSideBPlayers
    ? `Side B: ${sideBPlayerNames.join(", ")}`
    : showSummaryValidation
      ? "Add at least one player to side B."
      : "Add players to both sides.";
  const duplicatePlayersMessage = duplicatePlayerNames.length
    ? `Players cannot appear on both sides: ${duplicatePlayerNames.join(", ")}.`
    : null;
  const completedSetsMessage = setAnalysis.summaryMessage;
  const hasSetSummaryError = Boolean(setAnalysis.summaryError);

  useEffect(() => {
    setSetErrors((prev) =>
      areStringArraysEqual(prev, setAnalysisErrors) ? prev : setAnalysisErrors,
    );
  }, [setAnalysisErrors]);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await apiFetch(`/v0/players`);
        const data = (await res.json()) as { players: Player[] };
        const sortedPlayers = (data.players ?? [])
          .slice()
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          );
        setPlayers(sortedPlayers);
      } catch (err: unknown) {
        setGlobalError("Failed to load players");
        const status = (err as { status?: number }).status;
        if (status === 401) {
          rememberLoginRedirect();
          router.push(ensureTrailingSlash("/login"));
        }
      }
    }
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIdChange = (key: keyof IdMap, value: string) => {
    setIds((prev) => ({ ...prev, [key]: value }));
    setPlayerTouched((prev) => ({ ...prev, [key]: true }));
  };

  const handleSetChange = (idx: number, side: keyof SetScore, value: string) => {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [side]: value };
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
  const dateLocaleHintId = useMemo(() => 'padel-date-locale-note', []);
  const timeHintId = useMemo(() => 'padel-time-hint', []);
  const timeHintText = useMemo(() => {
    const exampleSuffix = uses24HourTime
      ? `Example: ${timeExample}.`
      : `Example: ${timeExample} (include AM or PM).`;
    return exampleSuffix;
  }, [timeExample, uses24HourTime]);

  const validateSets = () => {
    const analysis = analysePadelSets(sets, bestOfNumber);
    setSetErrors((prev) =>
      areStringArraysEqual(prev, analysis.errors) ? prev : analysis.errors,
    );
    return analysis.isValid;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowSummaryValidation(true);
    setSuccess(false);

    const setsValid = validateSets();

    if (saving) {
      return;
    }

    const touchedAllPlayers: Record<keyof IdMap, boolean> = {
      a1: true,
      a2: true,
      b1: true,
      b2: true,
    };
    const playerValidationOnSubmit = evaluatePlayerSelections(
      ids,
      touchedAllPlayers,
    );
    setPlayerTouched(touchedAllPlayers);

    let nextGlobalError: string | null = null;
    if (!setsValid) {
      nextGlobalError = "Please fix the highlighted set scores before saving.";
    } else if (playerValidationOnSubmit.hasErrors) {
      nextGlobalError =
        "Please fix the highlighted player selections before saving.";
    }
    setGlobalError(nextGlobalError);

    if (playerValidationOnSubmit.hasErrors || !setsValid || !canSave) {
      setSuccess(false);
      return;
    }

    setSaving(true);

    const participants = [
      { side: "A", playerIds: [ids.a1, ids.a2].filter(Boolean) },
      { side: "B", playerIds: [ids.b1, ids.b2].filter(Boolean) },
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
      try {
        await invalidateNotificationsCache();
      } catch (notificationErr) {
        console.error("Failed to refresh notifications", notificationErr);
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
                aria-describedby={`padel-date-format ${dateLocaleHintId}`}
              />
              <span id="padel-date-format" className="form-hint">
                Example: {dateExample}
              </span>
              <span id={dateLocaleHintId} className="form-hint">
                Date format follows your profile preferences.
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
                    max={MAX_TIEBREAK_SET_SCORE}
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
                    max={MAX_TIEBREAK_SET_SCORE}
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
            className={
              !hasSideAPlayers && showSummaryValidation ? "error" : "form-hint"
            }
            role={
              !hasSideAPlayers && showSummaryValidation ? "alert" : undefined
            }
          >
            {sideASummaryMessage}
          </p>
          <p
            className={
              !hasSideBPlayers && showSummaryValidation ? "error" : "form-hint"
            }
            role={
              !hasSideBPlayers && showSummaryValidation ? "alert" : undefined
            }
          >
            {sideBSummaryMessage}
          </p>
          {duplicatePlayersMessage && (
            <p className="error" role="alert">
              {duplicatePlayersMessage}
            </p>
          )}
          <p
            className={
              hasSetSummaryError && showSummaryValidation ? "error" : "form-hint"
            }
            role={
              hasSetSummaryError && showSummaryValidation ? "alert" : undefined
            }
          >
            {completedSetsMessage}
          </p>
        </div>
        <button
          type="submit"
          disabled={!canSave}
          aria-disabled={!canSave ? "true" : "false"}
          aria-describedby={`padel-save-hint ${saveSummaryId}`}
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

