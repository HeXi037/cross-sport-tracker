# Contributing

## Node package manager

This repository uses **pnpm only** for JavaScript/TypeScript dependencies.

- Use `pnpm install --filter @cst/web --frozen-lockfile` to install frontend dependencies.
- Run web tests with `pnpm test -- --runInBand --watch=false` from the repository root.
- Run the Next.js app with `pnpm --filter @cst/web dev` (or `cd apps/web && pnpm run dev`).

Do **not** add or commit `package-lock.json` files. CI enforces this policy and will fail if such files are present.
