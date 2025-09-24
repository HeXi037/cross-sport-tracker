"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type SummaryData,
  type RacketSummary,
  type SetScores,
  type ScoreEvent,
  getNumericEntries,
  hasPositiveValues,
  isRecord,
  isFinishedStatus,
} from "../../../lib/match-summary";
import { useMatchStream } from "../../../lib/useMatchStream";
import MatchScoreboard from "./MatchScoreboard";

type LiveSummaryProps = {
  mid: string;
  sport?: string | null;
  status?: string | null;
  initialSummary?: SummaryData | null;
  initialEvents?: ScoreEvent[] | null;
};

function sanitizeStatus(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function deriveRacketTotals(
  setScores?: SetScores | null
): { sets?: Record<string, number>; games?: Record<string, number> } | null {
  if (!Array.isArray(setScores) || setScores.length === 0) return null;

  const normalizedSets = setScores.filter(
    (set): set is Record<string, unknown> =>
      !!set && typeof set === "object" && !Array.isArray(set)
  );

  if (normalizedSets.length === 0) return null;

  const sides = new Set<string>();
  normalizedSets.forEach((set) => {
    getNumericEntries(set).forEach(([side]) => sides.add(side));
  });

  if (!sides.size) return null;

  const derivedSets: Record<string, number> = {};
  const derivedGames: Record<string, number> = {};
  sides.forEach((side) => {
    derivedSets[side] = 0;
    derivedGames[side] = 0;
  });

  normalizedSets.forEach((set) => {
    const entries = getNumericEntries(set);
    if (entries.length < 2) return;

    entries.forEach(([side, value]) => {
      derivedGames[side] += value;
    });

    const maxValue = Math.max(...entries.map(([, value]) => value));
    const leaders = entries.filter(([, value]) => value === maxValue);
    if (maxValue > -Infinity && leaders.length === 1) {
      const [winner] = leaders[0];
      derivedSets[winner] += 1;
    }
  });

  const hasSetWins = Object.values(derivedSets).some((value) => value > 0);
  const hasGamesWon = Object.values(derivedGames).some((value) => value > 0);

  const result: { sets?: Record<string, number>; games?: Record<string, number> } = {};
  if (hasSetWins) result.sets = derivedSets;
  if (hasGamesWon) result.games = derivedGames;

  return Object.keys(result).length ? result : null;
}

function enrichSummary(summary: SummaryData): SummaryData {
  if (!isRecord(summary)) return summary ?? null;
  const maybe = summary as RacketSummary;
  const derived = deriveRacketTotals(maybe.set_scores);
  if (!derived) return summary;

  const next: RacketSummary = { ...maybe };
  let changed = false;

  if (derived.sets && !hasPositiveValues(maybe.sets)) {
    next.sets = derived.sets;
    changed = true;
  }
  if (derived.games && !hasPositiveValues(maybe.games)) {
    next.games = derived.games;
    changed = true;
  }

  return changed ? next : summary;
}

function formatScoreline(summary?: SummaryData | null): string {
  if (!isRecord(summary)) return "Overall: —";
  const maybe = summary as RacketSummary & Record<string, unknown>;
  const setsHistory = maybe.set_scores;
  if (Array.isArray(setsHistory) && setsHistory.length) {
    const formatted = setsHistory
      .map((set) => {
        const entries = getNumericEntries(set);
        if (entries.length < 2) return null;
        const values = entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, value]) => value.toString());
        return values.length ? values.join("-") : null;
      })
      .filter((value): value is string => Boolean(value));
    if (formatted.length) {
      return `Overall: ${formatted.join(", ")}`;
    }
  }

  const candidateKeys = ["sets", "games", "points", "score", "totals"] as const;
  for (const key of candidateKeys) {
    if (key in maybe) {
      const entries = getNumericEntries((maybe as Record<string, unknown>)[key]);
      if (entries.length >= 2) {
        const result = entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, value]) => value.toString())
          .join("-");
        if (result) {
          return `Overall: ${result}`;
        }
      }
      if (entries.length === 1) {
        const [side, value] = entries[0];
        return `Overall: ${side} ${value}`;
      }
    }
  }

  const totalValue = (maybe as { total?: unknown }).total;
  if (typeof totalValue === "number" && Number.isFinite(totalValue)) {
    return `Overall: ${totalValue}`;
  }

  return "Overall: —";
}

