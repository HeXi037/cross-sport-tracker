cross-sport-tracker

Track scores, run tournaments, and (later) crown a Master of All across sports.
MVP scope: Padel + Bowling + Pickleball.
Stack: Next.js (UI) + FastAPI (Python 3.12 API) + PostgreSQL.
Hosting: Cheap, self-hosted on a single VPS via Docker Compose + nginx.

Environment Variables

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `JWT_SECRET` | Yes | High-entropy secret used to sign access tokens. Must be at least 32 random characters; never commit it to source control. | `JWT_SECRET=wJ9s3qYB0e1rT6pV9mX2zC5uA8fL4dH` |
| `ADMIN_SECRET` | When creating admins | Shared secret that must match the `X-Admin-Secret` header to create administrator accounts. Treat as sensitive and rotate if exposed. | `ADMIN_SECRET=admin-signup-secret-9f36` |
| `FLAGGED_IPS` | No | Comma-separated list of IPs that should receive a stricter signup rate limit (`1/hour` instead of `5/minute`). Leave blank to use the default rate limits. | `FLAGGED_IPS=203.0.113.42,198.51.100.7` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS allowlist for trusted frontends. Wildcards (`*`) are rejected; the API refuses to start unless a trusted origin is supplied. | `ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com` |
| `ALLOW_CREDENTIALS` | No (defaults to `true`) | Enables credentialed CORS requests. Combine with `ALLOWED_ORIGINS` to allow cookies/headers to flow to trusted domains. | `ALLOW_CREDENTIALS=true` |
| `DATABASE_URL` | Yes | SQLAlchemy database URL for Postgres (async driver recommended). Contains database credentials—handle securely. | `DATABASE_URL=postgresql+asyncpg://postgres:supersecret@db:5432/crosssport` |
| `REDIS_URL` | No (defaults to `redis://localhost:6379`) | Connection string for the Redis instance that backs WebSocket fan-out. Include credentials if your Redis deployment requires them. | `REDIS_URL=redis://cache:6379/0` |
| `API_PREFIX` | No (defaults to `/api`) | Base path mounted by the FastAPI application. Update if reverse-proxying the API under a different prefix. | `API_PREFIX=/api` |
| `SENTRY_DSN` | No | Sentry project DSN. When provided, the API initializes Sentry error and performance reporting. | `SENTRY_DSN=https://public@o0.ingest.sentry.io/0` |
| `SENTRY_ENVIRONMENT` | No | Environment label attached to Sentry events (e.g., `production`, `staging`). | `SENTRY_ENVIRONMENT=production` |
| `SENTRY_TRACES_SAMPLE_RATE` | No (defaults to `0.0`) | Fraction between 0.0 and 1.0 controlling how many requests to send as performance traces. | `SENTRY_TRACES_SAMPLE_RATE=0.25` |
| `SENTRY_PROFILES_SAMPLE_RATE` | No (defaults to `0.0`) | Fraction between 0.0 and 1.0 controlling how many traced requests also include profiling data. | `SENTRY_PROFILES_SAMPLE_RATE=0.1` |

> !!!Secrets such as `JWT_SECRET`, `ADMIN_SECRET`, and database credentials in `DATABASE_URL` should be stored in a secure secrets manager or environment configuration outside of version control!!!

### Verify Sentry setup

1. Set `SENTRY_DSN` (and optional environment/sample-rate variables) in your `.env`.
2. Start the API (`docker compose up backend` or `uvicorn backend.app.main:app`).
3. Trigger a test event:

   ```bash
   curl -X POST http://localhost:8000/api/sentry-test
   ```

   A successful setup returns JSON with an `eventId`; the event should appear in your Sentry project within a minute. If `SENTRY_DSN` is missing, the endpoint responds with HTTP 400.


Status & Scope

