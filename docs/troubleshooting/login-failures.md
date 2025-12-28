# Login requests fail in the browser

If users cannot log in even though the API is healthy, check the deployment configuration. Three common misconfigurations block `/v0/auth/login` and `/v0/auth/signup` from completing.

## 1) `NEXT_PUBLIC_API_BASE_URL` points at an internal hostname

The web bundle bakes the value of `NEXT_PUBLIC_API_BASE_URL` at build time (see `apiUrl()` in `apps/web/src/lib/api.ts`). When the value is set to an internal hostname such as `https://backend:8000/api`, browser requests resolve to `https://backend:8000/api/v0/auth/login` — a host that only exists inside Docker. The browser cannot reach it, so auth calls never hit FastAPI.

Fix: leave `NEXT_PUBLIC_API_BASE_URL` at the default `/api` when the UI and API sit behind the same reverse proxy. If the API lives on a different domain, set it to a publicly reachable origin such as `https://api.example.com/api` and rebuild the frontend so the new value is bundled.

## 2) `ALLOWED_ORIGINS` omits the deployed hostname

The backend’s CORS middleware rejects requests whose `Origin` header is not in `ALLOWED_ORIGINS`. If the UI is deployed at `https://app.example.com` but the allowlist contains `https://example.com` (or any other mismatch), the preflight for `/v0/auth/login` fails and the browser blocks the request.

Fix: set `ALLOWED_ORIGINS` to the exact scheme and host of the frontend (for example, `https://app.example.com`) and keep `ALLOW_CREDENTIALS=true` so cookies can flow.

## 3) Serving the UI over HTTP while cookies are `Secure`

Auth cookies (`access_token`, `refresh_token`, `csrf_token`) are marked `Secure` by default because `AUTH_COOKIE_SECURE` defaults to `true`. Browsers only store `Secure` cookies on HTTPS responses, so logging in over HTTP makes the login appear to fail even when the API returns a token payload.

Fix: access the site over HTTPS (recommended). Only disable `AUTH_COOKIE_SECURE` for local development when the site is intentionally served over HTTP.

## Quick remediation checklist

*  `NEXT_PUBLIC_API_BASE_URL` is `/api` or a publicly resolvable origin; rebuild the frontend after updating.
*  `ALLOWED_ORIGINS` includes the exact frontend origin (scheme + host), with `ALLOW_CREDENTIALS=true`.
*  The site is served over HTTPS, or `AUTH_COOKIE_SECURE=false` is set locally for HTTP-only testing.
