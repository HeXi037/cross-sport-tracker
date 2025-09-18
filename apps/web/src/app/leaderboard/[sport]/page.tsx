import Leaderboard from "../leaderboard";

type LeaderboardSearchParams = {
  country?: string | string[];
  clubId?: string | string[];
};

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default function LeaderboardSportPage({
  params,
  searchParams,
}: {
  params: { sport: string };
  searchParams?: LeaderboardSearchParams;
}) {
  const country = toSingleValue(searchParams?.country);
  const clubId = toSingleValue(searchParams?.clubId);
  return <Leaderboard sport={params.sport} country={country} clubId={clubId} />;
}
