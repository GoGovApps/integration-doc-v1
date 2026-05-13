# GoGov DataSync - Partner API Reference

_The HTTP contract your API needs to implement so GoGov can talk to you. Not a GoGov simulator; the spec for what you build._

## What this repo is

A runnable HTTP API showing the exact contract GoGov's DataSync calls when it integrates with a partner system. If you build an API whose behavior matches this one, GoGov can integrate with you without any custom code on our side.

## What this repo is NOT

- It is NOT a GoGov-hosted service.
- It is NOT a simulator of GoGov's DataSync code.
- It is NOT a library to depend on. You implement your own API in whatever language and framework you already use.

## Mental model

```
  ┌────────────────────────┐         ┌───────────────────────────────┐
  │ GoGov DataSync         │  HTTPS  │ Your real API                 │
  │ (runs on GoGov infra)  │ ──────► │ (you build, in your stack)    │
  └────────────────────────┘         └───────────────────────────────┘
                                                  ▲
                                                  │ shape must match
                                                  │
                                     ┌───────────────────────────────┐
                                     │ This mock (this repo)         │
                                     │ Reference behavior to copy    │
                                     └───────────────────────────────┘
```

You run this mock locally to see exactly what shapes, status codes, query params, and edge cases GoGov expects. You then build the real thing in your own codebase, against your real database.

## How to use this repo