Monorepo: apps/web (Next.js) + backend (FastAPI) + packages/* (shared)

Implement now: Padel, Bowling, Tennis, Pickleball (DB → API → UI)

Later: Disc Golf, cross-sport normalization, PWA, OAuth, notifications

Project Decisions (locked for MVP)

Runtime: Python 3.12, Node 20, Postgres 16

IDs & pagination: ULID strings, cursor-based pagination

Auth: Credentials (username/password) for $0 email costs; magic-link later. JWT tokens require a high-entropy `JWT_SECRET` env var. Only bcrypt password hashes are supported; run migration `0007_rehash_sha256_passwords` and reset any flagged accounts before upgrading.

Multi-tenancy: Club-scoped (club_id on entities)

Event sourcing: Append-only score_event; compute summaries on read (optionally cache snapshot in match.metadata)

API: REST under /api/v0, Problem+JSON (RFC 7807) errors, OpenAPI docs at /docs

Realtime: WebSocket /api/v0/matches/{id}/stream (in-memory broadcast for MVP)

Scoring contract: init_state(config) → dict, apply(event, state) → dict, summary(state) → dict

Padel default config: { goldenPoint: false, tiebreakTo: 7, sets: 3 }

Bowling default config: { frames: 10, tenthFrameBonus: true }

Tennis default config: { tiebreakTo: 7, sets: 3 }

Pickleball default config: { pointsTo: 11, winBy: 2, bestOf: 3 }

Tournaments (MVP): Round-robin + Single-elimination; seeding=random; RR tiebreakers = H2H → differential → wins

Ratings: ELO baseline 1000; K=24 (K=32 if <30 games); per-sport rows

Timezone: Store UTC; render client TZ (default Australia/Melbourne). API accepts timezone-aware datetimes but stores them as UTC-naive

Testing targets: Engines ≥ 90% coverage; Playwright E2E for core flows

Deploy: Single VPS with Docker Compose; Caddy for HTTPS; nightly pg_dump backups

Monorepo Layout
apps/
  web/               # Next.js UI (App Router)
backend/
  app/               # FastAPI app (routers, models, scoring engines)
  alembic/           # DB migrations
packages/
  ui/                # (optional) shared UI components
  shared/            # (optional) shared types/utilities

MVP Features

Clubs, players, teams (doubles for padel), organizers

Mobile-first live scorekeeping with undo/redo

Event-sourced matches; match history; per-player stats

Sport leaderboards; CSV export

Tournaments: Round-robin & Single-elim (seeding=random or rating)

Padel (included)

Tennis-like sets/games; golden point toggle; 7-point tiebreak; WO/RET

Bowling (included)

10 frames; strikes/spares bonuses; full 10th-frame rules; game & series totals

Tennis (included)

Standard sets/games with tiebreaks; singles or doubles

Pickleball (included)

Rally-point scoring to 11 (win by 2); best-of-3 games

Data Model (abridged)

Sport(id, name) → "padel" | "bowling" | "tennis" | "pickleball"

RuleSet(id, sport_id, name, config JSON)

Club(id, name)

Player(id, name, club_id?)

Team(id, player_ids[]) (doubles/singles)

Tournament(id, sport_id, club_id?, name)

Stage(id, tournament_id, type) // "round_robin" | "single_elim"

Match(id, sport_id, stage_id?, ruleset_id?, best_of?, metadata JSON?)

MatchParticipant(id, match_id, side, player_ids[]) // side "A" | "B"

ScoreEvent(id, match_id, created_at, type, payload JSON) // append-only

Rating(id, player_id, sport_id, value)

Scoring engines (Python Protocol)

class Event(BaseModel):
    type: Literal["POINT","ROLL","UNDO"]
    by: Optional[Literal["A","B"]] = None
    pins: Optional[int] = None

def init_state(config: dict) -> dict: ...
def apply(event, state) -> dict: ...
def summary(state) -> dict: ...

API (v0)
GET  /api/v0/sports
GET  /api/v0/rulesets?sport=padel
POST /api/v0/players
GET  /api/v0/players?q=name
DELETE /api/v0/players/{id}  # admin, soft delete
POST /api/v0/players/{id}/badges/{badge_id}  # admin, award badge
DELETE /api/v0/players/{id}/badges/{badge_id}  # admin, remove badge
POST /api/v0/matches
POST /api/v0/matches/by-name
GET  /api/v0/matches/{id}
DELETE /api/v0/matches/{id}  # admin, soft delete
POST /api/v0/matches/{id}/events
POST /api/v0/matches/{id}/sets
GET  /api/v0/leaderboards?sport=padel
WS   /api/v0/matches/{id}/stream

Create an admin user

curl -X POST http://localhost:8000/api/v0/auth/signup \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Secret: <admin-secret>' \
  -d '{"username":"alice","password":"Str0ng!Pass!","is_admin":true}'

Example: create a Padel match

POST /api/v0/matches
{
  "sport": "padel",
  "rulesetId": "padel-default",
  "participants": [
    { "side": "A", "playerIds": ["p1","p2"] },
    { "side": "B", "playerIds": ["p3","p4"] }
  ],
  "bestOf": 3, // may be 1, 3, or 5
  "playedAt": "2024-06-01T10:00:00Z",
  "location": "Local Club"
}

### Player location data hygiene

The legacy `player.location` column accepts arbitrary free-form text. To assess
the existing values before running the structured location migration, use the
helper script to dump the distinct strings and their frequencies:

```bash
DATABASE_URL=postgresql://... \
  python backend/scripts/survey_player_locations.py
```

After the migration, an administrator can backfill or correct individual rows
with normalized ISO country codes and optional subdivision codes using:

```bash
DATABASE_URL=postgresql://... \
  python backend/scripts/set_player_location.py <player-id> \
    --country-code US --region-code CA --location "US-CA"
```

Run with `--dry-run` to preview the changes before committing them. Leaving a
flag empty (for example `--region-code ''`) clears that field while keeping the
three columns synchronized via the shared normalization helpers.

Append events

POST /api/v0/matches/m_123/events
{ "type": "POINT", "by": "A" }    // padel

POST /api/v0/matches/m_456/events
{ "type": "ROLL", "pins": 7 }     // bowling

Record completed padel sets

POST /api/v0/matches/m_123/sets
{ "sets": [[2,6],[6,4],[1,6]] }

Dev Quickstart (local)

Prereqs: Node 20, Python 3.12, Docker

# Postgres (local)
docker compose up -d postgres

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate

# Configure required environment variables (set these in every terminal
# that runs backend commands).
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crosssport
export JWT_SECRET=local-dev-secret-local-dev-secret
export ALLOWED_ORIGINS=http://localhost:3000

pip install -r requirements.txt
alembic upgrade head
python seed.py  # adds default sports, rulesets, demo club & test players
```

### Web
```bash
cd ../apps/web
npm install
```

### Run backend & frontend together
Start the API and UI in separate terminals:

**Terminal 1 - Backend**
```bash
cd backend
source .venv/bin/activate
# If this is a fresh shell, repeat the environment exports from above:
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crosssport
export JWT_SECRET=local-dev-secret-local-dev-secret
export ALLOWED_ORIGINS=http://localhost:3000

uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Web**
```bash
cd apps/web
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api npm run dev
```

