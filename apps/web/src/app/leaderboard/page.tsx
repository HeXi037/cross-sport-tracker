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
  const nextSport = sport ?? ALL_SPORTS;
  params.set("sport", nextSport);
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

  if (rawTab) {
    if (tabParam) {
      redirectToLeaderboard(tabParam, country, clubId);
    } else {
      redirectToLeaderboard(ALL_SPORTS, country, clubId);
    }
  }

  if (sportParam === null) {
    redirectToLeaderboard(ALL_SPORTS, country, clubId);
  }

  const sport = sportParam ?? ALL_SPORTS;

  return (
    <Leaderboard sport={sport} country={country} clubId={clubId} />
  );
}
