import { apiFetch, type ApiRequestInit } from "./api";
import {
  getRecordSportDisplayName,
  getRecordSportMetaById,
} from "./recording";

export type Sport = { id: string; name: string };

const DEFAULT_SPORTS_CATALOG_REQUEST: ApiRequestInit = {
  next: { revalidate: 300 },
};

function buildSportsCatalogRequestInit(
  init?: ApiRequestInit
): ApiRequestInit {
  if (!init) {
    return {
      ...DEFAULT_SPORTS_CATALOG_REQUEST,
      next: { ...DEFAULT_SPORTS_CATALOG_REQUEST.next },
    };
  }

  const mergedNext = {
    ...(DEFAULT_SPORTS_CATALOG_REQUEST.next ?? {}),
    ...(init.next ?? {}),
  };

  return {
    ...DEFAULT_SPORTS_CATALOG_REQUEST,
    ...init,
    next: mergedNext,
  };
}

export async function fetchSportsCatalog(
  init?: ApiRequestInit
): Promise<Sport[]> {
  try {
    const requestInit = buildSportsCatalogRequestInit(init);
    const response = (await apiFetch(`/v0/sports`, requestInit)) as Response;
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

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const SPORT_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  badminton: "Badminton",
  bowling: "Bowling",
  disc_golf: "Disc Golf",
  padel: "Padel",
  padel_americano: "Padel Americano",
  pickleball: "Pickleball",
  table_tennis: "Table Tennis",
  tennis: "Tennis",
};

function gatherSportIdAliases(id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) {
    return [];
  }
  const canonical = canonicalizeSportId(trimmed);
  const hyphenated = canonical.replace(/_/g, "-");
  const lower = trimmed.toLowerCase();
  return Array.from(new Set([trimmed, lower, canonical, hyphenated])).filter(
    (alias): alias is string => Boolean(alias)
  );
}

export function canonicalizeSportId(id: string | null | undefined): string {
  if (!id) {
    return "";
  }
  return id.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

export function formatSportName(
  sportId: string | null | undefined,
  options?: { sportName?: string | null | undefined }
): string {
  const preferred = normalizeDisplayName(options?.sportName);
  if (preferred) {
    return preferred;
  }

  const canonical = canonicalizeSportId(sportId ?? "");
  if (!canonical) {
    return "—";
  }

  const override = SPORT_DISPLAY_NAME_OVERRIDES[canonical];
  if (override) {
    return override;
  }

  const meta = getRecordSportMetaById(canonical);
  if (meta) {
    return getRecordSportDisplayName(meta);
  }

  const raw = normalizeDisplayName(sportId);
  if (raw) {
    return titleizeFallback(raw);
  }

  return "—";
}

export function createSportDisplayNameLookup(sports: Sport[]): (
  sportId: string | null | undefined,
) => string {
  const map = new Map<string, string>();

  sports.forEach((sport) => {
    if (!sport || typeof sport.id !== "string") {
      return;
    }
    const aliases = gatherSportIdAliases(sport.id);
    if (!aliases.length) {
      return;
    }
    const preferred = normalizeDisplayName(sport.name);
    const resolved = preferred ?? formatSportName(sport.id);
    if (!resolved) {
      return;
    }
    aliases.forEach((alias) => {
      map.set(alias, resolved);
    });
  });

  return (sportId) => {
    const raw = normalizeDisplayName(sportId);
    if (!raw) {
      return "—";
    }

    const aliases = gatherSportIdAliases(raw);
    for (const alias of aliases) {
      const direct = map.get(alias);
      if (direct) {
        return direct;
      }
    }

    return formatSportName(raw);
  };
}
