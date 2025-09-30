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
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        type: 'linear' as const,
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (val: number | string) => `${val}%`,
        },
      },
    },
  };

  const winRates = data.map((d) => Math.round(d.winRate * 100));
  const minRate = winRates.length ? Math.min(...winRates) : null;
  const maxRate = winRates.length ? Math.max(...winRates) : null;
  const firstDate = data[0]?.date;
  const lastDate = data[data.length - 1]?.date;
  const summary =
    winRates.length > 0
      ? `Line chart showing the player's win rate percentage over time from ${firstDate} to ${lastDate}. The win rate ranges from ${minRate}% to ${maxRate}%.`
      : 'Line chart showing the player\'s win rate percentage over time. No win rate data is available.';

  return (
    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
      <Line
        role="img"
        aria-label={summary}
        data={chartData}
        options={options}
      />
      {data.length > 0 ? (
        <table className="sr-only">
          <caption>Win rate by match date</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point, index) => (
              <tr key={`${point.date}-${index}`}>
                <td>{point.date}</td>
                <td>{Math.round(point.winRate * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sr-only">No win rate data is available.</p>
      )}
    </div>
  );
}

export default WinRateChart;
