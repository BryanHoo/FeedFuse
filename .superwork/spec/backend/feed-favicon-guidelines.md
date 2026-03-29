# Feed Favicon Guidelines

> Executable contracts for RSS feed favicon discovery, caching, and serving.

---

## Overview

FeedFuse serves RSS favicons through an internal route instead of persisting a
third-party favicon URL.

Current favicon building blocks:

- route: `GET /api/feeds/:id/favicon`
- cache table: `feed_favicons`
- route-backed feed icon value: `/api/feeds/:id/favicon`
- discovery logic: parse site HTML for icon links, then fall back to
  `/favicon.ico`
- cache semantics:
  - successful fetches persist binary content in PostgreSQL
  - failed fetches persist a negative cache window to avoid repeated outbound
    requests

This contract applies only to RSS feeds. `ai_digest` feeds do not participate in
favicon discovery.

---

## Scenario: RSS Feed Favicon Cache

### 1. Scope / Trigger

- Trigger: changes to `src/app/api/feeds/[id]/favicon/route.ts`
- Trigger: changes to `src/server/services/feedFaviconService.ts`
- Trigger: changes to `src/server/repositories/feedFaviconsRepo.ts`
- Trigger: changes to `src/server/rss/discoverFeedFavicon.ts`
- Trigger: schema changes affecting `feed_favicons` or `feeds.icon_url`

### 2. Signatures

HTTP route:

- `GET /api/feeds/:id/favicon`

Server functions:

- `buildFeedFaviconPath(feedId: string)`
- `discoverFeedFavicon(siteUrl: string)`
- `getOrFetchFeedFavicon(pool, feedId)`
- `getFeedFaviconCache(db, feedId)`
- `upsertFeedFaviconCache(db, input)`
- `upsertFeedFaviconFailure(db, input)`
- `deleteFeedFaviconCache(db, feedId)`

Database contract:

- table: `feed_favicons`
- primary key: `feed_id bigint references feeds(id) on delete cascade`
- columns:
  - `fetch_status text not null default 'ready'`
  - `source_url text null`
  - `content_type text null`
  - `body bytea null`
  - `etag text null`
  - `last_modified text null`
  - `failure_reason text null`
  - `next_retry_at timestamptz null`
  - `fetched_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- migration:
  - `src/server/db/migrations/0027_feed_favicons.sql`

Feed contract:

- RSS feeds with a non-empty `siteUrl` must persist
  `iconUrl = /api/feeds/:id/favicon`
- clearing `siteUrl` must clear `iconUrl`
- changing `siteUrl` must delete any existing row in `feed_favicons`

### 3. Contracts

`GET /api/feeds/:id/favicon`

- params:
  - `id: numeric feed id`
- precondition:
  - request must pass `requireApiSession()`
- success behavior:
  - status `200`
  - returns cached favicon bytes
  - headers include:
    - `content-type`
    - `content-length`
    - `cache-control: private, no-cache`
    - `etag` when available
    - `last-modified` when available
- conditional request behavior:
  - if `If-None-Match` matches current `etag`, return `304`
  - if `If-Modified-Since` matches current `last-modified`, return `304`
- failure behavior:
  - invalid id -> `400`
  - feed missing, non-RSS, no `siteUrl`, or discovery unavailable -> `404`

Discovery contract:

- first try HTML discovery via `<link rel="icon">`, `<link rel="shortcut icon">`,
  or similar icon rel tokens
- resolve relative and protocol-relative icon URLs against the final HTML URL
- if HTML discovery yields nothing usable, try `<origin>/favicon.ico`
- only accept successful `2xx` responses with `image/*` content types
- max favicon response size must stay bounded

Negative cache contract:

- when discovery fails, write `fetch_status = 'failed'`
- write `failure_reason = 'favicon_not_found'`
- write `next_retry_at = now + retry_window`
- while `now < next_retry_at`, the service must return `null` without issuing a
  new outbound request

### 4. Validation & Error Matrix

| Surface | Condition | Result | Notes |
|--------|-----------|--------|-------|
| `GET /api/feeds/:id/favicon` | `id` is non-numeric | `400` | reject bad route params |
| `GET /api/feeds/:id/favicon` | feed missing or not `rss` | `404` | no favicon contract for non-RSS |
| `GET /api/feeds/:id/favicon` | `siteUrl` missing/empty | `404` | no discovery target |
| `GET /api/feeds/:id/favicon` | cache hit with matching `etag` | `304` | must still send cache headers |
| `GET /api/feeds/:id/favicon` | discovery failed and retry window still open | `404` | no outbound retry |
| discovery | upstream returns non-image content | ignore candidate | continue fallback chain |
| discovery | upstream returns `4xx/5xx` | ignore candidate | continue fallback chain |

### 5. Good / Base / Bad Cases

Good:

- first request for an RSS feed with `siteUrl` discovers a favicon, stores the
  bytes in `feed_favicons`, and returns `200`
- later requests reuse cached bytes and avoid outbound favicon fetches
- updating a feed `siteUrl` deletes the old cache row and makes the internal
  route serve the new site favicon after revalidation

Base:

- browser requests must always revalidate via `cache-control: private, no-cache`
- a cached `failed` row suppresses new outbound requests until `next_retry_at`
- internal favicon paths such as `/api/feeds/:id/favicon` must not be rewritten
  through the media image proxy

Bad:

- persisting Google S2 or any other third-party favicon URL into `feeds.icon_url`
- using a long browser `max-age` that keeps stale favicons after `siteUrl`
  changes
- retrying failed favicon discovery on every request
- serving `ai_digest` feed icons through the RSS favicon discovery flow

### 6. Tests Required

Route coverage:

- `src/app/api/feeds/[id]/favicon/route.test.ts`
  - assert invalid ids return `400`
  - assert unresolved favicon returns `404`
  - assert successful fetch returns bytes plus cache headers
  - assert conditional requests return `304`

Service coverage:

- `src/server/services/feedFaviconService.test.ts`
  - assert ready cache returns without rediscovery
  - assert cold cache stores discovered favicon bytes
  - assert failed cache entries suppress retries before `next_retry_at`
  - assert discovery failure writes a negative cache row

RSS discovery coverage:

- `src/server/rss/discoverFeedFavicon.test.ts`
  - assert icon links resolve correctly
  - assert `/favicon.ico` fallback works
  - assert candidate fallback order stays stable

Lifecycle coverage:

- `src/server/services/feedCategoryLifecycleService.test.ts`
  - assert create sets internal favicon route for RSS feeds with `siteUrl`
  - assert `siteUrl` changes clear cached favicon rows

Migration coverage:

- `src/server/db/migrations/feedFaviconsMigration.test.ts`
  - assert `feed_favicons` schema exists
  - assert status / retry columns exist
  - assert RSS `icon_url` backfill points to the internal favicon route
