"use client";

import React from "react";
import { useMatchStream } from "../../../lib/useMatchStream";

export type SetData = Array<[number, number] | { A?: number; B?: number }> | null | undefined;

function normalizeSet(s: [number, number] | { A?: number; B?: number }): [number, number] {
  if (Array.isArray(s) && s.length === 2) return [Number(s[0]) || 0, Number(s[1]) || 0];
  const obj = s as { A?: number; B?: number };
  return [Number(obj.A) || 0, Number(obj.B) || 0];
}

function formatScoreline(sets?: SetData): string {
  if (!sets || !sets.length) return "—";
  const ns = sets.map(normalizeSet);
  const tallies = ns.reduce(
    (acc, [a, b]) => {
      if (a > b) acc.A += 1;
      else if (b > a) acc.B += 1;
      return acc;
    },
    { A: 0, B: 0 }
  );
  const setStr = ns.map(([a, b]) => `${a}-${b}`).join(", ");
  return `${tallies.A}-${tallies.B} (${setStr})`;
}

export default function LiveSummary({
  mid,
  initialSets,
}: {
  mid: string;
  initialSets?: SetData;
}) {
  const [sets, setSets] = React.useState(initialSets);
  const event = useMatchStream(mid);

  React.useEffect(() => {
    if (event?.sets) {
      setSets(event.sets as SetData);
    }
  }, [event]);

  return <div className="match-meta">Overall: {formatScoreline(sets)}</div>;
}