1. Clone and `npm start` to bring the mock up (see [Quick start](#quick-start)).
2. Read the [Endpoint reference](#endpoint-reference) end-to-end. It is short.
3. Implement the **Required** endpoints in your stack, mirroring this mock's shapes and status codes.
4. Optionally implement comments and attachments if you want those synced.
5. Share your base URL and credentials with your GoGov contact. GoGov runs the Test Connection flow against your real API.

## Who is GoGov, and why is GoGov calling your API?

GoGov is a citizen-request and case-management platform used by city and county governments to handle service requests, work orders, code enforcement cases, and similar records submitted by residents. Many of GoGov's customers already use another system (yours) to track those records in their day-to-day operations. GoGov's job is to keep both systems in sync.

To do that, GoGov calls your API to pull updates and to push new or changed records. The contract in this repo is the contract every existing GoGov integration follows. Implement it and a GoGov-operated process can connect to your environment without any custom development on our side.

---

## The integration model

A few principles before any URL details. These are the most common source of confusion.

1. **GoGov calls you. You never have to call GoGov, except optionally to trigger an immediate pull (see below).** Your system does not need to know GoGov's URL or hold GoGov credentials for normal operation. You accept inbound HTTPS from GoGov, and that is enough.
2. **Sync flows in two directions, by two different mechanisms.**
   - **GoGov to partner is near-real-time push, standard for every integration.** When a GoGov user edits a synced record, GoGov immediately calls your `POST /records` or `PUT /records/:id`. There is no schedule. There is no configuration switch to turn this off; it is how DataSync works.
   - **Partner to GoGov is poll-driven.** GoGov polls your `GET /records?updatedSince=...` on a configurable cadence (every 15 minutes is typical) to discover what has changed on your side. You do not have to push anything back. If you want GoGov to pull a change immediately instead of waiting for the next poll, you can optionally call a GoGov-hosted webhook (see [Triggering an immediate pull from your side](#triggering-an-immediate-pull-from-your-side-optional)).
3. **Your record IDs are authoritative.** GoGov tracks its own ID for each record, and an `externalReference` block tells you GoGov's ID for cross-linking. Once a record exists in your system, your ID is the one GoGov uses to read and update it.

The full picture:

```
GoGov-side                                          Partner-side
─────────                                           ────────────

  on edit in GoGov         ── HTTPS push ──►   POST /records
  (after-update worker)                        PUT  /records/:id
        ▲                                            │
        │ retry up to 3x with                        │ 2xx
        │ exponential backoff                        │
        └────────────────────────────────────────────┘

  scheduler (every N min) ── HTTPS poll ──►   GET /records?updatedSince=...
                                              GET /records/:id/comments     (if configured)
                                              GET /records/:id/attachments  (if configured)
        ▲
        │ optional accelerator: partner calls
        │ POST /core/webhooks/data-sync/:hash?ids=...
        │ on their own change events; GoGov enqueues an immediate pull.
```

### Near-real-time push from GoGov to you (standard)

Every DataSync integration uses this. When a GoGov user edits a synced record, GoGov immediately enqueues a job that calls your `POST /records` or `PUT /records/:id`. You do not opt in.

Operational notes for your implementation:

- These calls can arrive at any time, not only on a fixed schedule. Design your handler to accept bursts.
- Pushes are per-record, not batched. Several rapid edits to one record can collapse into one push; edits to different records arrive independently.
- A transient 5xx or timeout response triggers retry with exponential backoff (up to 3 attempts on the GoGov side). After retries are exhausted, GoGov logs the failure and moves on; the next push or scheduled poll picks the record up again.
- Make `POST /records` idempotent on `externalReference.gogovId` so a retry after a partial success does not create duplicate records.

### Triggering an immediate pull from your side (optional)

If your system can emit an event when a record changes and you want GoGov to pull the change immediately instead of waiting for the next scheduled poll, call:

```
POST https://<gogov-host>/core/webhooks/data-sync/<hash>?ids=<id1>,<id2>,...
```

| Part | Notes |
|---|---|
| `<gogov-host>` | The host of the GoGov environment the integration is configured against. Your GoGov contact provides it. |
| `<hash>` | A UUID GoGov generates when the integration is provisioned. Treat it as a shared secret; it IS the authentication (no other credentials are checked). |
| `ids` | Comma-separated list of YOUR record IDs. Required. At least 1, at most 100 per call. |

GoGov enqueues a pull for each ID. Each pull calls your `GET /records/:id` (and, if configured, child collections) and writes the result into GoGov.

**Response (200)**

```json
{
  "message": "Successfully queued all records",
  "errors": {}
}
```

If some IDs are unknown to GoGov, de-synced, or refer to disabled records, the call still succeeds but `errors` will be populated as `{ "<external-id>": "<reason>" }` and only the valid IDs get queued. If none of the IDs are valid, the response is `400` with the same `errors` map.

This endpoint is optional. If you never call it, GoGov still picks up your changes via polling, just on the poll cadence.

---

## Quick start

You need [Node.js 20 or newer](https://nodejs.org/). To check, run `node --version`. If that prints `v20.x.x` or higher, you are set. If not, install Node first.

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

In another terminal, verify it is alive:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"success":true,"message":"Partner API is reachable. Authentication is not checked on this endpoint."}
```

That is it. The server is now responding to every endpoint described below.

---

## Authentication

Your real implementation needs to authenticate every request from GoGov except the connection-test endpoints (`/` and `/health`). The mock supports two common patterns, switchable via the `AUTH_MODE` environment variable. Pick whichever you support in production and configure GoGov accordingly.

### Option A: API key in a header (`AUTH_MODE=apikey`)

GoGov sends a static credential in the `X-API-Key` header. Easiest to set up; rotate the key periodically.

```bash
curl -H "X-API-Key: demo-key-change-me" http://localhost:3000/records
```

### Option B: HTTP Basic Auth (`AUTH_MODE=basic`)

GoGov sends `Authorization: Basic <base64(user:pass)>`. Standard, widely supported, slightly more cumbersome to rotate.

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
- If your platform supports OAuth 2.0 client credentials or mutual TLS, talk to your GoGov contact. We can extend the integration to support it.

---

## Endpoint reference

Every endpoint returns JSON with `Content-Type: application/json`. List endpoints return `{ items: [...], total: N }`. Timestamps are ISO 8601 with a `Z` suffix, for example `2026-05-12T14:30:00Z`.

### Which endpoints must you implement?

| Endpoint                                   | Status   | Notes |
|--------------------------------------------|----------|-------|
| `GET /health` (or `GET /`)                 | Required | No auth. Used by Test Connection. |
| `GET /records`                             | Required | Powers polling via `updatedSince`. |
| `GET /records/:id`                         | Required | Used by inbound webhook + on-demand reads. |
| `POST /records`                            | Required | GoGov creates records in your system. |
| `PUT /records/:id`                         | Required | GoGov updates records in your system. |
| `GET /fields`                              | Required | Powers the field-mapping UI; setup fails without it. |
| `GET /records/:id/comments`                | Optional | Implement only if you want to sync comments. |
| `POST /records/:id/comments`               | Optional | Pairs with the GET above. |
| `GET /records/:id/attachments`             | Optional | Implement only if you want to sync attachments. |
| `POST /records/:id/attachments`            | Optional | Pairs with the GET above. |
| `GET /records/:id/attachments/:aid/download` | Optional | Required only if you implement attachments. |

Comments and attachments are configured per-integration on the GoGov side. If you do not implement them, the administrator simply leaves those capabilities off; everything else continues to work.

---

### `GET /health` and `GET /`

**Status:** Required

Connection test. **Not authenticated.** GoGov calls this when an administrator clicks "Test Connection" in our UI, before any credentials are configured.

**Response (200)**

```json
{
  "success": true,
  "message": "Partner API is reachable.",
  "warnings": []
}
```

The `warnings` array is optional. Use it to surface non-fatal misconfigurations (e.g., "API version 1.2 is deprecated; please upgrade") that the administrator should see.

---

### `GET /records`

**Status:** Required

List records. Supports filtering by ID set, filtering by modification time (the primary mechanism GoGov uses for polling), and pagination.

**Query parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `ids` | comma-separated string | none | Return only records whose IDs appear in this list. Used for batch retrieval. |
| `updatedSince` | ISO 8601 timestamp | none | Return only records modified strictly after this time. This is how GoGov polls for changes. |
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
      "url": "https://partner.example.com/records/REQ-001",
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

**Status:** Required

Fetch one record by its partner-side ID.

```bash
curl -H "X-API-Key: demo-key-change-me" http://localhost:3000/records/REQ-001
```

Returns the full record (see [Data shapes](#data-shapes)) or `404` if not found.

---

### `POST /records`

**Status:** Required

Create a new record. GoGov calls this when a resident submits a new request through GoGov and the configured sync direction is "push." This call may arrive in near-real time after the in-GoGov create, or on a slower cadence. Make it idempotent on `externalReference.gogovId` so retries do not duplicate records.

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

The `externalReference` block is optional but recommended. It lets your operators click through to the originating record in GoGov.

**Response (201)** is the created record, including the ID your system assigned.

---

### `PUT /records/:id`

**Status:** Required

Update an existing record. GoGov calls this whenever a synced record is edited in GoGov. Partial updates are supported; send only the fields you want to change.

```bash
curl -H "X-API-Key: demo-key-change-me" -H "Content-Type: application/json" \
  -X PUT http://localhost:3000/records/REQ-001 \
  -d '{"fields": {"status": "in_progress"}}'
```

**Response (200)** is the updated record. `updatedAt` must reflect the time of the update.

---

### `GET /records/:id/comments`

**Status:** Optional

List comments on a record. Return only comments that are public to residents. If your system has internal-only or staff-only comments, filter them out before responding. GoGov never asks for non-public comments, and the comments returned here surface to residents through GoGov's portal.

```bash
curl -H "X-API-Key: demo-key-change-me" \
  "http://localhost:3000/records/REQ-001/comments"
```

**Response (200)**

```json
{
  "items": [
    {
      "id": "CMT-1",
      "message": "Crew has been dispatched.",
      "sender": { "name": "Alex Rivera", "email": "alex@partner.example.com" },
      "dateSent": "2026-05-12T13:00:00Z"
    }
  ],
  "total": 1
}
```

---

### `POST /records/:id/comments`

**Status:** Optional

Append a comment. GoGov only sends comments that are intended to be public, so you can treat every comment received here as public.

```json
{
  "message": "Resident confirmed via phone.",
  "sender": { "name": "Sam Inspector", "email": "sam@partner.example.com" }
}
```

**Response (201)** is the created comment, including its assigned `id` and `dateSent`.

---

### `GET /records/:id/attachments`

**Status:** Optional

List attachment metadata on a record. The mock does not store binary files; it stores metadata only. Your real implementation should do the same in this endpoint: return metadata, deliver bytes through `downloadUrl`.

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

**Status:** Optional

Register an attachment on a record. GoGov sends the file's metadata along with a `downloadUrl` from which you can pull the file bytes if you store them. The mock does not pull anything; it just records the metadata.

```json
{
  "name": "site-followup.jpg",
  "description": "Follow-up photo from inspector.",
  "fileType": "image/jpeg",
  "size": 204800,
  "downloadUrl": "https://gogov.example.com/attachments/abc123"
}
```

**Response (201)** is the created attachment metadata.

---

### `GET /records/:id/attachments/:attachmentId/download`

**Status:** Optional (required only if you implement attachments)

Return the URL from which GoGov can fetch the file bytes. We use this two-step pattern (metadata GET, then download GET) so that you can keep file storage separate from your record API, and so download URLs can be short-lived signed URLs if needed.

**Response (200)**

```json
{ "downloadUrl": "https://placehold.co/600x400.jpg" }
```

---

### `GET /fields`

**Status:** Required

Return metadata describing the fields on your record schema. **This is the most important endpoint after the basic CRUD set.** GoGov uses the response to render a field-mapping UI that an administrator uses to connect your fields to GoGov's fields.

Without this endpoint, an administrator cannot finish configuring the integration on the GoGov side.

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

`syncDirection` tells GoGov which side is allowed to **write** the field. It is a property of the field, not of the integration as a whole.

| Value | Who writes the field | When | Example |
|---|---|---|---|
| `TwoWay` | Both sides | Either side can update on create or update; changes flow in whichever direction they originated. | `status`, `description` |
| `Push` | GoGov only | GoGov sends the value on create and update; your system stores it but never sends it back. | `priority` set by GoGov triage |
| `PushOnce` | GoGov only, first time | GoGov sends the value on the initial create. Your system preserves it; subsequent updates from GoGov are ignored for this field. | `createdAt` |
| `Pull` | Your system only | Your system sends the value to GoGov on every poll. GoGov never writes it back. | `resolvedAt` driven by your workflow |

**How to choose.** If you are not sure: start with `TwoWay` for editable text and enum fields, `Pull` for timestamps your system controls, and `PushOnce` for fields you want to record once and never overwrite.

#### Enums

For `type: "enum"`, include an `allowedValues` array. GoGov uses this to render dropdowns in the field-mapping UI so an administrator can map your values to GoGov's values (for example, mapping your `status: "in_progress"` to GoGov's `status: "Under Review"`).

#### Required vs optional fields

`required: true` means the field must be present on every record. GoGov treats this as a hard constraint when pushing new records to you: it will refuse to send records that do not have all required fields filled in.

---

## Data shapes

### Record

```json
{
  "id": "REQ-001",
  "displayId": "REQ-001",
  "updatedAt": "2026-05-12T12:30:00Z",
  "url": "https://partner.example.com/records/REQ-001",
  "fields": { "...": "..." },
  "externalReference": {
    "gogovId": "9001",
    "gogovDisplayId": "GG-9001",
    "gogovUrl": "https://gogov.example.com/cases/9001"
  }
}
```

- **`id`** is your system's identifier for the record. String; format is your choice. Used in all subsequent URL paths.
- **`displayId`** is what a human sees in your UI (often the same as `id`, sometimes different, e.g. `id: "9f7a-..."`, `displayId: "REQ-2026-0042"`).
- **`updatedAt`** is the last-modified timestamp, ISO 8601 with `Z`. Critical for polling; GoGov uses this to decide whether to re-sync the record.
- **`url`** is an optional deep link back into your UI for this record. Surfaces as a "View in partner system" link inside GoGov.
- **`fields`** is a partner-defined object whose keys correspond to the field names returned by `/fields`.
- **`externalReference`** is present only if the record originated in GoGov or has been linked to a GoGov record. You receive this on `POST` and `PUT`; you should persist it and echo it back on subsequent `GET`s.

### Comment

```json
{
  "id": "CMT-1",
  "message": "Crew has been dispatched.",
  "sender": { "name": "Alex Rivera", "email": "alex@partner.example.com" },
  "dateSent": "2026-05-12T13:00:00Z"
}
```

All comments are public. Do not include internal/staff-only notes; filter them out on your side before responding.

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

- **`fileType`** is the MIME type, e.g. `image/jpeg`, `application/pdf`.
- **`size`** is in bytes, integer.
- **`downloadUrl`** is where GoGov fetches the file bytes. Can be a signed short-lived URL.

### Field metadata

```json
{
  "name": "status",
  "type": "string | enum | date | number | boolean",
  "syncDirection": "TwoWay | Push | PushOnce | Pull",
  "required": true,
  "allowedValues": ["..."],
  "description": "Optional human-readable explanation, shown in the GoGov field-mapping UI."
}
```

### Error

Every error response, at any status, uses this shape:

```json
{ "error": { "code": "not_found", "message": "No record with id 'REQ-9999'.", "details": { } } }
```

`details` is optional. Use it for structured information that is useful for debugging (e.g., the offending field name on a validation error). HTTP status conveys category; see the [Error format](#error-format) table.

---

## Pagination

List endpoints (`GET /records`, `GET /records/:id/comments`, `GET /records/:id/attachments`) support `limit` and `offset` query parameters. Default `limit` is 10, maximum is 100. Default `offset` is 0. The response includes `total` so the caller knows when to stop paging.

```bash
curl -H "X-API-Key: ..." "http://localhost:3000/records?limit=25&offset=50"
```

---

## Rate limiting

Return `429 Too Many Requests` when a caller exceeds your acceptable request rate. Include a `Retry-After` header (seconds) so GoGov knows when to retry. The mock enforces a per-IP limit of `RATE_LIMIT_PER_MINUTE` (60 by default) requests per rolling minute.

```
HTTP/1.1 429 Too Many Requests
Retry-After: 37
Content-Type: application/json

{ "error": { "code": "rate_limited", "message": "Rate limit of 60 requests/minute exceeded." } }
```

GoGov respects `Retry-After` and will back off accordingly. If you advertise your rate limits up front to your GoGov contact, we will configure our polling cadence to stay below them.

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

## Testing your implementation against GoGov's expectations

Before declaring your API ready for GoGov to connect, walk through this checklist against your real implementation. The same checks pass against this mock; you can compare behavior side by side.

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

# Field metadata (powers GoGov field-mapping UI)
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

This is the exact sequence a GoGov administrator's "Test Connection" button runs:

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
- [ ] `POST /records` is idempotent on `externalReference.gogovId`. Retried pushes do not create duplicates.
- [ ] `GET /records/:id/comments` returns only public comments. No internal/staff-only notes.
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
- **No GoGov side.** This mock implements only the partner side of the contract. The GoGov-hosted inbound webhook (`POST /core/webhooks/data-sync/:hash`) and the near-real-time push originator both live on GoGov infrastructure; you call them and receive calls from them, respectively, but you do not run them.
- **No retries or idempotency keys.** GoGov retries failed pushes on its side (up to 3 attempts with exponential backoff), but the mock has no idempotency handling. Production implementations should deduplicate by `externalReference.gogovId`.
- **No TLS.** The mock listens on plain HTTP. Production deployments must use HTTPS.
- **No tests.** This is a reference implementation, not a library. The runnable curl recipes in `examples/curl.sh` double as a smoke-test suite.

---

## Optional / future extensions

These are not part of the standard contract but may be added per partnership:

- **Bulk write endpoints** (`POST /records/batch`) for cases where GoGov needs to push many records at once during an initial backfill. The polling-based read pattern already uses `GET /records?ids=...` for batch reads.
- **Additional child record types** (violations, code actions, fees, vehicles, additional addresses). The mock implements comments and attachments; richer entities follow the same nesting pattern (`GET /records/:id/<child>` and `POST /records/:id/<child>`).
- **Contact / citizen entity** for integrations where GoGov needs to push citizen information separately from the record. Typically optional and configured per deployment.
- **OAuth 2.0 client credentials** for partners with existing OAuth infrastructure. Replaces the API-key or Basic flow.

If any of these apply to your integration, contact your GoGov partner success lead. We can extend the contract collaboratively without requiring you to wait for a public release.

---

## License

MIT. See [LICENSE](LICENSE).
