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
  return (
    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
      <Chart type="matrix" data={chartData} options={options} />
    </div>
  );
}

export default MatchHeatmap;
