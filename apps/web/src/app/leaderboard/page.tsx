import { redirect } from "next/navigation";
import Leaderboard from "./leaderboard";
import {
  ALL_SPORTS,
  type LeaderboardSport,
  isLeaderboardSport,
} from "./constants";

type LeaderboardSearchParams = {
  country?: string | string[];
  clubId?: string | string[];
  tab?: string | string[];
  sport?: string | string[];
};

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const parseSportParam = (
  raw?: string | null,
): LeaderboardSport | undefined | null => {
  if (raw == null) return undefined;
  return isLeaderboardSport(raw) ? raw : null;
};

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

export default function LeaderboardIndexPage({
  searchParams,
}: {
  searchParams?: LeaderboardSearchParams;
}) {
  const country = toSingleValue(searchParams?.country);
  const clubId = toSingleValue(searchParams?.clubId);
  const rawSport = toSingleValue(searchParams?.sport);
  const rawTab = toSingleValue(searchParams?.tab);

  const sportParam = parseSportParam(rawSport);
  const tabParam = parseSportParam(rawTab);

  if (sportParam === null) {
    if (tabParam) {
      redirectToLeaderboard(tabParam, country, clubId);
    }
    redirectToLeaderboard(undefined, country, clubId);
  }

  if (tabParam === null) {
    redirectToLeaderboard(sportParam ?? undefined, country, clubId);
  }

  if (sportParam && rawTab) {
    redirectToLeaderboard(sportParam, country, clubId);
  } else if (!sportParam && tabParam) {
    redirectToLeaderboard(tabParam, country, clubId);
  }

  const sport = sportParam ?? tabParam ?? ALL_SPORTS;

  return (
    <Leaderboard sport={sport} country={country} clubId={clubId} />
  );
}
