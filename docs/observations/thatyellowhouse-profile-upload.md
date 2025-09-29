# That Yellow House Profile Photo Upload Traffic

Captured network calls while uploading a profile picture on `https://app.thatyellowhouse.org/profile/`.

## Upload Request

- **Endpoint:** `POST https://app.thatyellowhouse.org/api/v0/auth/me/photo`
- **Status:** `200 OK`
- **Notes:**
  - Uses `multipart/form-data` with a payload around 203 kB.
  - Requires bearer authentication; the captured token expires at Unix epoch `1759126128` (29 Sep 2025 05:28:48 GMT).
  - CORS allows credentials for the origin `https://app.thatyellowhouse.org`.
  - Response compressed with `zstd`.
  - Served through Cloudflare (`cf-ray: 9868ff286e7a2f49-MEL`).

### Request Headers

```
POST /api/v0/auth/me/photo HTTP/2
Host: app.thatyellowhouse.org
Accept: */*
Authorization: Bearer <redacted>
Cache-Control: no-cache
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryUHpV4cjCWBcwQGp3
Origin: https://app.thatyellowhouse.org
Referer: https://app.thatyellowhouse.org/profile/
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36
```

### Response Headers

```
HTTP/2 200 OK
access-control-allow-credentials: true
access-control-allow-origin: https://app.thatyellowhouse.org
cf-cache-status: DYNAMIC
cf-ray: 9868ff286e7a2f49-MEL
content-encoding: zstd
content-type: application/json
server: cloudflare
strict-transport-security: max-age=63072000; preload
```

## Follow-up Fetch

After the upload succeeded the client attempted to retrieve the stored image:

- **Endpoint:** `GET https://app.thatyellowhouse.org/api/static/users/fdfb0970585d4f0d9595788315f93aee.png?t=1759122864504`
- **Status:** `404 Not Found`
- **Notes:**
  - Static asset served via Next.js (`x-powered-by: Next.js`).
  - Cache allowed for up to 4 hours, but this request missed the cache (`cf-cache-status: MISS`).
  - Cloudflare edge identifier `cf-ray: 9868ff3049c32f49-MEL`.

### Request Headers

```
GET /api/static/users/fdfb0970585d4f0d9595788315f93aee.png?t=1759122864504 HTTP/2
Host: app.thatyellowhouse.org
Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8
Cache-Control: no-cache
Referer: https://app.thatyellowhouse.org/profile/
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36
```

### Response Headers

```
HTTP/2 404 Not Found
cache-control: max-age=14400
cf-cache-status: MISS
cf-ray: 9868ff3049c32f49-MEL
content-encoding: zstd
content-type: text/html; charset=utf-8
server: cloudflare
x-powered-by: Next.js
```

## Observed Behaviour

1. The API confirms receipt of the profile photo, but the subsequent static asset fetch returns 404, preventing the UI from displaying the uploaded image.
2. Given the cache directives and Cloudflare edge IDs, the missing asset appears to be absent from the backing storage rather than served from cache.
3. Investigating the upload pipeline (storage path generation, background jobs, CDN propagation) is recommended to ensure the file is persisted and exposed under `/api/static/users/`.
