import Leaderboard from "../leaderboard";

export default function LeaderboardSportPage({ params }: { params: { sport: string } }) {
  return <Leaderboard sport={params.sport} />;
}
