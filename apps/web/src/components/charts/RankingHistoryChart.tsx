'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

export interface RankingPoint {
  date: string;
  rank: number;
}

export function RankingHistoryChart({ data }: { data: RankingPoint[] }) {
  const chartData = {
    labels: data.map((d) => d.date),
    datasets: [
      {
        label: 'Rank',
        data: data.map((d) => d.rank),
        borderColor: 'rgba(26, 115, 232, 0.8)',
        backgroundColor: 'rgba(26, 115, 232, 0.3)',
        tension: 0.2,
      },
    ],
  };
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        type: 'linear' as const,
        reverse: true,
        beginAtZero: true,
      },
    },
  };
  return (
    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

export default RankingHistoryChart;
