# Testing follow-up tasks

The current Vitest run exposes a couple of actionable gaps. Capture them here so they can be prioritized and tracked to completion.

## pnpm test fails from the repository root
- [x] Ensure the workspace manifest and root `package.json` route `pnpm test -- --runInBand` from the repo root to `@cst/web` without importer manifest errors.
- [x] Document the root-level test invocation so CI and contributors can rely on it instead of running tests from `apps/web/`.

## Bowling record page test missing score placeholders
- [ ] Audit `apps/web/src/app/record/[sport]/page.tsx` to confirm how bowling score inputs are labelled and decide whether the UI should expose placeholders, visible labels, or `aria-label`s for each score field.
- [ ] If the UI should surface labels, update the markup so every bowling score input has a reliable accessible name without depending on placeholder text that disappears on focus.
- [ ] Adjust `apps/web/src/app/record/[sport]/page.test.tsx` so the "allows recording multiple bowling players" spec queries the score fields via the new accessible names (for example, `getByLabelText`), rather than looking for `/score/i` placeholders that never render.
- [ ] Run `pnpm test -- --runInBand` from `apps/web/` to verify the suite passes once the bowling inputs and tests are aligned.
