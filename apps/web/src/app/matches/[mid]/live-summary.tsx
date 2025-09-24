"use client";

import { useEffect, useMemo, useState } from "react";
import { useMatchStream } from "../../../lib/useMatchStream";
import MatchScoreboard from "./MatchScoreboard";

type NumericRecord = Record<string, number>;
type SetScores = Array<Record<string, number>>;

export type RacketSummary = {
  sets?: NumericRecord;
  games?: NumericRecord;
  points?: NumericRecord;
  set_scores?: SetScores;
  config?: unknown;
  [key: string]: unknown;
};

export type DiscGolfSummary = {
  scores?: Record<string, Array<number | null | undefined>>;
  pars?: Array<number | null | undefined>;
  totals?: NumericRecord;
  parTotal?: number | null;
  toPar?: NumericRecord;
  config?: unknown;
  [key: string]: unknown;
};

export type BowlingSummaryPlayer = {
  side?: string;
  playerId?: string;
  playerName?: string;
  frames?: Array<Array<number | null | undefined>>;
  scores?: Array<number | null | undefined>;
  total?: number | null;
};

export type BowlingSummary = {
  frames?: Array<Array<number | null | undefined>>;
  scores?: Array<number | null | undefined>;
  total?: number | null;
  players?: BowlingSummaryPlayer[];
  config?: unknown;
  [key: string]: unknown;
};

export type SummaryData =
  | RacketSummary
  | DiscGolfSummary
  | BowlingSummary
  | Record<string, unknown>
  | null
  | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractConfig(summary: SummaryData): unknown {
  if (isRecord(summary) && "config" in summary) {
    return (summary as { config?: unknown }).config;
  }
  return undefined;
}

function formatScoreline(summary?: SummaryData): string {
  if (!isRecord(summary)) return "—";
  const maybe = summary as RacketSummary;
  const setsHistory = maybe.set_scores;
  if (Array.isArray(setsHistory) && setsHistory.length) {
    const formatted = setsHistory
      .map((set) => {
        if (!set || typeof set !== "object") return null;
        const entries = Object.entries(set as Record<string, unknown>);
        if (!entries.length) return null;
        const values = entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, value]) =>
            typeof value === "number" && Number.isFinite(value)
              ? value.toString()
              : null
          );
        if (values.some((v) => v === null)) return null;
        return values.join("-");
      })
      .filter((val): val is string => Boolean(val));
    if (formatted.length) {
      return formatted.join(", ");
    }
  }
  const format = (scores?: Record<string, number>) => {
    const a = scores?.A ?? 0;
    const b = scores?.B ?? 0;
    return `${a}-${b}`;
  };
  if (maybe.sets) return format(maybe.sets);
  if (maybe.games) return format(maybe.games);
  if (maybe.points) return format(maybe.points);
  return "—";
}

export default function LiveSummary({
  mid,
  initialSummary,
  sport,
  initialConfig,
}: {
  mid: string;
  sport?: string | null;
  initialSummary?: SummaryData;
  initialConfig?: unknown;
}) {
  const [summary, setSummary] = useState<SummaryData>(initialSummary);
  const [config, setConfig] = useState<unknown>(
    initialConfig ?? extractConfig(initialSummary)
  );
  const { event, connected, fallback } = useMatchStream(mid);
  const isLive = connected && !fallback;

  useEffect(() => {
    if (event?.summary) {
      setSummary(event.summary as SummaryData);
      setConfig(extractConfig(event.summary as SummaryData));
    }
  }, [event]);

  const effectiveSummary = useMemo(() => summary ?? null, [summary]);

  return (
    <section className="card live-summary-card">
      <div className="live-summary-header">
        <span className="live-summary-overall">
          Overall: {formatScoreline(effectiveSummary)}
        </span>
        <span className="connection-indicator">
          <span className={`dot ${isLive ? "dot-live" : "dot-polling"}`} />
          {isLive ? "Live" : "Polling…"}
        </span>
      </div>
      <MatchScoreboard summary={effectiveSummary} sport={sport} config={config} />
    </section>
  );
}
