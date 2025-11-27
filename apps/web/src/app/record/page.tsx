import Link from "next/link";
import { type CSSProperties } from "react";
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

type SportVisual = {
  icon: string;
  accent: string;
  accentDark?: string;
  description: string;
};

type RecordCardStyle = CSSProperties & {
  "--record-accent"?: string;
  "--record-accent-dark"?: string;
};

const sportVisuals: Record<string, SportVisual> = {
  badminton: {
    icon: "🏸",
    accent: "linear-gradient(135deg, #a5e6ff, #e3f2ff)",
    accentDark: "linear-gradient(135deg, #0d2e45, #11263a)",
    description: "Track shuttle rallies, sets, and decisive points in seconds.",
  },
  bowling: {
    icon: "🎳",
    accent: "linear-gradient(135deg, #ffe7b3, #ffd49a)",
    accentDark: "linear-gradient(135deg, #3b2a12, #22170b)",
    description: "Log frames, strikes, and spares to keep the leaderboard honest.",
  },
  disc_golf: {
    icon: "🥏",
    accent: "linear-gradient(135deg, #c0f0d3, #f0fff4)",
    accentDark: "linear-gradient(135deg, #103322, #0b2418)",
    description: "Capture every hole score with a layout built for the course.",
  },
  padel: {
    icon: "🎾",
    accent: "linear-gradient(135deg, #d9e2ff, #eef2ff)",
    accentDark: "linear-gradient(135deg, #1a2345, #121a32)",
    description: "Serve, volley, and record match momentum without missing a point.",
  },
  padel_americano: {
    icon: "🧮",
    accent: "linear-gradient(135deg, #ffe1e1, #fff5f5)",
    accentDark: "linear-gradient(135deg, #35121b, #220c14)",
    description: "Made for round-robin rotations and quick score updates.",
  },
  pickleball: {
    icon: "🥒",
    accent: "linear-gradient(135deg, #e1f7d5, #f7fff1)",
    accentDark: "linear-gradient(135deg, #15351c, #0f2615)",
    description: "Dial in rally scoring and side outs for every game you play.",
  },
  table_tennis: {
    icon: "🏓",
    accent: "linear-gradient(135deg, #ffe6f7, #fff0fb)",
    accentDark: "linear-gradient(135deg, #2e1631, #1b0f22)",
    description: "Perfect for fast rallies, deuce points, and multi-game matches.",
  },
};

export default async function RecordPage() {
  let sports: Sport[] = [];
  try {
    const res = await apiFetch("/v0/sports", {
      next: { revalidate: 60 },
    });
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

  const decoratedSports = implementedSports.map((sport) => {
    const visual = sportVisuals[sport.id] ?? {
      icon: "🏅",
      accent: "linear-gradient(135deg, #e5edff, #f4f7ff)",
      accentDark: "linear-gradient(135deg, #16284a, #0f172a)",
      description: "Capture scores, sets, and moments with a tailored form.",
    } satisfies SportVisual;

    const style: RecordCardStyle = {
      "--record-accent": visual.accent,
      "--record-accent-dark": visual.accentDark,
    };

    return {
      ...sport,
      ...visual,
      style,
    };
  });

  return (
    <main className="record-page">
      <section className="record-hero container">
        <p className="record-hero__kicker">Record faster</p>
        <div className="record-hero__content">
          <div className="record-hero__intro">
            <h1 className="record-hero__title">Record a match</h1>
            <p className="record-hero__subtitle">
              Pick your sport and start logging scores with the exact fields, sets,
              and summaries you need. Share results instantly or keep them as a
              personal streak.
            </p>
            <div className="record-hero__badges" aria-hidden>
              <span className="record-badge">Quick setup</span>
              <span className="record-badge">Live score-friendly</span>
              <span className="record-badge">Mobile ready</span>
            </div>
          </div>
          <div className="record-hero__card" role="presentation">
            <p className="record-hero__label">Available sports</p>
            <div className="record-hero__stat">
              {implementedSports.length}
              <span className="record-hero__stat-caption">ready to track</span>
            </div>
            <p className="record-hero__description">
              Each one comes with a tailored form so you can focus on the match,
              not the paperwork.
            </p>
          </div>
        </div>
      </section>

      <section className="container record-grid-section">
        <header className="record-grid-header">
          <div>
            <p className="record-hero__kicker">Choose your sport</p>
            <h2 className="record-grid-title">Beautiful scorecards in a tap</h2>
            <p className="record-grid-subtitle">
              From racquet sports to precision throws, select a sport to open a form
              tuned to its rules. Save matches, share highlights, and keep your
              streak alive.
            </p>
          </div>
          <div className="record-grid-pill" aria-hidden>
            <span className="record-grid-pill__icon">⚡</span>
            <div>
              <div className="record-grid-pill__title">Built for quick entry</div>
              <div className="record-grid-pill__caption">
                Tap, score, and publish without losing momentum.
              </div>
            </div>
          </div>
        </header>

        {decoratedSports.length === 0 ? (
          <p className="record-empty">No sports found.</p>
        ) : (
          <ul className="sport-list record-grid" role="list">
            {decoratedSports.map((sport) => (
              <li key={sport.id} className="sport-item">
                <Link
                  href={sport.href}
                  className="record-sport-card"
                  aria-label={sport.name}
                  style={sport.style}
                >
                  <span className="record-sport-icon" aria-hidden>
                    {sport.icon}
                  </span>
                  <div className="record-sport-content">
                    <div className="record-sport-heading">
                      <span className="record-sport-name">{sport.name}</span>
                      <span className="record-sport-arrow" aria-hidden>
                        →
                      </span>
                    </div>
                    <p className="record-sport-description">{sport.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
