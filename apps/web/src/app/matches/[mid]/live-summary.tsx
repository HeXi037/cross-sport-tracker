"use client";

import { useEffect, useMemo, useState } from "react";
import { useMatchStream } from "../../../lib/useMatchStream";
import MatchScoreboard from "./MatchScoreboard";

type NumericRecord = Record<string, number>;

export type RacketSummary = {
  sets?: NumericRecord;
  games?: NumericRecord;
  points?: NumericRecord;
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

export type BowlingSummary = {
  frames?: Array<Array<number | null | undefined>>;
  scores?: Array<number | null | undefined>;
  total?: number | null;
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
