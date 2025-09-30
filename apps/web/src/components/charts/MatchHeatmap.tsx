'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ScriptableContext,
  type TooltipItem,
  type ChartOptions,
} from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { Chart } from 'react-chartjs-2';
import { HeatmapDatum, calculateMaxValue } from './heatmapUtils';
export type { HeatmapDatum } from './heatmapUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  MatrixController,
  MatrixElement
);

export interface MatchHeatmapProps {
  data: HeatmapDatum[];
  xLabels: string[];
  yLabels: string[];
}

export function MatchHeatmap({ data, xLabels, yLabels }: MatchHeatmapProps) {
  const maxV = calculateMaxValue(data);
  const chartData = {
    datasets: [
      {
        label: 'Matches',
        data,
        backgroundColor: (ctx: ScriptableContext<'matrix'>) => {
          const value = (ctx.raw as HeatmapDatum | undefined)?.v ?? 0;
          const alpha = maxV ? value / maxV : 0;
          return `rgba(26, 115, 232, ${alpha})`;
        },
        width: (ctx: ScriptableContext<'matrix'>) => {
          const { chartArea } = ctx.chart;
          if (!chartArea) return 0;
          const columns = Math.max(xLabels.length, 1);
          return Math.max(chartArea.width / columns - 2, 0);
        },
        height: (ctx: ScriptableContext<'matrix'>) => {
          const { chartArea } = ctx.chart;
          if (!chartArea) return 0;
          const rows = Math.max(yLabels.length, 1);
          return Math.max(chartArea.height / rows - 2, 0);
        },
      },
    ],
  };
  const options: ChartOptions<'matrix'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: 'category' as const, labels: xLabels, offset: true },
      y: {
        type: 'category' as const,
        labels: yLabels,
        offset: true,
        reverse: true,
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'matrix'>[]) =>
            xLabels[items[0].parsed.x],
          label: (item: TooltipItem<'matrix'>) =>
            `${yLabels[item.parsed.y]}: ${(item.raw as HeatmapDatum).v}`,
        },
      },
      legend: { display: false },
    },
  };
  const totalMatches = data.reduce((sum, point) => sum + point.v, 0);
  const busiest = data.reduce<HeatmapDatum | null>(
    (current, point) => (current && current.v >= point.v ? current : point),
    data[0] ?? null,
  );
  const busiestDay =
    typeof busiest?.x === 'number' ? xLabels[busiest.x] ?? `${busiest.x}` : undefined;
  const busiestTime =
    typeof busiest?.y === 'number' ? yLabels[busiest.y] ?? `${busiest.y}` : undefined;
  const summary =
    totalMatches > 0 && busiest && busiestDay && busiestTime
      ? `Heatmap showing ${totalMatches} matches played across days of the week and hours of the day. The busiest period is ${busiestDay} at ${busiestTime} with ${busiest.v} matches.`
      : 'Heatmap showing match activity by day of week and hour of day. No activity data is available.';
  const sortedEntries = [...data].sort((a, b) => {
    if (a.x === b.x) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });
  return (
    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
      <Chart
        role="img"
        aria-label={summary}
        type="matrix"
        data={chartData}
        options={options}
      />
      {totalMatches > 0 ? (
        <table className="sr-only">
          <caption>Matches by day and start hour</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Hour</th>
              <th scope="col">Matches</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((point) => {
              const dayLabel =
                typeof point.x === 'number' ? xLabels[point.x] ?? `${point.x}` : `${point.x}`;
              const hourLabel =
                typeof point.y === 'number' ? yLabels[point.y] ?? `${point.y}` : `${point.y}`;
              return (
                <tr key={`${point.x}-${point.y}`}>
                  <td>{dayLabel}</td>
                  <td>{hourLabel}</td>
                  <td>{point.v}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="sr-only">No heatmap data is available.</p>
      )}
    </div>
  );
}

export default MatchHeatmap;
