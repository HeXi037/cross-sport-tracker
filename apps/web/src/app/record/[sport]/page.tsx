import { redirect, notFound } from "next/navigation";
import RecordSportForm from "./RecordSportForm";
import {
  buildComingSoonHref,
  canonicalRecordSportSlug,
  getRecordSportMetaBySlug,
  isSportHandledByDynamicRecordForm,
} from "../../../lib/recording";
import { ensureTrailingSlash } from "../../../lib/routes";

interface RecordSportPageProps {
  params: { sport?: string | string[] };
  searchParams?: Record<string, string | string[] | undefined>;
}

type RouteResolution =
  | { type: "render"; sportId: string }
  | { type: "redirect"; destination: string }
  | { type: "not-found" };

function buildSearchString(
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  if (!searchParams) {
    return "";
  }
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          params.append(key, item);
        }
      }
    } else if (typeof value === "string") {
      params.append(key, value);
    }
  }
  return params.toString();
}

export function resolveRecordSportRoute({
  params,
  searchParams,
}: RecordSportPageProps): RouteResolution {
  const rawParam = params?.sport;
  const rawSport = typeof rawParam === "string" ? rawParam : "";
  if (!rawSport) {
    return { type: "not-found" };
  }

  const sportMeta = getRecordSportMetaBySlug(rawSport);
  if (!sportMeta) {
    return { type: "not-found" };
  }

  const search = buildSearchString(searchParams);

  if (!sportMeta.implemented) {
    return {
      type: "redirect",
      destination: buildComingSoonHref(sportMeta.slug, search),
    };
  }

  const canonicalSlug = canonicalRecordSportSlug(sportMeta.id);
  if (canonicalSlug !== rawSport) {
    const target = ensureTrailingSlash(`/record/${canonicalSlug}`);
    const destination = search ? `${target}?${search}` : target;
    return { type: "redirect", destination };
  }

  if (sportMeta.form === "custom") {
    const basePath = ensureTrailingSlash(
      sportMeta.redirectPath ?? `/record/${sportMeta.slug}`,
    );
    const destination = search
      ? basePath.includes("?")
        ? `${basePath}&${search}`
        : `${basePath}?${search}`
      : basePath;
    return { type: "redirect", destination };
  }

  if (!isSportHandledByDynamicRecordForm(sportMeta.id)) {
    return {
      type: "redirect",
      destination: buildComingSoonHref(sportMeta.slug, search),
    };
  }

  return { type: "render", sportId: sportMeta.id };
}

export default function RecordSportPage(props: RecordSportPageProps) {
  const resolution = resolveRecordSportRoute(props);
  if (resolution.type === "not-found") {
    notFound();
  }
  if (resolution.type === "redirect") {
    redirect(resolution.destination);
  }
  return <RecordSportForm sportId={resolution.sportId} />;
}
