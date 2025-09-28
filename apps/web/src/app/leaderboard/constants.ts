export const ALL_SPORTS = "all" as const;
export const MASTER_SPORT = "master" as const;
export const SPORTS = [
  "padel",
  "padel_americano",
  "badminton",
  "table-tennis",
  "disc_golf",
] as const;

export const SPORT_OPTIONS = [ALL_SPORTS, MASTER_SPORT, ...SPORTS] as const;

export type LeaderboardSport = (typeof SPORT_OPTIONS)[number];

const SPORT_OPTION_SET = new Set<string>(SPORT_OPTIONS);

export function isLeaderboardSport(
  value: string | null | undefined,
): value is LeaderboardSport {
  if (value == null) return false;
  return SPORT_OPTION_SET.has(value);
}
