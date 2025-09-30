# Locale and Time Zone Defaults

The web client automatically derives sensible defaults for each visitor's locale
and preferred time zone so that dates, numbers, and notifications feel familiar
right away.

## Locale resolution

Locale detection takes the following sources into account (listed in priority
order):

1. A saved preference from the user settings store (if the user has updated
   their profile preferences previously).
2. The `Accept-Language` request header provided by the browser.
3. A neutral English fallback (`en-GB`) that guarantees consistent formatting
   when nothing else is available.

Whenever a locale preference is chosen for the first time it is persisted to
`localStorage` and mirrored into a cookie so that both the client and server can
render subsequent requests using the same language.

## Time zone resolution

Time zone selection follows a similar layered approach:

1. A saved preference from the user settings store.
2. The current time zone reported by the `LocaleProvider` (populated from the
   cookie or the browser's `Intl.DateTimeFormat().resolvedOptions()` result).
3. A best-effort detection using `detectTimeZone()` with the resolved locale,
   falling back to `UTC` when no other information is available.

When the profile page hydrates user preferences it seeds the `preferredTimeZone`
field using the detected value and persists it via `storeTimeZonePreference`.
This keeps the user's chosen time zone consistent across reloads and devices.

## Why it matters

Seeding locale and time zone preferences provides a better onboarding
experience—new players see match times in their local zone immediately and can
fine-tune preferences later if needed. The login and profile pages now explain
this behaviour so users know where the defaults come from and how to change
them.
