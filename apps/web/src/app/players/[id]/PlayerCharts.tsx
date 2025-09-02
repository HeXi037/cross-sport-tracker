'use client';

import WinRateChart, { WinRatePoint } from '../../components/charts/WinRateChart';
import RankingHistoryChart, { RankingPoint } from '../../components/charts/RankingHistoryChart';
import MatchHeatmap, { HeatmapDatum } from '../../components/charts/MatchHeatmap';

interface EnrichedMatch {
  playedAt: string | null;
  playerWon?: boolean;
}

export default function PlayerCharts({ matches }: { matches: EnrichedMatch[] }) {
  const sorted = [...matches].sort((a, b) => {
    const da = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const db = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    return da - db;
  });

  let wins = 0;
  let rank = 100;
  const winRateData: WinRatePoint[] = [];
  const rankingData: RankingPoint[] = [];
  const heatmapMap = new Map<string, number>();

  sorted.forEach((m, i) => {
    if (m.playerWon) {
      wins += 1;
      rank = Math.max(rank - 1, 1);
    } else {
      rank += 1;
    }
    const dateLabel = m.playedAt ? new Date(m.playedAt).toLocaleDateString() : `Match ${i + 1}`;
    winRateData.push({ date: dateLabel, winRate: wins / (i + 1) });
    rankingData.push({ date: dateLabel, rank });

    if (m.playedAt) {
      const d = new Date(m.playedAt);
      const key = `${d.getDay()}-${d.getHours()}`;
      heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
    }
  });

  const heatmapData: HeatmapDatum[] = Array.from(heatmapMap.entries()).map(([k, v]) => {
    const [x, y] = k.split('-').map(Number);
    return { x, y, v };
  });

  const xLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const yLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  return (
    <section className="mt-8">
      <h2 className="heading">Performance</h2>
      <WinRateChart data={winRateData} />
      <div className="mt-8">
        <h3 className="heading">Ranking History</h3>
        <RankingHistoryChart data={rankingData} />
      </div>
      <div className="mt-8">
        <h3 className="heading">Activity Heatmap</h3>
        <MatchHeatmap data={heatmapData} xLabels={xLabels} yLabels={yLabels} />
      </div>
    </section>
  );
}
