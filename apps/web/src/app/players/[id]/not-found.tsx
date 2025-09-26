import Link from "next/link";

export default function PlayerNotFound(): JSX.Element {
  return (
    <main className="container">
      <h1 className="heading">Player not found</h1>
      <p className="mt-2 text-gray-700">
        We couldn&apos;t find the player you were looking for. They might have been
        removed or never existed.
      </p>
      <Link href="/players" className="mt-4 inline-block">
        Back to players
      </Link>
    </main>
  );
}
