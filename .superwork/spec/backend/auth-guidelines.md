# Auth Guidelines

> Executable contracts for the single-user password authentication flow.

---

## Overview

FeedFuse uses a single-user authentication model backed by one row in
`app_settings`.

Current auth building blocks:

- initial bootstrap password comes from `AUTH_INITIAL_PASSWORD`
- persisted password hash lives in `app_settings.auth_password_hash`
- session signing secret lives in `app_settings.auth_session_secret`
- authenticated requests carry the `feedfuse_session` HttpOnly cookie

Password precedence is explicit:

1. if `auth_password_hash` is non-empty, verify against the stored hash
2. otherwise verify against `AUTH_INITIAL_PASSWORD`
3. if both are missing, auth endpoints must fail with service unavailable

---

## Scenario: Single-User Password Auth

### 1. Scope / Trigger

- Trigger: route changes touching `/api/auth/*`, `/api/settings/auth/*`,
  `src/server/auth/*`, or `app_settings` auth columns
- Trigger: login UX that depends on backend auth response or cookie behavior
- Trigger: Docker or deployment changes that must provide
  `AUTH_INITIAL_PASSWORD`

### 2. Signatures

HTTP routes:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/settings/auth/password`

Server functions:

- `verifyPasswordAgainstAuthConfig(password: string)`
- `requireApiSession()`
- `createSessionCookieHeader(secret?: string)`
- `createSessionToken({ secret, nowMs?, maxAgeSeconds? })`
- `verifySessionToken({ token, secret, nowMs? })`
- `serializeSessionCookie(token, maxAgeSeconds?)`
- `serializeExpiredSessionCookie()`
- `hashPassword(password: string)`
- `verifyPassword(password: string, storedHash: string)`
- `verifyPlainPassword(password: string, expectedPassword: string)`
- `getAuthSettings(pool)`
- `updateAuthPassword(pool, authPasswordHash)`

Database contract:

- table: `app_settings`
- columns:
  - `auth_password_hash text not null default ''`
  - `auth_session_secret text not null default encode(gen_random_bytes(32), 'hex')`
- migration:
  - `src/server/db/migrations/0026_app_settings_auth.sql`

Environment contract:

- `AUTH_INITIAL_PASSWORD`
- empty or whitespace-only values are normalized to `undefined` in
  `src/server/env.ts`

Cookie contract:

- name: `feedfuse_session`
- max age: `60 * 60 * 24 * 30`
- attributes:
  - `Path=/`
  - `HttpOnly`
  - `SameSite=Lax`
  - `Secure` only in production

### 3. Contracts

`POST /api/auth/login`

- request body:
  - `password: string`
- success response:
  - status `200`
  - body:
    ```json
    { "ok": true, "data": { "authenticated": true } }
    ```
  - header:
    - `set-cookie: feedfuse_session=...`
- failure behavior:
  - invalid body -> `ValidationError`
  - wrong password -> `UnauthorizedError`
  - missing env bootstrap password and no DB hash -> `ServiceUnavailableError`

`POST /api/auth/logout`

- request body: none
- success response:
  - status `200`
  - body:
    ```json
    { "ok": true, "data": { "authenticated": false } }
    ```
  - header:
    - `set-cookie: feedfuse_session=; ...; Max-Age=0`

`POST /api/settings/auth/password`

- request body:
  - `currentPassword: string`
  - `nextPassword: string`
- precondition:
  - request must pass `requireApiSession()`
- validation:
  - `currentPassword` must be non-empty after trim
  - `nextPassword` must be at least 8 chars after trim
  - `nextPassword !== currentPassword`
- success response:
  - status `200`
  - body:
    ```json
    { "ok": true, "data": { "updated": true } }
    ```
  - side effects:
    - hash `nextPassword` with scrypt
    - write new `auth_password_hash`
    - rotate `auth_session_secret`
    - return a fresh `feedfuse_session` cookie signed with the rotated secret

Session verification contract:

- `feedfuse_session` value format is `<base64url-json>.<base64url-hmac>`
- payload fields:
  - `iat: number`
  - `exp: number`
- signature algorithm:
  - `HMAC-SHA256`
- verification order:
  1. split payload and signature
  2. recompute HMAC using `auth_session_secret`
  3. reject mismatched signature
  4. decode payload JSON
  5. reject expired token

Guard contract:

- `requireApiSession()` returns `null` for authenticated requests
- `requireApiSession()` returns `fail(new UnauthorizedError(...))` when the
  cookie is missing, invalid, or stale
- `requireApiSession()` returns `fail(new ServiceUnavailableError(...))` when
  no stored password hash exists and `AUTH_INITIAL_PASSWORD` is absent
- test-only bypass:
  - bypass session guard when `NODE_ENV === 'test'` or `VITEST === 'true'`
  - do not rely on this bypass for auth contract coverage; add dedicated auth
    tests instead

### 4. Validation & Error Matrix

| Route | Condition | Status | Error Code | Notes |
|------|-----------|--------|------------|-------|
| `POST /api/auth/login` | missing or empty `password` | `400` | `validation_error` | field error on `password` |
| `POST /api/auth/login` | wrong password | `401` | `unauthorized` | do not reveal whether DB hash or env password was used |
| `POST /api/auth/login` | no DB hash and no `AUTH_INITIAL_PASSWORD` | `503` | `service_unavailable` | setup is incomplete |
| `POST /api/settings/auth/password` | unauthenticated request | `401` | `unauthorized` | returned by `requireApiSession()` |
| `POST /api/settings/auth/password` | missing `currentPassword` | `400` | `validation_error` | field error on `currentPassword` |
| `POST /api/settings/auth/password` | `nextPassword` shorter than 8 chars | `400` | `validation_error` | field error on `nextPassword` |
| `POST /api/settings/auth/password` | `nextPassword === currentPassword` | `400` | `validation_error` | force real change |
| `POST /api/settings/auth/password` | current password does not match | `401` | `unauthorized` | validate against DB hash first, env fallback second |
| `POST /api/settings/auth/password` | no DB hash and no `AUTH_INITIAL_PASSWORD` | `503` | `service_unavailable` | same setup failure as login |

### 5. Good / Base / Bad Cases

Good:

- first boot with `AUTH_INITIAL_PASSWORD` configured, no DB hash, login succeeds
- user changes password, DB hash is written, session secret rotates, current
  browser stays logged in with a refreshed cookie
- subsequent logins verify against the DB hash even if
  `AUTH_INITIAL_PASSWORD` still exists in env

Base:

- logout always clears `feedfuse_session` and returns
  `{ authenticated: false }`
- expired or tampered cookies fail the guard and require login again
- `auth_session_secret` from the current DB row is the only signing secret

Bad:

- reading `AUTH_INITIAL_PASSWORD` before checking `auth_password_hash`
- updating `auth_password_hash` without rotating `auth_session_secret`
- exposing session tokens to client-side JavaScript or storing them outside the
  HttpOnly cookie
- protecting route handlers with ad hoc cookie checks instead of
  `requireApiSession()`

### 6. Tests Required

Auth helpers:

- `src/server/auth/session.test.ts`
  - assert valid tokens verify
  - assert tampered or expired tokens fail
  - assert cookie serialization includes required attributes
  - assert password precedence is DB hash first, env fallback second

Route contracts:

- `src/app/api/auth/login/routes.test.ts`
  - assert success returns `{ authenticated: true }`
  - assert success sets `feedfuse_session`
  - assert missing bootstrap password returns `503`
  - assert invalid password returns `401`

- `src/app/api/settings/auth/password/routes.test.ts`
  - assert authenticated change writes hash and rotates cookie
  - assert invalid current password returns `401`
  - assert too-short next password returns `400`

Repository and migration:

- `src/server/repositories/settingsRepo.test.ts`
  - assert auth settings are read and updated from `app_settings`
- `src/server/db/migrations/appSettingsAuthMigration.test.ts`
  - assert migration adds both auth columns and default secret behavior

UI coverage:

- `src/features/auth/LoginPage.test.tsx`
  - assert product login page renders the password form and submits cleanly
- `src/features/settings/SettingsCenterModal.test.tsx`
  - assert security entry is exposed as a dedicated settings menu item

### 7. Wrong vs Correct

#### Wrong

```ts
const envPassword = getServerEnv().AUTH_INITIAL_PASSWORD;
if (envPassword && verifyPlainPassword(password, envPassword)) {
  return { ok: true };
}

const authSettings = await getAuthSettings(getPool());
return verifyPassword(password, authSettings.authPasswordHash)
  ? { ok: true }
  : { ok: false, reason: 'invalid_password' };
```

Why it is wrong:

- env password incorrectly overrides the stored password hash
- changing the password in settings would not actually take precedence

#### Correct

```ts
const authSettings = await getAuthSettings(getPool());

if (authSettings.authPasswordHash.trim()) {
  return verifyPassword(password, authSettings.authPasswordHash)
    ? { ok: true }
    : { ok: false, reason: 'invalid_password' };
}

const envPassword = getServerEnv().AUTH_INITIAL_PASSWORD?.trim();
if (!envPassword) {
  return { ok: false, reason: 'missing_initial_password' };
}

return verifyPlainPassword(password, envPassword)
  ? { ok: true }
  : { ok: false, reason: 'invalid_password' };
```

Why it is correct:

- persisted password state overrides bootstrap config
- empty env values are treated as unset
- the service can return a clear setup failure when neither source exists
