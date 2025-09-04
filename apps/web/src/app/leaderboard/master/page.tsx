import Leaderboard from "../leaderboard";
import ErrorBoundary from "../../../components/ErrorBoundary";

export default function MasterLeaderboardPage() {
  return (
    <ErrorBoundary>
      <Leaderboard sport="master" />
    </ErrorBoundary>
  );
}

