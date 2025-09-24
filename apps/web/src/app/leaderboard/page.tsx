import { redirect } from "next/navigation";
import Leaderboard, { ALL_SPORTS, SPORTS } from "./leaderboard";

type LeaderboardSearchParams = {
  country?: string | string[];
  clubId?: string | string[];
  tab?: string | string[];
  sport?: string | string[];
};

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const resolveTab = (raw?: string) => {
  if (!raw) return ALL_SPORTS;
  if (raw === "master" || raw === ALL_SPORTS) return raw;
  if ((SPORTS as readonly string[]).includes(raw)) return raw;
  return null;
};

const buildFilterQuery = (country?: string, clubId?: string) => {
  const params = new URLSearchParams();
  if (country) params.set("country", country);
  if (clubId) params.set("clubId", clubId);
  const query = params.toString();
  return query ? `?${query}` : "";
};

export default function LeaderboardIndexPage({
  searchParams,
}: {
  searchParams?: LeaderboardSearchParams;
}) {
  const country = toSingleValue(searchParams?.country);
  const clubId = toSingleValue(searchParams?.clubId);
  const rawTab =
    toSingleValue(searchParams?.tab) ?? toSingleValue(searchParams?.sport);
  const tab = resolveTab(rawTab ?? undefined);

  if (rawTab && !tab) {
    const filterQuery = buildFilterQuery(country, clubId);
    redirect(`/leaderboard${filterQuery}`);
  }

  return (
    <Leaderboard
      sport={tab ?? ALL_SPORTS}
      country={country}
      clubId={clubId}
    />
  );
}
