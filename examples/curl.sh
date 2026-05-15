#!/usr/bin/env bash
#
# Runnable curl examples covering every endpoint the server exposes.
# Start the server in another terminal first: `npm start`
#
# These examples assume AUTH_MODE=apikey and API_KEY=demo-key-change-me
# (the defaults in .env.example). For Basic Auth, replace the auth header
# with: -u demo:change-me

set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
AUTH=(-H "X-API-Key: demo-key-change-me")

say() { printf "\n\033[1m# %s\033[0m\n" "$*"; }

say "Connection test (no auth required)"
curl -sS "$BASE/health" | jq .

say "List records (default pagination)"
curl -sS "${AUTH[@]}" "$BASE/records" | jq .

say "Batch fetch by ids (primary polling pattern: DataSync re-fetches known records)"
curl -sS "${AUTH[@]}" "$BASE/records?ids=REQ-001,REQ-002" | jq .

say "Fetch a single record"
curl -sS "${AUTH[@]}" "$BASE/records/REQ-001" | jq .

say "Convenience: list records modified since a timestamp (not required by DataSync)"
SINCE=$(date -u -v-1d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "1 day ago" +"%Y-%m-%dT%H:%M:%SZ")
curl -sS "${AUTH[@]}" "$BASE/records?updatedSince=$SINCE" | jq .

say "Create a new record"
NEW_ID=$(curl -sS "${AUTH[@]}" -H "Content-Type: application/json" \
  -X POST "$BASE/records" \
  -d '{
    "externalReference": {
      "gogovId": "9001",
      "gogovDisplayId": "GG-9001",
      "gogovUrl": "https://gogov.example.com/cases/9001"
    },
    "fields": {
      "title": "Graffiti removal request",
      "status": "open",
      "priority": "low"
    }
  }' | tee /dev/stderr | jq -r .id)

say "Update the record we just created"
curl -sS "${AUTH[@]}" -H "Content-Type: application/json" \
  -X PUT "$BASE/records/$NEW_ID" \
  -d '{"fields": {"status": "in_progress"}}' | jq .

say "List comments on REQ-001 (note: response includes a 'visibility' field per item)"
curl -sS "${AUTH[@]}" "$BASE/records/REQ-001/comments" | jq .

say "Add a public comment"
curl -sS "${AUTH[@]}" -H "Content-Type: application/json" \
  -X POST "$BASE/records/REQ-001/comments" \
  -d '{
    "message": "Inspector confirmed the report on site.",
    "sender": {"name": "Sam Inspector", "email": "sam@partner.example.com"},
    "visibility": "public"
  }' | jq .

say "Add an internal (staff-only) comment"
curl -sS "${AUTH[@]}" -H "Content-Type: application/json" \
  -X POST "$BASE/records/REQ-001/comments" \
  -d '{
    "message": "Reminder: coordinate with traffic control before next visit.",
    "sender": {"name": "Sam Inspector", "email": "sam@partner.example.com"},
    "visibility": "internal"
  }' | jq .

say "List attachments on REQ-001"
curl -sS "${AUTH[@]}" "$BASE/records/REQ-001/attachments" | jq .

say "Register a new attachment"
curl -sS "${AUTH[@]}" -H "Content-Type: application/json" \
  -X POST "$BASE/records/REQ-001/attachments" \
  -d '{
    "name": "site-followup.jpg",
    "fileType": "image/jpeg",
    "size": 204800,
    "downloadUrl": "https://placehold.co/800x600.jpg"
  }' | jq .

say "Fetch attachment download URL"
curl -sS "${AUTH[@]}" "$BASE/records/REQ-001/attachments/ATT-1/download" | jq .

say "Field metadata (what GoGov uses to build its field-mapping UI)"
curl -sS "${AUTH[@]}" "$BASE/fields" | jq .

say "Auth failure example (no API key)"
curl -sS -w "\nHTTP %{http_code}\n" "$BASE/records" | head -20

say "Not-found example"
curl -sS -w "\nHTTP %{http_code}\n" "${AUTH[@]}" "$BASE/records/does-not-exist"
