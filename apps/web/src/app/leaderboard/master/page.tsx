import { redirect } from "next/navigation";
import { MASTER_SPORT } from "../constants";

type LeaderboardSearchParams = {
  country?: string | string[];
  clubId?: string | string[];
};

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default function MasterLeaderboardPage({
  searchParams,
}: {
  searchParams?: LeaderboardSearchParams;
}) {
  const country = toSingleValue(searchParams?.country);
  const clubId = toSingleValue(searchParams?.clubId);
  const params = new URLSearchParams({ sport: MASTER_SPORT });
  if (country) params.set("country", country);
  if (clubId) params.set("clubId", clubId);
  redirect(`/leaderboard?${params.toString()}`);
}

