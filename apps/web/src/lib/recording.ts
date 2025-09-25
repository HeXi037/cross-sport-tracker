import { normalizeLocale } from "./i18n";

export type RecordSportForm = "dynamic" | "custom";

export interface RecordSportMeta {
  id: string;
  slug: string;
  form: RecordSportForm;
  implemented: boolean;
  redirectPath?: string;
}

const RECORD_SPORTS: Record<string, RecordSportMeta> = {
  bowling: {
    id: "bowling",
    slug: "bowling",
    form: "dynamic",
    implemented: true,
  },
  padel: {
    id: "padel",
    slug: "padel",
    form: "dynamic",
    implemented: true,
  },
  pickleball: {
    id: "pickleball",
    slug: "pickleball",
    form: "dynamic",
    implemented: true,
  },
  table_tennis: {
    id: "table_tennis",
    slug: "table-tennis",
    form: "dynamic",
    implemented: true,
  },
  disc_golf: {
    id: "disc_golf",
    slug: "disc-golf",
    form: "custom",
    implemented: true,
    redirectPath: "/record/disc-golf/",
  },
};

export function normalizeRecordSportSlug(slug: string): string {
  return slug.replace(/-/g, "_");
}

export function canonicalRecordSportSlug(id: string): string {
  const meta = RECORD_SPORTS[id];
  if (meta) {
    return meta.slug;
  }
  return id.replace(/_/g, "-");
}

export function getRecordSportMetaById(id: string): RecordSportMeta | null {
  return RECORD_SPORTS[id] ?? null;
}

export function getRecordSportMetaBySlug(slug: string): RecordSportMeta | null {
  const id = normalizeRecordSportSlug(slug);
  return getRecordSportMetaById(id);
}

export function isSportIdImplementedForRecording(id: string): boolean {
  const meta = getRecordSportMetaById(id);
  return Boolean(meta?.implemented);
}

export function isSportSlugImplementedForRecording(slug: string): boolean {
  const id = normalizeRecordSportSlug(slug);
  return isSportIdImplementedForRecording(id);
}

export function isSportHandledByDynamicRecordForm(id: string): boolean {
  const meta = getRecordSportMetaById(id);
  return Boolean(meta && meta.implemented && meta.form === "dynamic");
}

export function getImplementedRecordSportIds(): string[] {
  return Object.values(RECORD_SPORTS)
    .filter((meta) => meta.implemented)
    .map((meta) => meta.id);
}

export function buildComingSoonHref(
  slugOrId: string,
  existingQuery?: string | null,
): string {
  const slug = slugOrId.includes("-")
    ? slugOrId
    : canonicalRecordSportSlug(slugOrId);
  const params = new URLSearchParams(existingQuery ?? undefined);
  params.set("sport", slug);
  const query = params.toString();
  return query ? `/record/coming-soon?${query}` : "/record/coming-soon";
}

const RECORD_SPORT_HELP_TEXT: Record<string, Record<string, string>> = {
  bowling: {
    "en-AU":
      "Enter each roll for every frame. Use 0 for gutter balls, leave roll 2 blank after a strike, and only fill roll 3 in the tenth frame once you've earned it.",
    en:
      "Enter each roll for every frame. Use 0 for gutter balls, leave roll 2 blank after a strike, and only fill roll 3 in the tenth frame when you've earned it.",
  },
  padel: {
    "en-AU":
      "Record games won for each set and toggle Doubles when you have two players per side on court.",
    en:
      "Record games won for each set and toggle Doubles when two players per side are on the court.",
  },
  pickleball: {
    "en-AU":
      "Track rally-scoring games to 11 (win by 2). Toggle Doubles when you're playing pairs.",
    en:
      "Track rally-scoring games to 11 (win by 2). Toggle Doubles when each side has two players.",
  },
  table_tennis: {
    "en-AU":
      "Enter the games won by each player. Matches are usually best of five—adjust the scores if you used a different format.",
    en:
      "Enter the games won by each player. Matches are typically best of five—adjust the scores if you used a different format.",
  },
};

function resolveHelpTextLocale(
  locale: string,
  helpTextMap: Record<string, string>,
): string | undefined {
  const normalized = normalizeLocale(locale, "en");
  const lower = normalized.toLowerCase();
  const directMatch = Object.keys(helpTextMap).find(
    (key) => key.toLowerCase() === lower,
  );
  if (directMatch) {
    return directMatch;
  }

  const base = lower.split("-")[0];
  if (base) {
    const baseMatch = Object.keys(helpTextMap).find(
      (key) => key.toLowerCase() === base,
    );
    if (baseMatch) {
      return baseMatch;
    }
  }

  if (helpTextMap.en) {
    return "en";
  }

  return Object.keys(helpTextMap)[0];
}

export function getRecordSportHelpText(
  sportId: string,
  locale: string,
): string | null {
  const helpTextMap = RECORD_SPORT_HELP_TEXT[sportId];
  if (!helpTextMap) {
    return null;
  }

  const matchKey = resolveHelpTextLocale(locale, helpTextMap);
  if (!matchKey) {
    return null;
  }

  return helpTextMap[matchKey] ?? null;
}
