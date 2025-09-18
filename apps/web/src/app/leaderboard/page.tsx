import Leaderboard from "./leaderboard";

type LeaderboardSearchParams = {
  country?: string | string[];
  clubId?: string | string[];
};

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default function LeaderboardIndexPage({
  searchParams,
}: {
  searchParams?: LeaderboardSearchParams;
}) {
  const country = toSingleValue(searchParams?.country);
  const clubId = toSingleValue(searchParams?.clubId);
  return <Leaderboard sport="all" country={country} clubId={clubId} />;
}
