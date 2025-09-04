import Leaderboard from "../leaderboard";
import ErrorBoundary from "../../../components/ErrorBoundary";

export default function LeaderboardSportPage({ params }: { params: { sport: string } }) {
  return (
    <ErrorBoundary>
      <Leaderboard sport={params.sport} />
    </ErrorBoundary>
  );
}
