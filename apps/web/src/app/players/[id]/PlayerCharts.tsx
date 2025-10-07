'use client';

import { useMemo } from 'react';
import WinRateChart, { WinRatePoint } from '../../../components/charts/WinRateChart';
import RankingHistoryChart, { RankingPoint } from '../../../components/charts/RankingHistoryChart';
import MatchHeatmap, { HeatmapDatum } from '../../../components/charts/MatchHeatmap';
import { useLocale, useTimeZone } from '../../../lib/LocaleContext';
import { formatDate } from '../../../lib/i18n';
import NoMatchesGuidance from './NoMatchesGuidance';

interface EnrichedMatch {
  playedAt: string | null;
  playerWon?: boolean;
}

function parseMatchDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface RatingHistoryInput {
  values: number[];
  label: string;
}

export default function PlayerCharts({
  matches,
  rollingWinPct = [],
  ratingHistory,
}: {
  matches: EnrichedMatch[];
  rollingWinPct?: number[];
  ratingHistory?: RatingHistoryInput | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const formatMatchDate = useMemo(
    () => (value: Date | string) => formatDate(value, locale, undefined, timeZone),
    [locale, timeZone],
  );
  const sorted = [...matches].sort((a, b) => {
    const da = parseMatchDate(a.playedAt)?.getTime() ?? 0;
    const db = parseMatchDate(b.playedAt)?.getTime() ?? 0;
    return da - db;
  });

  const matchesWithOutcome = sorted.filter(
    (match) => typeof match.playerWon === 'boolean'
  );

  const safeRolling = rollingWinPct.filter(
    (value) => typeof value === 'number' && Number.isFinite(value)
  );

  const winRateData: WinRatePoint[] = [];

  if (matchesWithOutcome.length && safeRolling.length) {
    const offset = Math.max(0, safeRolling.length - matchesWithOutcome.length);
    const alignedRolling = safeRolling.slice(offset);
    matchesWithOutcome.forEach((match, index) => {
      const playedDate = parseMatchDate(match.playedAt);
      const label = playedDate
        ? formatMatchDate(playedDate)
        : `Match ${index + 1}`;
      const pct = alignedRolling[index] ?? null;
      if (pct !== null && Number.isFinite(pct)) {
        winRateData.push({ date: label, winRate: Math.max(0, Math.min(pct, 1)) });
      }
    });
  }

  if (!winRateData.length) {
    let wins = 0;
    matchesWithOutcome.forEach((match, index) => {
      if (match.playerWon) {
        wins += 1;
      }
      const playedDate = parseMatchDate(match.playedAt);
      const label = playedDate
        ? formatMatchDate(playedDate)
        : `Match ${index + 1}`;
      const total = index + 1;
      winRateData.push({ date: label, winRate: total ? wins / total : 0 });
    });
  }

  const rankingData: RankingPoint[] = [];

  if (ratingHistory?.values?.length) {
    const validRatings = ratingHistory.values.filter((value) =>
      Number.isFinite(value)
    );
    if (validRatings.length) {
      const maxRating = Math.max(...validRatings);
      const prefix = ratingHistory.label.trim() || 'Update';
      validRatings.forEach((value, index) => {
        const adjusted = Math.max(1, Math.round(maxRating - value + 1));
        const label =
          validRatings.length === 1
            ? prefix
            : `${prefix} ${index + 1}`;
        rankingData.push({ date: label, rank: adjusted });
      });
    }
  }

  if (!rankingData.length) {
    let wins = 0;
    let rank = 100;
    matchesWithOutcome.forEach((match, index) => {
      if (match.playerWon) {
        wins += 1;
        rank = Math.max(rank - 1, 1);
      } else {
        rank += 1;
      }
      const playedDate = parseMatchDate(match.playedAt);
      const label = playedDate
        ? formatMatchDate(playedDate)
        : `Match ${index + 1}`;
      rankingData.push({ date: label, rank });
    });
  }

  const heatmapMap = new Map<string, number>();

  sorted.forEach((match) => {
    const playedDate = parseMatchDate(match.playedAt);
    if (playedDate) {
      const key = `${playedDate.getDay()}-${playedDate.getHours()}`;
      heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
    }
  });

  const heatmapData: HeatmapDatum[] = Array.from(heatmapMap.entries()).map(([k, v]) => {
    const [x, y] = k.split('-').map(Number);
    return { x, y, v };
  });

  const hasMatches = winRateData.length > 0;
  const hasRankingHistory = rankingData.length > 0;
  const hasHeatmapEntries = heatmapData.length > 0;

  const xLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const yLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  return (
    <section className="mt-8 space-y-8">
      <div>
        <h2 className="heading">Performance</h2>
        {hasMatches ? (
          <WinRateChart data={winRateData} />
        ) : (
          <NoMatchesGuidance className="text-sm" />
        )}
      </div>
      <div>
        <h3 className="heading">Ranking History</h3>
        {hasRankingHistory ? (
          <RankingHistoryChart data={rankingData} />
        ) : (
          <p className="text-sm text-gray-600">No ranking history.</p>
        )}
      </div>
      <div>
        <h3 className="heading">Activity Heatmap</h3>
        {hasHeatmapEntries ? (
          <MatchHeatmap data={heatmapData} xLabels={xLabels} yLabels={yLabels} />
        ) : (
          <p className="text-sm text-gray-600">No activity recorded.</p>
        )}
      </div>
    </section>
  );
}
