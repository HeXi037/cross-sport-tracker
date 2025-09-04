import Leaderboard from "./leaderboard";
import ErrorBoundary from "../../components/ErrorBoundary";

export default function LeaderboardIndexPage() {
  return (
    <ErrorBoundary>
      <Leaderboard sport="all" />
    </ErrorBoundary>
  );
}
