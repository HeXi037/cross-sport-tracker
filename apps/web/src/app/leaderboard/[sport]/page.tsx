import { redirect } from "next/navigation";
import { ALL_SPORTS, SPORTS } from "../leaderboard";

type LeaderboardSearchParams = {
  country?: string | string[];
  clubId?: string | string[];
};

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const isSupportedSport = (value: string) =>
  value === ALL_SPORTS || (SPORTS as readonly string[]).includes(value);

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

  if (!isSupportedSport(sport)) {
    const fallback = new URLSearchParams();
    if (country) fallback.set("country", country);
    if (clubId) fallback.set("clubId", clubId);
    const query = fallback.toString();
    redirect(query ? `/leaderboard?${query}` : "/leaderboard");
  }

  const paramsWithFilters = new URLSearchParams({ tab: sport });
  if (country) paramsWithFilters.set("country", country);
  if (clubId) paramsWithFilters.set("clubId", clubId);

  redirect(`/leaderboard?${paramsWithFilters.toString()}`);
}
