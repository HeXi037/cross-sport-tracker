# Avatar fetch fails with `https://backend:8000` URL

When the web UI renders a user avatar, it builds the image URL with `apiUrl()` from `apps/web/src/lib/api.ts`. On the browser this helper reads the `NEXT_PUBLIC_API_BASE_URL` environment variable, falling back to `/api` when the value is not provided. This value is baked into the client bundle at build time.

If `NEXT_PUBLIC_API_BASE_URL` is set to `https://backend:8000/api` (or any other Docker-internal hostname), the generated `<img src>` will point at `https://backend:8000/api/static/users/...`. The hostname `backend` only exists inside the Docker compose network, so a real browser cannot resolve it. The request therefore fails before it reaches FastAPI, which is why you see the broken image request in the devtools network log.

Make sure that:

* `NEXT_PUBLIC_API_BASE_URL` is left at the default `/api` when the UI is served behind the same reverse proxy as the API, **or**
* you override it with a publicly reachable origin (e.g. `https://api.example.com/api`).

The server-side runtime still uses `INTERNAL_API_BASE_URL=http://backend:8000/api` to talk to the API, so no changes are needed there.
