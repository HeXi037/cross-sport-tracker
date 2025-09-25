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

export function buildComingSoonHref(slugOrId: string): string {
  const slug = slugOrId.includes("-")
    ? slugOrId
    : canonicalRecordSportSlug(slugOrId);
  const params = new URLSearchParams({ sport: slug });
  return `/record/coming-soon?${params.toString()}`;
}
