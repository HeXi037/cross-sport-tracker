import { describe, expect, it } from "vitest";
import type { PlayerInfo } from "../components/PlayerName";
import {
  resolveParticipantGroups,
  sanitizePlayerGroups,
  sanitizePlayersBySide,
} from "./participants";

describe("participants helpers", () => {
  it("removes empty player entries and sides", () => {
    const groups: Array<Array<PlayerInfo | null>> = [
      [
        { id: "1", name: " Alice " },
        { id: "2", name: "" },
        { id: "3", name: "Bob" },
      ],
      [],
      [
        { id: "4", name: "   " },
        { id: "5", name: "Carol" },
      ],
    ];

    const sanitized = sanitizePlayerGroups(groups);
    expect(sanitized).toEqual([
      [
        { id: "1", name: "Alice" },
        { id: "3", name: "Bob" },
      ],
      [{ id: "5", name: "Carol" }],
    ]);
  });

  it("drops empty sides in player maps", () => {
    const playersBySide = {
      A: [
        { id: "1", name: "Alice" },
        { id: "2", name: "" },
      ],
      B: [],
      C: [
        { id: "3", name: "   " },
        { id: "4", name: "Dave" },
      ],
    } satisfies Record<string, Array<PlayerInfo | null>>;

    const sanitized = sanitizePlayersBySide(playersBySide);
    expect(sanitized).toEqual({
      A: [{ id: "1", name: "Alice" }],
      C: [{ id: "4", name: "Dave" }],
    });
  });

  it("resolves participants and fills missing players", () => {
    const participants = [
      { playerIds: ["1", "missing", ""] },
      { playerIds: [] },
      { playerIds: ["3"] },
    ];
    const lookup = new Map<string, PlayerInfo>([
      ["1", { id: "1", name: "Alice" }],
      ["3", { id: "3", name: " Carol " }],
    ]);

    const groups = resolveParticipantGroups(participants, (id) =>
      lookup.get(id),
    );

    expect(groups).toEqual([
      [
        { id: "1", name: "Alice" },
        { id: "missing", name: "Unknown" },
      ],
      [{ id: "3", name: "Carol" }],
    ]);
  });
});
