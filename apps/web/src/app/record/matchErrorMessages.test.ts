import { describe, expect, it } from "vitest";
import type { ApiError } from "../../lib/api";
import {
  MATCH_ACTOR_NOT_PARTICIPANT_CODE,
  MATCH_ACTOR_NOT_PARTICIPANT_MESSAGE,
  resolveMatchActorError,
} from "./matchErrorMessages";

describe("resolveMatchActorError", () => {
  it("returns a friendly message when the actor is not a participant", () => {
    const err = new Error("forbidden") as ApiError;
    err.code = MATCH_ACTOR_NOT_PARTICIPANT_CODE;

    expect(resolveMatchActorError(err)).toBe(
      MATCH_ACTOR_NOT_PARTICIPANT_MESSAGE,
    );
  });

  it("returns null for unrelated errors", () => {
    const err = new Error("bad request") as ApiError;
    err.code = "match_invalid_participants";

    expect(resolveMatchActorError(err)).toBeNull();
    expect(resolveMatchActorError(new Error("network failure"))).toBeNull();
  });
});
