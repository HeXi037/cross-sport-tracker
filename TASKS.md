# Testing follow-up tasks

The current Vitest run exposes a couple of actionable gaps. Capture them here so they can be prioritized and tracked to completion.

## pnpm test fails from the repository root
- [ ] Introduce a workspace manifest (for example, `pnpm-workspace.yaml`) or a root-level `package.json` so running `pnpm test -- --runInBand` at the repo root resolves the web app package instead of aborting with `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`.
- [ ] Alternatively, document that application-specific tests must be invoked from `apps/web/` until the workspace is wired up, and update any CI helpers that assume the root command works. (Choose one approach.)

## Bowling record page test missing score placeholders
- [ ] Update the bowling score inputs (or their test queries) so the "allows recording multiple bowling players" spec can find the score fields without relying on placeholder text that is not rendered today.
- [ ] When the fields are discoverable again, re-run `pnpm test -- --runInBand` inside `apps/web/` to confirm the suite returns to green.
