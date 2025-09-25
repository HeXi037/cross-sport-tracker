import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { recordPathForSport } from "../../lib/routes";
import { isSportIdImplementedForRecording } from "../../lib/recording";

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

  const implementedSports = sports.filter((s) =>
    isSportIdImplementedForRecording(s.id),
  );

  return (
    <main className="container">
      <h1 className="heading">Record Match</h1>
      {implementedSports.length === 0 ? (
        <p className="text-gray-600">No sports found.</p>
      ) : (
        <ul className="sport-list">
          {implementedSports.map((s) => (
            <li key={s.id} className="sport-item">
              <Link href={recordPathForSport(s.id)}>{s.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
