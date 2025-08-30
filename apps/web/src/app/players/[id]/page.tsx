import Link from "next/link";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const res = await fetch(`${base}/v0/players/${params.id}`, { cache: "no-store" });
  const p: Player = await res.json();
  return (
    <main style={{ padding: 24 }}>
      <h1>{p.name}</h1>
      {p.club_id && <p>Club: {p.club_id}</p>}
      <Link href="/players">Back to players</Link>
    </main>
  );
}

