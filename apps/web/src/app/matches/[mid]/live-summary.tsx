"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SummaryData,
  RacketSummary,
  DiscGolfSummary,
  BowlingSummary,
  SetScores,
  getNumericEntries,
  hasPositiveValues,
  isRecord,
  isFinishedStatus,
} from "../../../lib/match-summary";
import { useMatchStream } from "../../../lib/useMatchStream";
import MatchScoreboard from "./MatchScoreboard";

function extractConfig(summary: SummaryData): unknown {
  if (isRecord(summary) && "config" in summary) {
    return (summary as { config?: unknown }).config;
  }
  return undefined;
}

function sanitizeStatus(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function deriveRacketTotals(
  setScores?: SetScores
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

function formatScoreline(summary?: SummaryData): string {
  if (!isRecord(summary)) return "—";
  const maybe = summary as RacketSummary;
  const setsHistory = maybe.set_scores;
  if (Array.isArray(setsHistory) && setsHistory.length) {
    const formatted = setsHistory
      .map((set) => {
        const entries = getNumericEntries(set);
        if (entries.length < 2) return null;
        return entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, value]) => value.toString())
