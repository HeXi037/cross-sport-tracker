import Link from "next/link";
import { apiFetch } from "../../lib/api";

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

  return (
    <main className="container">
      <h1 className="heading">Record Match</h1>
      {sports.length === 0 ? (
        <p className="text-gray-600">No sports found.</p>
      ) : (
        <ul className="sport-list">
          {sports.map((s) => (
            <li key={s.id} className="sport-item">
              <Link href={`/record/${s.id.replace('_', '-')}`}>{s.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
