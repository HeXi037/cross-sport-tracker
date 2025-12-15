"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { apiUrl } from "../../../lib/api";
import { invalidateMatchesCache } from "../../../lib/useApiSWR";
import { invalidateNotificationsCache } from "../../../lib/useNotifications";

type MatchSummary = {
  id: string;
  sport: string;
  location?: string | null;
  playedAt?: string | null;
};

type Participant = { side?: string | null; playerIds?: string[] | null };

type DiscGolfSummaryPayload = {
  pars?: Array<number | string | null | undefined> | null;
  scores?: Record<string, Array<number | string | null | undefined>> | null;
  config?: unknown;
  [key: string]: unknown;
} | null;

type MatchDetail = {
  id: string;
  participants?: Participant[] | null;
  summary?: DiscGolfSummaryPayload;
  details?: DiscGolfSummaryPayload;
};

type PlayerOption = {
  id: string;
  name: string;
};

const MATCH_FETCH_LIMIT = 50;
const PLAYER_FETCH_LIMIT = 100;
const DEFAULT_HOLE_COUNT = 18;
const MAX_HOLE_COUNT = 36;

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return null;
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function extractParEntries(source: DiscGolfSummaryPayload): Array<number | null> | null {
  if (!source) return null;
  const fromSummary = Array.isArray(source.pars) ? source.pars : null;
  if (fromSummary && fromSummary.length) {
    return fromSummary.map((entry) => parsePositiveInteger(entry));
  }
  const config = source.config;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const configPars = (config as { pars?: unknown }).pars;
    if (Array.isArray(configPars) && configPars.length) {
      return configPars.map((entry) => parsePositiveInteger(entry));
    }
  }
  return null;
}

function extractHoleCount(source: DiscGolfSummaryPayload): number | null {
  if (!source) return null;
  const config = source.config;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const holes = parsePositiveInteger((config as { holes?: unknown }).holes);
    if (holes) {
      return holes;
    }
  }
  return null;
}

type ScoreMap = Record<string, Array<number | null>>;

function parseScoreMap(source: DiscGolfSummaryPayload): ScoreMap | null {
  if (!source) return null;
  const rawScores = source.scores;
  if (!rawScores || typeof rawScores !== "object") {
    return null;
  }
  const entries = Object.entries(rawScores);
  if (!entries.length) {
    return null;
  }
  const normalized: ScoreMap = {};
  entries.forEach(([side, values]) => {
    if (!Array.isArray(values)) return;
    normalized[side] = values.map((value) => parsePositiveInteger(value));
  });
  return Object.keys(normalized).length ? normalized : null;
}

function buildScoreState(existing: ScoreMap | null, holeCount: number): ScoreMap {
  const result: ScoreMap = {
    A: Array.from({ length: holeCount }, (_, idx) => existing?.A?.[idx] ?? null),
    B: Array.from({ length: holeCount }, (_, idx) => existing?.B?.[idx] ?? null),
  };
  Object.keys(existing ?? {}).forEach((side) => {
    if (side === "A" || side === "B") return;
    const values = existing?.[side];
    if (!Array.isArray(values)) return;
    result[side] = Array.from({ length: holeCount }, (_, idx) => values[idx] ?? null);
  });
  return result;
}

function determineNextHole(
  scores: ScoreMap | null,
  holeCount: number,
): { hole: number; values: { A: string; B: string } } {
  const effectiveScores = buildScoreState(scores, holeCount);
  for (let idx = 0; idx < holeCount; idx += 1) {
    const aValue = effectiveScores.A[idx];
    const bValue = effectiveScores.B[idx];
    const aComplete = typeof aValue === "number" && Number.isFinite(aValue) && aValue > 0;
    const bComplete = typeof bValue === "number" && Number.isFinite(bValue) && bValue > 0;
    if (!aComplete || !bComplete) {
      return {
        hole: idx + 1,
        values: {
          A: aComplete ? String(aValue) : "",
          B: bComplete ? String(bValue) : "",
        },
      };
    }
  }
  return { hole: holeCount + 1, values: { A: "", B: "" } };
}

