# GOGov Integration Reference

## What this repo is

This repository is a working example, not a library. It implements every endpoint GOGov calls when it integrates with a partner system, backed by an in-memory store and three sample records. You can clone it, run it locally in under a minute, and use it as the spec for your real implementation. The mock is intentionally minimal - the code is short, has no clever abstractions, and is meant to be read top to bottom.

If you build an HTTP API that responds the same way this mock does, GOGov will be able to integrate with you.

## Who is GOGov, and why is GOGov calling your API?

GOGov is a citizen-request and case-management platform used by city and county governments to handle service requests, work orders, code enforcement cases, and similar records submitted by residents. Many of GOGov's customers already use another system (yours) to track those records in their day-to-day operations. GOGov's job is to keep both systems in sync.

To do that, GOGov calls your API on a regular schedule to pull updates and to push new or changed records. The contract in this repo is the contract every existing GOGov integration follows. Implement it and a GOGov-operated process can connect to your environment without any custom development on our side.

---

## The integration model

A few principles before any URL details - these are the most common source of confusion.

1. **GOGov calls you. You never call GOGov.** Your system does not need to know GOGov's URL, hold GOGov credentials, or open outbound connections. You only need to accept inbound HTTPS from GOGov.
2. **No webhooks.** GOGov polls your `GET /records?updatedSince=...` endpoint on a configurable schedule (every 15 minutes is typical) to discover what has changed since the last sync. If your timestamps are accurate, that's enough - you do not need to send anything to GOGov.
3. **GOGov both reads and writes.** It pulls changes from you (polling), and it pushes new and updated records to you (POST and PUT). Two-way sync is the default; one-way is a configuration choice on GOGov's side.
4. **Your record IDs are authoritative.** GOGov tracks its own ID for each record and an `externalReference` block tells you GOGov's ID for cross-linking, but once a record exists in your system, your ID is the one GOGov uses to read and update it.

The polling loop looks like this:

```
                  every N minutes
GOGov ─────────────────────────────────────► YOUR API
       1. GET /records?updatedSince=<last_run_iso>
                  ◄──── list of changed records ────
       2. For each changed record, optionally GET its
          comments and attachments to pull new ones.
                  ◄──── child collections ──────────
       3. When a GOGov user updates a record, GOGov calls
          PUT /records/:id to push the change to you.
                  ◄──── 200 OK with updated record ──
       4. When a GOGov user creates a new record, GOGov calls
          POST /records to push it to you.
                  ◄──── 201 Created with new record ─
```

---

## Quick start

