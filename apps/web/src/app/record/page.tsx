import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { recordPathForSport } from "../../lib/routes";
import {
  getImplementedRecordSportMetas,
  getRecordSportDisplayName,
  getRecordSportMetaById,
  getRecordSportMetaBySlug,
} from "../../lib/recording";

export const dynamic = "force-dynamic";

type Sport = { id: string; name: string };

export default async function RecordPage() {
  let sports: Sport[] = [];
  try {
    const res = await apiFetch("/v0/sports", { cache: "no-store" });
    if (res.ok) {
      sports = (await res.json()) as Sport[];
    }
  } catch {
    // ignore errors
  }

  const implementedSportsMap = sports.reduce<
    Map<string, Sport & { href: string }>
  >((acc, sport) => {
    const meta =
      getRecordSportMetaById(sport.id) ?? getRecordSportMetaBySlug(sport.id);

    if (!meta?.implemented) {
      return acc;
    }

    const href = meta.redirectPath ?? recordPathForSport(meta.id);

    acc.set(meta.id, { id: meta.id, name: sport.name, href });

    return acc;
  }, new Map());

  for (const meta of getImplementedRecordSportMetas()) {
    if (implementedSportsMap.has(meta.id)) {
      continue;
    }

    const href = meta.redirectPath ?? recordPathForSport(meta.id);

    implementedSportsMap.set(meta.id, {
      id: meta.id,
      name: getRecordSportDisplayName(meta),
      href,
    });
  }

  const implementedSports = Array.from(implementedSportsMap.values());

  return (
    <main className="container">
      <h1 className="heading">Record Match</h1>
      {implementedSports.length === 0 ? (
        <p className="text-gray-600">No sports found.</p>
      ) : (
        <ul className="sport-list">
          {implementedSports.map((s) => (
            <li key={s.id} className="sport-item">
              <Link href={s.href}>{s.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
