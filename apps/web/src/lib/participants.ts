import { PlayerInfo } from "../components/PlayerName";

function sanitizePlayer(
  player: PlayerInfo | null | undefined
): PlayerInfo | null {
  if (!player) {
    return null;
  }

  const name = typeof player.name === "string" ? player.name.trim() : "";
  if (!name) {
    return null;
  }

  if (name === player.name) {
    return player;
  }

  return { ...player, name };
}

function sanitizePlayerGroup(
  group: Array<PlayerInfo | null | undefined> | null | undefined
): PlayerInfo[] {
  if (!group) {
    return [];
  }

  const sanitized: PlayerInfo[] = [];
  for (const entry of group) {
    const player = sanitizePlayer(entry ?? null);
    if (player) {
      sanitized.push(player);
    }
  }
  return sanitized;
}

export function sanitizePlayerGroups(
  groups: Array<Array<PlayerInfo | null | undefined> | null | undefined>
): PlayerInfo[][] {
  const sanitized: PlayerInfo[][] = [];
  for (const group of groups) {
    const players = sanitizePlayerGroup(group);
    if (players.length) {
      sanitized.push(players);
    }
  }
  return sanitized;
}

export function sanitizePlayersBySide(
  playersBySide: Record<
    string,
    Array<PlayerInfo | null | undefined> | null | undefined
  >
): Record<string, PlayerInfo[]> {
  const entries = Object.entries(playersBySide).flatMap(([side, players]) => {
    const sanitized = sanitizePlayerGroup(players);
    return sanitized.length ? ([[side, sanitized] as const]) : [];
  });
  return Object.fromEntries(entries);
}

type ParticipantLike = {
  playerIds?: Array<string | null | undefined> | null;
};

export function resolveParticipantGroups(
  participants: Array<ParticipantLike | null | undefined> | null | undefined,
  resolvePlayer: (id: string) => PlayerInfo | undefined
): PlayerInfo[][] {
  if (!participants?.length) {
    return [];
  }

  const groups = participants.map((participant) => {
    if (!participant) {
      return [];
    }
    const ids = participant.playerIds ?? [];
    return ids.map((rawId) => {
      if (!rawId) {
        return null;
      }
      const id = String(rawId);
      return resolvePlayer(id) ?? { id, name: "Unknown" };
    });
  });

  return sanitizePlayerGroups(groups);
}

export { sanitizePlayerGroup as sanitizePlayerList };
