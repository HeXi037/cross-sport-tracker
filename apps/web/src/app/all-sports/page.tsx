import { redirect } from "next/navigation";

const toSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

type SearchParams = {
  country?: string | string[];
  clubId?: string | string[];
};

export default function AllSportsRedirect({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const country = toSingleValue(searchParams?.country);
  const clubId = toSingleValue(searchParams?.clubId);

  const params = new URLSearchParams({ tab: "all" });
  if (country) params.set("country", country);
  if (clubId) params.set("clubId", clubId);

  redirect(`/leaderboard?${params.toString()}`);
}
