import type { ApiError } from "../../lib/api";

export const MATCH_ACTOR_NOT_PARTICIPANT_CODE = "match_actor_not_participant";
export const MATCH_ACTOR_NOT_PARTICIPANT_MESSAGE =
  "You need to add yourself as a player to save this match.";

export function resolveMatchActorError(err: unknown): string | null {
  const apiError = err instanceof Error ? (err as ApiError) : null;
  if (apiError?.code === MATCH_ACTOR_NOT_PARTICIPANT_CODE) {
    return MATCH_ACTOR_NOT_PARTICIPANT_MESSAGE;
  }
  return null;
}