function resolveScoreEventPayload(event: unknown): Record<string, unknown> | null {
  if (!isRecord(event)) return null;
  const record = event as Record<string, unknown>;
  const maybePayload = record.payload;
  if (maybePayload && typeof maybePayload === "object" && !Array.isArray(maybePayload)) {
    return maybePayload as Record<string, unknown>;
  }
  return record;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function getPointWinner(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const container = event as Record<string, unknown>;
  const payload = resolveScoreEventPayload(event);
  const rawType =
    (payload && readString(payload, "type")) ?? readString(container, "type");
  if (!rawType || rawType.trim().toUpperCase() !== "POINT") return null;
  const rawSide =
    (payload &&
      (readString(payload, "by") ??
        readString(payload, "side") ??
        readString(payload, "winner") ??
        readString(payload, "team"))) ??
    readString(container, "by") ??
    readString(container, "side") ??
    readString(container, "winner") ??
    readString(container, "team");
  if (!rawSide) return null;
  const normalized = rawSide.trim().toUpperCase();
  return normalized ? normalized : null;
}

function derivePointTotalsFromEvents(
  events: Array<ScoreEvent | Record<string, unknown>> | null | undefined
): Record<string, number> | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const totals: Record<string, number> = {};
  events.forEach((event) => {
    const winner = getPointWinner(event);
    if (!winner) return;
    totals[winner] = (totals[winner] ?? 0) + 1;
  });
  return Object.keys(totals).length ? totals : null;
}

function collectSides(source: unknown, into: Set<string>): void {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  Object.keys(source as Record<string, unknown>).forEach((key) => {
    if (key) into.add(key);
  });
}

