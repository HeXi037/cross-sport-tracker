import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container">
      <section className="card">
        <h1 className="heading">Page not found</h1>
        <p>
          <Link href="/">Return home</Link>
        </p>
      </section>
    </main>
  );
}
