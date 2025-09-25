import Link from "next/link";

function formatSportName(slug: string): string {
  if (!slug) {
    return "This sport";
  }
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface ComingSoonPageProps {
  searchParams?: { sport?: string };
}

export default function RecordComingSoonPage({
  searchParams,
}: ComingSoonPageProps) {
  const slug = typeof searchParams?.sport === "string" ? searchParams.sport : "";
  const sportName = formatSportName(slug);

  return (
    <main className="container">
      <h1 className="heading">Recording coming soon</h1>
      <p>
        {sportName} recording isn&apos;t available yet. Check back later or let us
        know if you&apos;d like to help build it.
      </p>
      <p>
        <Link className="button-secondary" href="/record">
          Back to sport list
        </Link>
      </p>
    </main>
  );
}