function normalizePointTotals(
  summary: SummaryData,
  totals: Record<string, number>
): Record<string, number> {
  const normalized: Record<string, number> = {};
  const sides = new Set<string>(Object.keys(totals));
  if (isRecord(summary)) {
    const maybe = summary as RacketSummary & Record<string, unknown>;
    collectSides(maybe.sets ?? null, sides);
    collectSides(maybe.games ?? null, sides);
    collectSides((maybe as { points?: unknown }).points ?? null, sides);
    const setScores = maybe.set_scores;
    if (Array.isArray(setScores)) {
      setScores.forEach((set) => collectSides(set, sides));
    }
  }
  sides.forEach((side) => {
    const value = totals[side];
    normalized[side] =
      typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  return normalized;
}

function applyPointTotals(
  summary: SummaryData,
  totals: Record<string, number> | null
): SummaryData {
  if (!totals || Object.keys(totals).length === 0) return summary ?? null;
  if (!isRecord(summary)) return summary ?? null;
  const maybe = summary as RacketSummary;
  if (hasPositiveValues(maybe.points)) return summary;
  const normalized = normalizePointTotals(summary, totals);
  if (!Object.keys(normalized).length) return summary;
  const next: RacketSummary = { ...maybe, points: normalized };
  return next;
}

function describeEvent(event: unknown): string | null {
  const payload = resolveScoreEventPayload(event);
  if (!payload) return null;

  const type = readString(payload, "type");
  const by = readString(payload, "by");
  const side = readString(payload, "side");
  const actor = by ?? side;

  if (type && actor) {
    const normalizedType = type
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^[a-z]/, (char) => char.toUpperCase());
    return `${normalizedType} – ${actor}`;
  }

  if (type) {
    return type.replace(/_/g, " ");
  }

  if (actor) {
    return `Side ${actor}`;
  }

  return null;
}

export default function LiveSummary({
  mid,
  sport,
  status,
  initialSummary = null,
  initialEvents = null,
}: LiveSummaryProps) {
  const { event, connected, fallback } = useMatchStream(mid);
  const [summary, setSummary] = useState<SummaryData>(initialSummary ?? null);
  const summaryRef = useRef<SummaryData>(initialSummary ?? null);
  const [statusLabel, setStatusLabel] = useState<string | undefined>(() =>
    sanitizeStatus(status)
  );
  const [latestEvent, setLatestEvent] = useState<string | null>(null);
  const [pointTotals, setPointTotals] = useState<Record<string, number> | null>(
    () => derivePointTotalsFromEvents(initialEvents)
  );

  useEffect(() => {
    setSummary(initialSummary ?? null);
  }, [initialSummary]);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  useEffect(() => {
    setPointTotals(derivePointTotalsFromEvents(initialEvents));
  }, [initialEvents]);

  useEffect(() => {
    setStatusLabel(sanitizeStatus(status));
  }, [status]);

  useEffect(() => {
    if (!isRecord(summary)) return;
    if (isFinishedStatus(statusLabel)) return;
    const maybePoints = (summary as RacketSummary).points;
    if (
      maybePoints !== null &&
      typeof maybePoints === "object" &&
      !Array.isArray(maybePoints)
    ) {
      setPointTotals(null);
    }
  }, [summary, statusLabel]);

  useEffect(() => {
    if (!event) return;

    const incomingStatus = sanitizeStatus((event as { status?: string | null }).status);
    if (incomingStatus !== undefined) {
      setStatusLabel(incomingStatus);
    }

    let nextSummary: SummaryData | undefined;

    if ("summary" in event) {
      const incomingSummary = (event as { summary?: SummaryData | null }).summary;
      if (incomingSummary !== undefined) {
        nextSummary = incomingSummary ?? null;
        setSummary(nextSummary);
      }
    }

    if ("event" in event) {
      const rawEvent = (event as { event?: unknown }).event;
      const label = describeEvent(rawEvent);
      if (label) {
        setLatestEvent(label);
      }
      const winner = getPointWinner(rawEvent);
      if (winner) {
        const summaryToCheck = nextSummary ?? summaryRef.current;
        const shouldTrack = !(
          isRecord(summaryToCheck) &&
          hasPositiveValues((summaryToCheck as RacketSummary).points)
        );
        if (shouldTrack) {
          setPointTotals((current) => {
            const next = { ...(current ?? {}) };
            next[winner] = (next[winner] ?? 0) + 1;
            return next;
          });
        }
      }
    }
  }, [event]);

  const enrichedSummary = useMemo(() => enrichSummary(summary), [summary]);
  const effectiveSummary = useMemo(
    () => applyPointTotals(enrichedSummary, pointTotals),
    [enrichedSummary, pointTotals]
  );
  const scoreline = useMemo(() => formatScoreline(effectiveSummary), [effectiveSummary]);
  const finished = isFinishedStatus(statusLabel);

  const indicatorLabel = connected ? "Live" : fallback ? "Polling" : "Offline";
  const indicatorDotClass = connected ? "dot-live" : "dot-polling";
  const showStatusSuffix = statusLabel ? ` · ${statusLabel}` : "";

  return (
    <section className="live-summary-card" aria-labelledby="live-summary-heading">
      <div className="live-summary-header">
        <span id="live-summary-heading">{`Live summary${showStatusSuffix}`}</span>
        <span className="connection-indicator" aria-live="polite">
          <span className={`dot ${indicatorDotClass}`} aria-hidden="true" />
          <span>{indicatorLabel}</span>
        </span>
      </div>

      <p className="live-summary-overall">{scoreline}</p>

      <MatchScoreboard summary={effectiveSummary} sport={sport} isFinished={finished} />

      {latestEvent ? (
        <p className="match-meta">Latest update: {latestEvent}</p>
      ) : null}
      {fallback && !connected ? (
        <p className="match-meta">
          Realtime connection unavailable. Refreshing every few seconds.
        </p>
      ) : null}
    </section>
  );
}
