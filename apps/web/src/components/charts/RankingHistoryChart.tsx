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
  const ranks = data.map((d) => d.rank);
  const minRank = ranks.length ? Math.min(...ranks) : null;
  const maxRank = ranks.length ? Math.max(...ranks) : null;
  const firstDate = data[0]?.date;
  const lastDate = data[data.length - 1]?.date;
  const summary =
    ranks.length > 0
      ? `Line chart showing the player's ranking history from ${firstDate} to ${lastDate}. Rankings range between ${minRank} and ${maxRank}, with lower numbers indicating a better rank.`
      : 'Line chart showing the player\'s ranking history. No ranking data is available.';
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
          <caption>Ranking by match date</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Rank</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point, index) => (
              <tr key={`${point.date}-${index}`}>
                <td>{point.date}</td>
                <td>{point.rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sr-only">No ranking data is available.</p>
      )}
    </div>
  );
}

export default RankingHistoryChart;