function DiscGolfForm() {
  const recordDiscGolfT = useTranslations("Record.discGolf");
  const params = useSearchParams();
  const router = useRouter();
  const mid = params.get("mid") || "";
  const [currentMatchId, setCurrentMatchId] = useState(mid);
  const [hole, setHole] = useState(1);
  const [strokeA, setStrokeA] = useState("");
  const [strokeB, setStrokeB] = useState("");
  const [recordError, setRecordError] = useState<string | null>(null);
  const [matchPickerError, setMatchPickerError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [submittingHole, setSubmittingHole] = useState(false);
  const [availableMatches, setAvailableMatches] = useState<MatchSummary[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [sideAPlayers, setSideAPlayers] = useState<string[]>([]);
  const [sideBPlayers, setSideBPlayers] = useState<string[]>([]);
  const [holeCountInput, setHoleCountInput] = useState(String(DEFAULT_HOLE_COUNT));
  const [pars, setPars] = useState<string[]>(
    Array.from({ length: DEFAULT_HOLE_COUNT }, () => "3"),
  );
  const [parErrors, setParErrors] = useState<Set<number>>(new Set());
  const [matchDetailsError, setMatchDetailsError] = useState<string | null>(null);
  const [loadingMatchDetails, setLoadingMatchDetails] = useState(false);
  const [existingScores, setExistingScores] = useState<ScoreMap | null>(null);

  const hasMatchId = Boolean(currentMatchId);

  const getNetworkErrorMessage = useCallback(
    (defaultKey: string) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return recordDiscGolfT("errors.offline");
      }
      return recordDiscGolfT(defaultKey);
    },
    [recordDiscGolfT],
  );

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
    let cancelled = false;
    const controller = new AbortController();
    setIsLoadingPlayers(true);
    setPlayerError(null);
    (async () => {
      try {
        const res = await fetch(
          apiUrl(`/v0/players?limit=${PLAYER_FETCH_LIMIT}&offset=0`),
          {
            method: "GET",
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          throw new Error("Failed to load players");
        }
        const data = (await res.json()) as { players?: PlayerOption[] };
        if (!cancelled) {
          const normalized = (data.players ?? [])
            .filter((player): player is PlayerOption =>
              Boolean(player?.id && player?.name),
            )
            .map((player) => ({ id: player.id, name: player.name }))
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            );
          setPlayers(normalized);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setPlayerError(getNetworkErrorMessage("errors.players"));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPlayers(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [getNetworkErrorMessage]);

  useEffect(() => {
    if (mid) return;
    let cancelled = false;
    const controller = new AbortController();
    setIsLoadingMatches(true);
    setMatchPickerError(null);
    (async () => {
      try {
        const res = await fetch(
          apiUrl(`/v0/matches?limit=${MATCH_FETCH_LIMIT}&offset=0`),
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
          setMatchPickerError(getNetworkErrorMessage("errors.matches"));
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
  }, [getNetworkErrorMessage, mid]);

  const navigateToMatch = useCallback(
    (matchId: string) => {
      setCurrentMatchId(matchId);
      setHole(1);
      setStrokeA("");
      setStrokeB("");
      setRecordError(null);
      setMatchDetailsError(null);
      setExistingScores(null);
      router.push(`/record/disc-golf/?mid=${encodeURIComponent(matchId)}`);
    },
    [router],
  );

  useEffect(() => {
    if (!currentMatchId) {
      setExistingScores(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoadingMatchDetails(true);
    setMatchDetailsError(null);
    (async () => {
      try {
        const res = await fetch(
          apiUrl(`/v0/matches/${encodeURIComponent(currentMatchId)}`),
          { signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error("Failed to load match");
        }
        const data = (await res.json()) as MatchDetail;
        if (cancelled) return;
        const participants = Array.isArray(data.participants)
          ? data.participants
          : [];
        const sideA = participants.find((p) => p?.side === "A");
        const sideB = participants.find((p) => p?.side === "B");
        setSideAPlayers(sideA?.playerIds?.filter(Boolean) ?? []);
        setSideBPlayers(sideB?.playerIds?.filter(Boolean) ?? []);
        const summarySource =
          (data.summary ?? data.details ?? null) as DiscGolfSummaryPayload;
        const parEntries = extractParEntries(summarySource);
        const holesFromSummary = parEntries?.length ?? null;
        const holesFromConfig = extractHoleCount(summarySource);
        const resolvedHoleCount =
          holesFromSummary ??
          holesFromConfig ??
          parsePositiveInteger(holeCountInput) ??
          DEFAULT_HOLE_COUNT;
        if (parEntries && parEntries.length) {
          setPars(parEntries.map((entry) => (entry ? String(entry) : "")));
          setHoleCountInput(String(parEntries.length));
        } else if (holesFromConfig) {
          setHoleCountInput(String(holesFromConfig));
        }
        const parsedScores = parseScoreMap(summarySource);
        setExistingScores(parsedScores);
        const next = determineNextHole(parsedScores, resolvedHoleCount);
        setHole(next.hole);
        setStrokeA(next.values.A);
        setStrokeB(next.values.B);
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setMatchDetailsError(getNetworkErrorMessage("errors.matchDetails"));
        }
      } finally {
        if (!cancelled) {
          setLoadingMatchDetails(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentMatchId, getNetworkErrorMessage, holeCountInput]);

  useEffect(() => {
    const parsed = parsePositiveInteger(holeCountInput);
    if (!parsed) {
      return;
    }
    setPars((previous) => {
      if (previous.length === parsed) {
        return previous;
      }
      if (previous.length > parsed) {
        return previous.slice(0, parsed);
      }
      const additions = Array.from({ length: parsed - previous.length }, () => "3");
      return [...previous, ...additions];
    });
  }, [holeCountInput]);

  const playerOptions = useMemo(() => {
    const map = new Map<string, PlayerOption>();
    players.forEach((player) => {
      map.set(player.id, player);
    });
    [...sideAPlayers, ...sideBPlayers].forEach((id) => {
      if (!id || map.has(id)) return;
      map.set(id, { id, name: `Player ${id}` });
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [players, sideAPlayers, sideBPlayers]);

  const playerLookup = useMemo(() => {
    const map = new Map<string, string>();
    playerOptions.forEach((player) => {
      map.set(player.id, player.name);
    });
    return map;
  }, [playerOptions]);

  const duplicatePlayerNames = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    [...sideAPlayers, ...sideBPlayers].forEach((id) => {
      if (!id) return;
      if (seen.has(id)) {
        duplicates.add(id);
      } else {
        seen.add(id);
      }
    });
    if (!duplicates.size) {
      return [];
    }
    return Array.from(duplicates).map(
      (id) =>
        playerLookup.get(id) ?? recordDiscGolfT("labels.playerFallback", { id }),
    );
  }, [playerLookup, recordDiscGolfT, sideAPlayers, sideBPlayers]);

  const parsedPars = useMemo(
    () => pars.map((value) => parsePositiveInteger(value)),
    [pars],
  );

  const effectiveHoleCount = useMemo(() => {
    const parsed = parsePositiveInteger(holeCountInput);
    if (parsed) {
      return parsed;
    }
    if (pars.length) {
      return pars.length;
    }
    return DEFAULT_HOLE_COUNT;
  }, [holeCountInput, pars.length]);

  const currentPar =
    hole >= 1 && hole <= parsedPars.length ? parsedPars[hole - 1] : null;

  const isMatchComplete = hasMatchId && hole > effectiveHoleCount;

  const handlePlayerChange = (
    side: "A" | "B",
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    if (side === "A") {
      setSideAPlayers(values);
    } else {
      setSideBPlayers(values);
    }
    setSetupError(null);
  };

  const handleHoleCountChange = (value: string) => {
    setHoleCountInput(value);
    setSetupError(null);
  };

  const handleParChange = (index: number, value: string) => {
    setPars((previous) => {
      const next = previous.slice();
      next[index] = value;
      return next;
    });
    setParErrors((previous) => {
      if (!previous.has(index)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(index);
      return next;
    });
    setSetupError(null);
  };

  const startMatch = async () => {
    const playersA = sideAPlayers.filter(Boolean);
    const playersB = sideBPlayers.filter(Boolean);
    if (!playersA.length || !playersB.length) {
      setSetupError(recordDiscGolfT("errors.selectPlayers"));
      return;
    }
    if (duplicatePlayerNames.length) {
      setSetupError(
        recordDiscGolfT("errors.uniquePlayers", {
          players: duplicatePlayerNames.join(", "),
        }),
      );
      return;
    }
    const parsedHoleCount = parsePositiveInteger(holeCountInput);
    if (!parsedHoleCount || parsedHoleCount > MAX_HOLE_COUNT) {
      setSetupError(
        recordDiscGolfT("errors.holeCount", { max: MAX_HOLE_COUNT }),
      );
      return;
    }
    const trimmedPars = pars.slice(0, parsedHoleCount);
    const invalidIndexes: number[] = [];
    const validatedPars: number[] = [];
    trimmedPars.forEach((value, index) => {
      const parsed = parsePositiveInteger(value);
      if (!parsed) {
        invalidIndexes.push(index);
      } else {
        validatedPars.push(parsed);
      }
    });
    if (invalidIndexes.length) {
      setParErrors(new Set(invalidIndexes));
      setSetupError(recordDiscGolfT("errors.parValues"));
      return;
    }
    setParErrors((previous) => (previous.size ? new Set() : previous));
    setSetupError(null);
    setMatchPickerError(null);
    setCreatingMatch(true);
    try {
      const res = await fetch(apiUrl("/v0/matches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: "disc_golf",
          participants: [
            { side: "A", playerIds: playersA },
            { side: "B", playerIds: playersB },
          ],
          details: {
            sport: "disc_golf",
            config: { holes: parsedHoleCount, pars: validatedPars },
            pars: validatedPars,
          },
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to create match");
      }
      const data = (await res.json()) as { id: string };
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
      navigateToMatch(data.id);
    } catch (err) {
      console.error("Failed to start disc golf match", err);
      setMatchPickerError(getNetworkErrorMessage("errors.create"));
    } finally {
      setCreatingMatch(false);
    }
  };

  const submit = async () => {
    if (!hasMatchId || isMatchComplete || loadingMatchDetails) {
      return;
    }
    const holeNumber = hole;
    if (holeNumber < 1 || holeNumber > effectiveHoleCount) {
      setRecordError(recordDiscGolfT("errors.holeNumber"));
      return;
    }
    const parsedA = parsePositiveInteger(strokeA);
    const parsedB = parsePositiveInteger(strokeB);
    if (!parsedA || !parsedB) {
      setRecordError(recordDiscGolfT("errors.strokeCounts"));
      return;
    }
    setSubmittingHole(true);
    setRecordError(null);
    try {
      const payloads = [
        { type: "HOLE", side: "A", hole: holeNumber, strokes: parsedA },
        { type: "HOLE", side: "B", hole: holeNumber, strokes: parsedB },
      ];
      for (const payload of payloads) {
        const res = await fetch(
          apiUrl(`/v0/matches/${encodeURIComponent(currentMatchId)}/events`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) {
          throw new Error("Failed to record event");
        }
      }
      const nextScores = buildScoreState(existingScores, effectiveHoleCount);
      nextScores.A[holeNumber - 1] = parsedA;
      nextScores.B[holeNumber - 1] = parsedB;
      setExistingScores(nextScores);
      const next = determineNextHole(nextScores, effectiveHoleCount);
      setHole(next.hole);
      setStrokeA(next.values.A);
      setStrokeB(next.values.B);
    } catch (err) {
      console.error("Failed to record disc golf hole", err);
      setRecordError(getNetworkErrorMessage("errors.record"));
    } finally {
      setSubmittingHole(false);
    }
  };

  const sideALabel = sideAPlayers
    .map((id) =>
      playerLookup.get(id) ?? recordDiscGolfT("labels.playerFallback", { id }),
    )
    .join(", ");
  const sideBLabel = sideBPlayers
    .map((id) =>
      playerLookup.get(id) ?? recordDiscGolfT("labels.playerFallback", { id }),
    )
    .join(", ");

  return (
    <main className="container">
      <h1 className="heading">{recordDiscGolfT("title")}</h1>
      <section className="form-stack" aria-labelledby="disc-golf-setup-heading">
        <h2 id="disc-golf-setup-heading" className="sr-only">
          {recordDiscGolfT("headings.setup")}
        </h2>
        <p>{recordDiscGolfT("setupDescription")}</p>
        {isLoadingPlayers ? (
          <div className="form-grid form-grid--two" aria-live="polite">
            {["A", "B"].map((side) => (
              <div key={`disc-golf-player-skeleton-${side}`} className="form-field">
                <span className="form-label">
                  {recordDiscGolfT(
                    side === "A" ? "labels.sideAPlayers" : "labels.sideBPlayers",
                  )}
                </span>
                <div className="skeleton" style={{ height: 112 }} aria-hidden />
              </div>
            ))}
            <p className="sr-only">{recordDiscGolfT("loading.players")}</p>
          </div>
        ) : (
          <div className="form-grid form-grid--two">
            <label className="form-field" htmlFor="disc-golf-side-a">
              <span className="form-label">
                {recordDiscGolfT("labels.sideAPlayers")}
              </span>
              <select
                id="disc-golf-side-a"
                multiple
                value={sideAPlayers}
                onChange={(event) => handlePlayerChange("A", event)}
                disabled={hasMatchId}
              >
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field" htmlFor="disc-golf-side-b">
              <span className="form-label">
                {recordDiscGolfT("labels.sideBPlayers")}
              </span>
              <select
                id="disc-golf-side-b"
                multiple
                value={sideBPlayers}
                onChange={(event) => handlePlayerChange("B", event)}
                disabled={hasMatchId}
              >
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {playerError && <p>{playerError}</p>}
        {!!duplicatePlayerNames.length && (
          <p>
            {recordDiscGolfT("errors.uniquePlayers", {
              players: duplicatePlayerNames.join(", "),
            })}
          </p>
        )}
        <div className="form-grid form-grid--two">
          <label className="form-field" htmlFor="disc-golf-hole-count">
            <span className="form-label">{recordDiscGolfT("labels.holeCount")}</span>
            <input
              id="disc-golf-hole-count"
              type="number"
              min={1}
              max={MAX_HOLE_COUNT}
              value={holeCountInput}
              onChange={(event) => handleHoleCountChange(event.target.value)}
              disabled={hasMatchId}
              inputMode="numeric"
            />
          </label>
        </div>
        <fieldset className="form-fieldset">
          <legend className="form-legend">{recordDiscGolfT("labels.parLegend")}</legend>
          <div
            className="form-grid form-grid--two"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
          >
            {pars.map((value, index) => (
              <label
                key={`disc-golf-par-${index}`}
                className="form-field"
                htmlFor={`disc-golf-par-${index}`}
              >
                <span className="form-label">
                  {recordDiscGolfT("labels.hole", { number: index + 1 })}
                </span>
                <input
                  id={`disc-golf-par-${index}`}
                  type="number"
                  min={1}
                  value={value}
                  onChange={(event) =>
                    handleParChange(index, event.target.value)
                  }
                  disabled={hasMatchId}
                  aria-invalid={parErrors.has(index)}
                  inputMode="numeric"
                />
              </label>
            ))}
          </div>
        </fieldset>
        {setupError && !duplicatePlayerNames.length && <p>{setupError}</p>}
        <div className="form-grid form-grid--two">
          <button type="button" onClick={startMatch} disabled={creatingMatch}>
            {creatingMatch
              ? recordDiscGolfT("loading.starting")
              : recordDiscGolfT("actions.startNew")}
          </button>
          <label className="form-field" htmlFor="disc-golf-existing-match">
            <span className="form-label">{recordDiscGolfT("labels.existingMatch")}</span>
            {isLoadingMatches ? (
              <div className="skeleton" style={{ height: 44 }} role="status">
                <span className="sr-only">{recordDiscGolfT("loading.matches")}</span>
              </div>
            ) : (
              <select
                id="disc-golf-existing-match"
                onChange={(event) => {
                  const matchId = event.target.value;
                  if (matchId) {
                    navigateToMatch(matchId);
                  }
                }}
                disabled={isLoadingMatches || matchOptions.length === 0}
                value={hasMatchId ? currentMatchId : ""}
              >
                <option value="" disabled>
                  {recordDiscGolfT("placeholders.existingMatch")}
                </option>
                {matchOptions.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.id}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        {matchPickerError && <p>{matchPickerError}</p>}
      </section>

      <section className="form-stack" aria-labelledby="disc-golf-scoring-heading">
        <h2 id="disc-golf-scoring-heading" className="sr-only">
          {recordDiscGolfT("headings.scoring")}
        </h2>
        {hasMatchId ? (
          <>
            {loadingMatchDetails ? (
              <div className="form-stack" aria-live="polite">
                <div className="skeleton" style={{ height: 18, width: "60%" }} />
                <div className="skeleton" style={{ height: 18, width: "70%" }} />
                <p className="sr-only">{recordDiscGolfT("loading.matchDetails")}</p>
              </div>
            ) : (
              <>
                <p>
                  {isMatchComplete
                    ? recordDiscGolfT("states.matchComplete", {
                        holeCount: effectiveHoleCount,
                      })
                    : recordDiscGolfT("states.holeProgress", {
                        hole,
                        holeCount: effectiveHoleCount,
                      })}
                  {currentPar
                    ? ` ${recordDiscGolfT("states.par", { par: currentPar })}`
                    : null}
                </p>
                {(sideALabel || sideBLabel) && (
                  <p>
                    {recordDiscGolfT("states.sides", {
                      sideA: sideALabel || recordDiscGolfT("states.unassigned"),
                      sideB: sideBLabel || recordDiscGolfT("states.unassigned"),
                    })}
                  </p>
                )}
                {matchDetailsError && <p>{matchDetailsError}</p>}
              </>
            )}
            {loadingMatchDetails ? (
              <div className="scores form-grid form-grid--two" aria-hidden>
                {["A", "B"].map((side) => (
                  <div key={`disc-golf-score-skeleton-${side}`} className="form-field">
                    <span className="form-label">
                      {recordDiscGolfT(
                        side === "A"
                          ? "labels.sideAStrokes"
                          : "labels.sideBStrokes",
                      )}
                    </span>
                    <div className="skeleton" style={{ height: 44 }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="scores form-grid form-grid--two">
                <label className="form-field" htmlFor="disc-golf-score-a">
                  <span className="form-label">
                    {recordDiscGolfT("labels.sideAStrokes")}
                  </span>
                  <input
                    id="disc-golf-score-a"
                    type="number"
                    placeholder={recordDiscGolfT("placeholders.strokeExample", {
                      example: 3,
                    })}
                    value={strokeA}
                    onChange={(event) => {
                      setStrokeA(event.target.value);
                      setRecordError(null);
                    }}
                    disabled={
                      !hasMatchId || loadingMatchDetails || isMatchComplete
                    }
                    inputMode="numeric"
                    min={1}
                  />
                </label>
                <label className="form-field" htmlFor="disc-golf-score-b">
                  <span className="form-label">
                    {recordDiscGolfT("labels.sideBStrokes")}
                  </span>
                  <input
                    id="disc-golf-score-b"
                    type="number"
                    placeholder={recordDiscGolfT("placeholders.strokeExample", {
                      example: 4,
                    })}
                    value={strokeB}
                    onChange={(event) => {
                      setStrokeB(event.target.value);
                      setRecordError(null);
                    }}
                    disabled={
                      !hasMatchId || loadingMatchDetails || isMatchComplete
                    }
                    inputMode="numeric"
                    min={1}
                  />
                </label>
              </div>
            )}
            {loadingMatchDetails ? (
              <div className="skeleton" style={{ height: 44, width: 180 }} />
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={
                  !hasMatchId || loadingMatchDetails || submittingHole || isMatchComplete
                }
              >
                {submittingHole
                  ? recordDiscGolfT("loading.recording")
                  : recordDiscGolfT("actions.recordHole")}
              </button>
            )}
            {recordError && <p>{recordError}</p>}
          </>
        ) : (
          <p>{recordDiscGolfT("states.noMatch")}</p>
        )}
      </section>
    </main>
  );
}

function DiscGolfLoading() {
  const recordDiscGolfT = useTranslations("Record.discGolf");
  return (
    <main className="container">
      <h1 className="heading">{recordDiscGolfT("title")}</h1>
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
