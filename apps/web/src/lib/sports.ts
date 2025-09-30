import { apiFetch } from "./api";
import {
  getRecordSportDisplayName,
  getRecordSportMetaById,
} from "./recording";

export type Sport = { id: string; name: string };

export async function fetchSportsCatalog(): Promise<Sport[]> {
  try {
    const response = (await apiFetch(`/v0/sports`, {
      cache: "no-store",
    } as RequestInit)) as Response;
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as Sport[];
    if (!Array.isArray(data)) {
      return [];
    }
    return data.filter(
      (sport): sport is Sport =>
        Boolean(sport) && typeof sport.id === "string" && typeof sport.name === "string"
    );
  } catch (error) {
    console.warn("Unable to load sports catalog", error);
    return [];
  }
}

function titleizeFallback(id: string): string {
  const normalized = id.replace(/[_-]+/g, " ");
  return normalized.replace(/\b([a-z])/gi, (match) => match.toUpperCase());
}

export function createSportDisplayNameLookup(sports: Sport[]): (
  sportId: string | null | undefined,
) => string {
  const map = new Map<string, string>();
  sports.forEach((sport) => {
    if (!sport || typeof sport.id !== "string") {
      return;
    }
    const id = sport.id.trim();
    if (!id) {
      return;
    }
    const name = typeof sport.name === "string" && sport.name.trim();
    if (name) {
      map.set(id, name);
    }
  });

  return (sportId) => {
    if (!sportId) {
      return "—";
    }
    const normalized = sportId.trim();
    if (!normalized) {
      return "—";
    }
    const direct = map.get(normalized);
    if (direct) {
      return direct;
    }
    const meta = getRecordSportMetaById(normalized);
    if (meta) {
      return getRecordSportDisplayName(meta);
    }
    return titleizeFallback(normalized);
  };
}
