import { redirect } from "next/navigation";
import {
  ALL_SPORTS,
  type LeaderboardSport,
  isLeaderboardSport,
} from "../constants";

type LeaderboardSearchParams = {
  country?: string | string[];
  clubId?: string | string[];
};

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const redirectToLeaderboard = (
  sport: LeaderboardSport | undefined,
  country?: string,
  clubId?: string,
): never => {
  const params = new URLSearchParams();
  if (sport && sport !== ALL_SPORTS) params.set("sport", sport);
  if (country) params.set("country", country);
  if (clubId) params.set("clubId", clubId);
  const query = params.toString();
  redirect(query ? `/leaderboard?${query}` : "/leaderboard");
};

export default function LeaderboardSportPage({
  params,
  searchParams,
}: {
  params: { sport: string };
  searchParams?: LeaderboardSearchParams;
}) {
  const { sport } = params;
  const country = toSingleValue(searchParams?.country);
  const clubId = toSingleValue(searchParams?.clubId);

  if (isLeaderboardSport(sport)) {
    redirectToLeaderboard(sport, country, clubId);
  }

  redirectToLeaderboard(undefined, country, clubId);
}