You need [Node.js 20 or newer](https://nodejs.org/). To check, run `node --version`. If that prints `v20.x.x` or higher, you're set. If not, install Node first.

```bash
git clone <this-repo-url>
cd integration-doc-v1
npm install
cp .env.example .env
npm start
```

You should see output ending in:

```
{"level":30,"msg":"Server listening at http://0.0.0.0:3000"}
```

In another terminal, verify it's alive:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"success":true,"message":"Vendor API is reachable. Authentication is not checked on this endpoint."}
```

That's it. The server is now responding to every endpoint described below.

---

## Authentication

Your real implementation needs to authenticate every request from GOGov except the connection-test endpoints (`/` and `/health`). The mock supports two common patterns, switchable via the `AUTH_MODE` environment variable. Pick whichever you support in production and configure GOGov accordingly.

### Option A: API key in a header (`AUTH_MODE=apikey`)

GOGov sends a static credential in the `X-API-Key` header. Easiest to set up; rotate the key periodically.

```bash
curl -H "X-API-Key: demo-key-change-me" http://localhost:3000/records
```

### Option B: HTTP Basic Auth (`AUTH_MODE=basic`)

GOGov sends `Authorization: Basic <base64(user:pass)>`. Standard, widely supported, slightly more cumbersome to rotate.

```bash
curl -u demo:change-me http://localhost:3000/records
```

### Failure response

Missing or invalid credentials return `401`:

```json
{ "error": { "code": "unauthorized", "message": "Missing or invalid X-API-Key header." } }
```

### Production notes

- Always require TLS (HTTPS) in production. The mock listens on plain HTTP for local convenience only.
- Store credentials in a secrets manager, not in source control. The values in `.env.example` are placeholders.
- If your platform supports OAuth 2.0 client credentials or mutual TLS, talk to your GOGov contact - we can extend the integration to support it.

---

## Endpoint reference

Every endpoint returns JSON with `Content-Type: application/json`. List endpoints return `{ items: [...], total: N }`. Timestamps are ISO 8601 with a `Z` suffix, for example `2026-05-12T14:30:00Z`.

### `GET /health` and `GET /`

Connection test. **Not authenticated** - GOGov calls this when an administrator clicks "Test Connection" in our UI, before any credentials are configured.

**Response (200)**

```json
{
  "success": true,
  "message": "Vendor API is reachable.",
  "warnings": []
}
```

The `warnings` array is optional. Use it to surface non-fatal misconfigurations (e.g., "API version 1.2 is deprecated; please upgrade") that the administrator should see.

---

### `GET /records`

List records. Supports filtering by ID set, filtering by modification time (the primary mechanism GOGov uses for polling), and pagination.

**Query parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `ids` | comma-separated string | none | Return only records whose IDs appear in this list. Used for batch retrieval. |
| `updatedSince` | ISO 8601 timestamp | none | Return only records modified strictly after this time. This is how GOGov polls for changes. |
| `limit` | integer | 10 | Page size. Maximum 100. |
| `offset` | integer | 0 | Number of records to skip. |

**Example**

```bash
curl -H "X-API-Key: demo-key-change-me" \
  "http://localhost:3000/records?updatedSince=2026-05-11T00:00:00Z&limit=10"
```

**Response (200)**

```json
{
  "items": [
    {
      "id": "REQ-001",
      "displayId": "REQ-001",
      "updatedAt": "2026-05-12T12:30:00Z",
      "url": "https://vendor.example.com/records/REQ-001",
      "fields": { "title": "Pothole on Main Street", "status": "open", "priority": "high" }
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

---

### `GET /records/:id`

Fetch one record by its vendor ID.

```bash
curl -H "X-API-Key: demo-key-change-me" http://localhost:3000/records/REQ-001
```

Returns the full record (see [Data shapes](#data-shapes)) or `404` if not found.

---

### `POST /records`

Create a new record. GOGov calls this when a resident submits a new request through GOGov and the configured sync direction is "push."

**Request body**

```json
{
  "externalReference": {
    "gogovId": "9001",
    "gogovDisplayId": "GG-9001",
    "gogovUrl": "https://gogov.example.com/cases/9001"
  },
  "fields": {
    "title": "Graffiti removal request",
    "status": "open",
    "priority": "low",
    "description": "Tagging on the east wall of the library."
  }
}
```

The `externalReference` block is optional but recommended - it lets your operators click through to the originating record in GOGov.

**Response (201)** - the created record, including the ID your system assigned.

---

### `PUT /records/:id`

Update an existing record. Used when status changes, fields are edited, or sync direction is "push" for ongoing updates. Partial updates are supported - send only the fields you want to change.

```bash
curl -H "X-API-Key: demo-key-change-me" -H "Content-Type: application/json" \
  -X PUT http://localhost:3000/records/REQ-001 \
  -d '{"fields": {"status": "in_progress"}}'
```

**Response (200)** - the updated record. `updatedAt` must reflect the time of the update.

---

### `GET /records/:id/comments`

List comments on a record. Supports a `visibility` filter.

| Param | Values | Description |
|---|---|---|
| `visibility` | `public` or `internal` | Return only comments of this visibility. Omit to return all. |

```bash
curl -H "X-API-Key: demo-key-change-me" \
  "http://localhost:3000/records/REQ-001/comments?visibility=public"
```

**Response (200)**

```json
{
  "items": [
    {
      "id": "CMT-1",
      "message": "Crew has been dispatched.",
      "sender": { "name": "Alex Rivera", "email": "alex@vendor.example.com" },
      "dateSent": "2026-05-12T13:00:00Z",
      "visibility": "public"
    }
  ],
  "total": 1
}
```

GOGov, by default, only pulls public comments. The visibility filter exists so internal staff notes stay in your system and don't get exposed to residents through GOGov's portal.

---

### `POST /records/:id/comments`

Append a comment.

```json
{
  "message": "Resident confirmed via phone.",
  "sender": { "name": "Sam Inspector", "email": "sam@vendor.example.com" },
  "visibility": "public"
}
```

**Response (201)** - the created comment, including its assigned `id` and `dateSent`.

---

### `GET /records/:id/attachments`

List attachment metadata on a record. The mock does not store binary files; it stores metadata only. Your real implementation should do the same in this endpoint - return metadata, deliver bytes through `downloadUrl`.

**Response (200)**

```json
{
  "items": [
    {
      "id": "ATT-1",
      "name": "pothole-photo.jpg",
      "description": "Photo of the pothole submitted by the resident.",
      "fileType": "image/jpeg",
      "size": 482931,
      "dateUploaded": "2026-05-12T12:30:00Z",
      "downloadUrl": "https://placehold.co/600x400.jpg"
    }
  ],
  "total": 1
}
```

---

### `POST /records/:id/attachments`

Register an attachment on a record. GOGov sends the file's metadata along with a `downloadUrl` from which you can pull the file bytes if you store them. The mock does not pull anything; it just records the metadata.

```json
{
  "name": "site-followup.jpg",
  "description": "Follow-up photo from inspector.",
  "fileType": "image/jpeg",
  "size": 204800,
  "downloadUrl": "https://gogov.example.com/attachments/abc123"
}
```

**Response (201)** - the created attachment metadata.

---

### `GET /records/:id/attachments/:attachmentId/download`

Return the URL from which GOGov can fetch the file bytes. We use this two-step pattern (metadata GET, then download GET) so that you can keep file storage separate from your record API, and so download URLs can be short-lived signed URLs if needed.

**Response (200)**

```json
{ "downloadUrl": "https://placehold.co/600x400.jpg" }
```

---

### `GET /fields`

Return metadata describing the fields on your record schema. **This is the most important endpoint after the basic CRUD set.** GOGov uses the response to render a field-mapping UI that an administrator uses to connect your fields to GOGov's fields.

Without this endpoint, an administrator cannot finish configuring the integration on the GOGov side.

**Response (200)**

```json
{
  "items": [
    { "name": "title",       "type": "string", "syncDirection": "TwoWay",   "required": true },
    { "name": "status",      "type": "enum",   "syncDirection": "TwoWay",   "required": true,  "allowedValues": ["open","in_progress","closed"] },
    { "name": "priority",    "type": "enum",   "syncDirection": "Push",     "required": false, "allowedValues": ["low","medium","high"] },
    { "name": "description", "type": "string", "syncDirection": "TwoWay",   "required": false },
    { "name": "resolvedAt",  "type": "date",   "syncDirection": "Pull",     "required": false },
    { "name": "createdAt",   "type": "date",   "syncDirection": "PushOnce", "required": false }
  ],
  "total": 6
}
```

#### `syncDirection` semantics

| Value | Meaning |
|---|---|
| `TwoWay` | Changes flow in both directions. Updates on either side are propagated. |
| `Push` | GOGov sends this field to you on create and update. You do not send it back. |
| `PushOnce` | GOGov sends this field on the initial create only. Subsequent updates ignore it. Use for fields like `createdAt` where the original value should never be overwritten by GOGov. |
| `Pull` | You send this field to GOGov on every poll. GOGov does not write it back. Use for fields your system controls exclusively, like `resolvedAt`. |

#### Enums

For `type: "enum"`, include an `allowedValues` array. GOGov uses this to render dropdowns in the field-mapping UI so an administrator can map your values to GOGov's values (for example, mapping your `status: "in_progress"` to GOGov's `status: "Under Review"`).

#### Required vs optional

`required: true` means the field must be present on every record. GOGov treats this as a hard constraint when pushing new records to you - it will refuse to send records that don't have all required fields filled in.

---

## Data shapes

### Record

```json
{
  "id": "REQ-001",
  "displayId": "REQ-001",
  "updatedAt": "2026-05-12T12:30:00Z",
  "url": "https://vendor.example.com/records/REQ-001",
  "fields": { "...": "..." },
  "externalReference": {
    "gogovId": "9001",
    "gogovDisplayId": "GG-9001",
    "gogovUrl": "https://gogov.example.com/cases/9001"
  }
}
```

- **`id`** - your system's identifier for the record. String; format is your choice. Used in all subsequent URL paths.
- **`displayId`** - what a human sees in your UI (often the same as `id`, sometimes different - e.g. `id: "9f7a-..."`, `displayId: "REQ-2026-0042"`).
- **`updatedAt`** - last-modified timestamp, ISO 8601 with `Z`. Critical for polling; GOGov uses this to decide whether to re-sync the record.
- **`url`** - optional deep link back into your UI for this record. Surfaces as a "View in vendor system" link inside GOGov.
- **`fields`** - vendor-defined object whose keys correspond to the field names returned by `/fields`.
- **`externalReference`** - present only if the record originated in GOGov or has been linked to a GOGov record. You receive this on `POST` and `PUT`; you should persist it and echo it back on subsequent `GET`s.

### Comment

```json
{
  "id": "CMT-1",
  "message": "Crew has been dispatched.",
  "sender": { "name": "Alex Rivera", "email": "alex@vendor.example.com" },
  "dateSent": "2026-05-12T13:00:00Z",
  "visibility": "public"
}
```

- **`visibility`** - `"public"` or `"internal"`. Internal comments are typically excluded from sync by default.

### Attachment

```json
{
  "id": "ATT-1",
  "name": "pothole-photo.jpg",
  "description": "Photo submitted by the resident.",
  "fileType": "image/jpeg",
  "size": 482931,
  "dateUploaded": "2026-05-12T12:30:00Z",
  "downloadUrl": "https://placehold.co/600x400.jpg"
}
```

- **`fileType`** - MIME type, e.g. `image/jpeg`, `application/pdf`.
- **`size`** - bytes, integer.
- **`downloadUrl`** - where GOGov fetches the file bytes. Can be a signed short-lived URL.

### Field metadata

```json
{
  "name": "status",
  "type": "string | enum | date | number | boolean",
  "syncDirection": "TwoWay | Push | PushOnce | Pull",
  "required": true,
  "allowedValues": ["..."],
  "description": "Optional human-readable explanation, shown in the GOGov field-mapping UI."
}
```

### Error

Every error response - at any status - uses this shape:

```json
{ "error": { "code": "not_found", "message": "No record with id 'REQ-9999'.", "details": { } } }
```

`details` is optional. Use it for structured information that's useful for debugging (e.g., the offending field name on a validation error). HTTP status conveys category - see the [Error format](#error-format) table.

---

## Pagination

List endpoints (`GET /records`, `GET /records/:id/comments`, `GET /records/:id/attachments`) support `limit` and `offset` query parameters. Default `limit` is 10, maximum is 100. Default `offset` is 0. The response includes `total` so the caller knows when to stop paging.

```bash
curl -H "X-API-Key: ..." "http://localhost:3000/records?limit=25&offset=50"
```

---

## Rate limiting

Return `429 Too Many Requests` when a caller exceeds your acceptable request rate. Include a `Retry-After` header (seconds) so GOGov knows when to retry. The mock enforces a per-IP limit of `RATE_LIMIT_PER_MINUTE` (60 by default) requests per rolling minute.

```
HTTP/1.1 429 Too Many Requests
Retry-After: 37
Content-Type: application/json

{ "error": { "code": "rate_limited", "message": "Rate limit of 60 requests/minute exceeded." } }
```

GOGov respects `Retry-After` and will back off accordingly. If you advertise your rate limits up front to your GOGov contact, we'll configure our polling cadence to stay below them.

---

## Error format

| Status | When |
|---|---|
| `200 OK` | Successful read or update. |
| `201 Created` | Successful POST that created a new resource. |
| `400 Bad Request` | Malformed body, missing required field, invalid query parameter. |
| `401 Unauthorized` | Missing or invalid credentials. |
| `404 Not Found` | Record (or child record) does not exist. |
| `409 Conflict` | (Optional) Use for, e.g., duplicate creates. The mock does not currently emit this. |
| `429 Too Many Requests` | Rate limit exceeded. Include `Retry-After` header. |
| `500 Internal Server Error` | Unexpected error. |

All error bodies use the shape shown in [Data shapes / Error](#error). Do not return HTML error pages or status-code-only responses.

---

## Testing your implementation against GOGov's expectations

Before declaring your API ready for GOGov to connect, walk through this checklist against your real implementation. The same checks pass against this mock - you can compare behavior side by side.

### Functional checks

```bash
# Connection test
curl -s http://localhost:3000/health
# Expect: 200, body { success: true, ... }

# Single record fetch
curl -s -H "X-API-Key: demo-key-change-me" http://localhost:3000/records/REQ-001
# Expect: 200, body with id, displayId, updatedAt, fields

# Polling: list records changed in the last hour
SINCE=$(date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ")
curl -s -H "X-API-Key: demo-key-change-me" "http://localhost:3000/records?updatedSince=$SINCE"
# Expect: 200, body { items: [...], total: N }, only recent records

# Field metadata (powers GOGov field-mapping UI)
curl -s -H "X-API-Key: demo-key-change-me" http://localhost:3000/fields
# Expect: 200, body with at least { name, type, syncDirection, required } per field

# Create + read-back round-trip
ID=$(curl -s -H "X-API-Key: demo-key-change-me" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/records \
  -d '{"fields":{"title":"Round-trip test","status":"open"}}' | jq -r .id)
curl -s -H "X-API-Key: demo-key-change-me" "http://localhost:3000/records/$ID"
# Expect: 200, the record you just created
```

### Connection-test recipe

This is the exact sequence a GOGov administrator's "Test Connection" button runs:

```bash
# 1. Health (no auth)
curl -fsS http://localhost:3000/health > /dev/null

# 2. Auth check (any authenticated endpoint with a known-good record)
curl -fsS -H "X-API-Key: demo-key-change-me" http://localhost:3000/records?limit=1 > /dev/null

# 3. Field metadata (must return at least one field)
curl -fsS -H "X-API-Key: demo-key-change-me" http://localhost:3000/fields > /dev/null

echo "Connection test passed"
```

All three must succeed. If any fail, the administrator cannot finish configuring the integration.

### Checklist

- [ ] All timestamps are ISO 8601 with a `Z` suffix (UTC). No local time, no offsets like `+00:00`.
- [ ] Every record has an `updatedAt` field, and it changes whenever the record is mutated (including when comments or attachments are added).
- [ ] `GET /records?updatedSince=X` returns records strictly newer than `X`, not equal.
- [ ] Empty collections return `{ "items": [], "total": 0 }`, not `null` and not a `404`.
- [ ] Every error response uses the `{ error: { code, message } }` shape.
- [ ] `401` errors do not leak whether the username, the password, or both were wrong.
- [ ] `429` responses include a `Retry-After` header.
- [ ] `Content-Type: application/json` on every JSON response.
- [ ] `/health` and `/` succeed without authentication.
- [ ] `GET /fields` returns at least the fields you support; `allowedValues` is present for every enum.

---

## Configuration reference

Every environment variable the mock reads:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | TCP port the server listens on. |
| `AUTH_MODE` | `apikey` | `apikey` or `basic`. |
| `API_KEY` | (unset) | Required when `AUTH_MODE=apikey`. Compared against the `X-API-Key` header. |
| `BASIC_USER` | (unset) | Required when `AUTH_MODE=basic`. |
| `BASIC_PASS` | (unset) | Required when `AUTH_MODE=basic`. |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per-IP requests per minute before `429`. |

The server reads a `.env` file in the project root if one exists. Otherwise, set the variables in your shell. `cp .env.example .env` is the easiest starting point.

---

## What's NOT in this mock (and why)

- **No persistence.** Records, comments, and attachments live in process memory and are wiped on every restart. Your real implementation obviously needs a database. The mock skips this to keep the example small and dependency-free.
- **No file storage.** Attachments are metadata only; `downloadUrl` points to a static placeholder URL. Real implementations should serve actual file bytes (or signed URLs to object storage like S3) from the `downloadUrl`.
- **No webhook delivery to GOGov.** This isn't a limitation of the mock - it's a property of the integration model. GOGov polls; you do not push.
- **No retries or idempotency keys.** GOGov retries failed requests on its side, but the mock has no idempotency handling. Production implementations may want to deduplicate by `externalReference.gogovId`.
- **No TLS.** The mock listens on plain HTTP. Production deployments must use HTTPS.
- **No tests.** This is a reference implementation, not a library. The runnable curl recipes in `examples/curl.sh` double as a smoke-test suite.

---

## Optional / future extensions

These are not currently used by the standard GOGov integration but may be added per partnership:

- **Webhook push from vendor → GOGov** - for near-real-time sync without polling. Requires a callback URL and shared secret; talk to your GOGov contact.
- **Bulk write endpoints** (`POST /records/batch`) - useful if GOGov needs to push many records at once during an initial backfill. The polling-based read pattern already uses `GET /records?ids=...` for batch reads.
- **Additional child record types** - violations, code actions, fees, vehicles, additional addresses. The mock implements comments and attachments; richer entities follow the same nesting pattern (`GET /records/:id/<child>` and `POST /records/:id/<child>`).
- **Contact / citizen entity** - for integrations where GOGov needs to push citizen information separately from the record. Typically optional and configured per deployment.
- **OAuth 2.0 client credentials** - for partners with existing OAuth infrastructure. Replaces the API-key or Basic flow.

If any of these apply to your integration, contact your GOGov partner success lead - we can extend the contract collaboratively without requiring you to wait for a public release.

---

## License

MIT. See [LICENSE](LICENSE).
