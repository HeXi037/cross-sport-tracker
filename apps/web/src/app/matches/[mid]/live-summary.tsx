"use client";

import { useEffect, useState } from "react";
import { useMatchStream } from "../../../lib/useMatchStream";

export type SummaryData = {
  sets?: Record<string, number>;
  games?: Record<string, number>;
  points?: Record<string, number>;
} | null | undefined;

function formatScoreline(summary?: SummaryData): string {
  if (!summary) return "—";
  const format = (scores?: Record<string, number>) => {
    const a = scores?.A ?? 0;
    const b = scores?.B ?? 0;
    return `${a}-${b}`;
  };
  if (summary.sets) return format(summary.sets);
  if (summary.games) return format(summary.games);
  if (summary.points) return format(summary.points);
  return "—";
}

export default function LiveSummary({
  mid,
  initialSummary,
}: {
  mid: string;
  initialSummary?: SummaryData;
}) {
  const [summary, setSummary] = useState<SummaryData>(initialSummary);
  const { event, connected, fallback } = useMatchStream(mid);
  const isLive = connected && !fallback;

  useEffect(() => {
    if (event?.summary) {
      setSummary(event.summary as SummaryData);
    }
  }, [event]);

  return (
    <div className="match-meta">
      <span>Overall: {formatScoreline(summary)}</span>
      <span className="connection-indicator">
        <span className={`dot ${isLive ? "dot-live" : "dot-polling"}`} />
        {isLive ? "Live" : "Polling…"}
      </span>
    </div>
  );
}
