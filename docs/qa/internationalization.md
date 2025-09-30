# Internationalization smoke test

Use these manual checks after deploying to verify the locale wiring is functioning:

1. Load the home page in a clean browser session. Confirm that copy renders in English and that the skip link, navigation, home hero, and matches list use localized strings.
2. In the same session, open the browser console and set the preferred locale via `localStorage.setItem('cst:locale', 'es-ES')`, then refresh. Validate that navigation links, home sections, and the matches index use Spanish translations and that formatted dates adopt the Spanish locale.
3. With the console still open, set an unsupported locale such as `localStorage.setItem('cst:locale', 'fr-CA')` and refresh. Verify that the UI falls back to English strings without errors and that dates continue to render in a supported locale.
4. Navigate to the `/matches` page under both English and Spanish preferences. Ensure that list headings, metadata (Friendly, Best of, etc.), empty-state copy, and error prompts are localized appropriately.
