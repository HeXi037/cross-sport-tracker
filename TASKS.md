# Testing follow-up tasks

The current Vitest run exposes a couple of actionable gaps. Capture them here so they can be prioritized and tracked to completion.

## pnpm test fails from the repository root
- [ ] Introduce a workspace manifest (for example, `pnpm-workspace.yaml`) or a root-level `package.json` so running `pnpm test -- --runInBand` at the repo root resolves the web app package instead of aborting with `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`.
- [ ] Alternatively, document that application-specific tests must be invoked from `apps/web/` until the workspace is wired up, and update any CI helpers that assume the root command works. (Choose one approach.)

## Bowling record page test missing score placeholders
- [ ] Audit `apps/web/src/app/record/[sport]/page.tsx` to confirm how bowling score inputs are labelled and decide whether the UI should expose placeholders, visible labels, or `aria-label`s for each score field.
- [ ] If the UI should surface labels, update the markup so every bowling score input has a reliable accessible name without depending on placeholder text that disappears on focus.
- [ ] Adjust `apps/web/src/app/record/[sport]/page.test.tsx` so the "allows recording multiple bowling players" spec queries the score fields via the new accessible names (for example, `getByLabelText`), rather than looking for `/score/i` placeholders that never render.
- [ ] Run `pnpm test -- --runInBand` from `apps/web/` to verify the suite passes once the bowling inputs and tests are aligned.
