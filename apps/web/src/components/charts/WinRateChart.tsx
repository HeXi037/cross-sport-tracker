'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
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

export interface WinRatePoint {
  date: string;
  winRate: number; // 0..1
}

export function WinRateChart({ data }: { data: WinRatePoint[] }) {
  const chartData = {
    labels: data.map((d) => d.date),
    datasets: [
      {
        label: 'Win Rate %',
        data: data.map((d) => d.winRate * 100),
        borderColor: 'rgba(186, 12, 47, 0.8)',
        backgroundColor: 'rgba(186, 12, 47, 0.3)',
        tension: 0.2,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false as const,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: { callback: (val: number) => val + '%' },
      },
    },
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

export default WinRateChart;
