'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { Chart } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  MatrixController,
  MatrixElement
);

export interface HeatmapDatum {
  x: number;
  y: number;
  v: number;
}

export interface MatchHeatmapProps {
  data: HeatmapDatum[];
  xLabels: string[];
  yLabels: string[];
}

export function MatchHeatmap({ data, xLabels, yLabels }: MatchHeatmapProps) {
  const maxV = data.reduce((m, d) => Math.max(m, d.v), 0);
  const chartData = {
    datasets: [
      {
        label: 'Matches',
        data,
        backgroundColor: (ctx: any) => {
          const value = ctx.raw.v || 0;
          const alpha = maxV ? value / maxV : 0;
          return `rgba(26, 115, 232, ${alpha})`;
        },
        width: ({ chart }: any) => chart.chartArea.width / xLabels.length - 2,
        height: ({ chart }: any) => chart.chartArea.height / yLabels.length - 2,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false as const,
    scales: {
      x: { type: 'category', labels: xLabels, offset: true },
      y: { type: 'category', labels: yLabels, offset: true, reverse: true },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items: any) => xLabels[items[0].parsed.x],
          label: (item: any) => `${yLabels[item.parsed.y]}: ${item.raw.v}`,
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
