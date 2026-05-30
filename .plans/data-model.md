# Data Model

D1 (SQLite) via Drizzle. All Bulma-owned row ids follow the prefixed-nanoid format defined in [AGENTS.md §2c](../AGENTS.md#2c-database-id-format--prefixed-nanoid) — `<prefix>_<12-char nanoid>`. BlindPay-mirrored ids keep BlindPay's exact prefix (`re_…`, `ba_…`, `bw_…`, `va_…`, `po_…`).

## Tables

### `user` / `session` / `account` / `verification` (managed by better-auth)

Owned by [better-auth's Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle); do **not** hand-write or hand-edit these in our migrations. They're created by running `bunx @better-auth/cli generate` against our drizzle config, and applied via `wrangler d1 migrations apply`.

- `user` — id, email, name, emailVerified, image, createdAt, updatedAt.
- `session` — id, token, userId, expiresAt, ipAddress, userAgent.
- `account` — Google OAuth records (providerId, accountId, accessToken, refreshToken, idToken).
- `verification` — short-lived codes (we reuse for OTP-style flows if needed).

### `user_profile` (Bulma-owned, 1:1 with `user`)

App-specific columns kept separate so we never edit better-auth's `user` table. BlindPay-owned objects (receiver, wallet, virtual account, bank accounts) are not mirrored locally — we store only the BlindPay ids and fetch fresh state from the BlindPay API on demand.

| Column               | Type    | Notes                                                                   |
| -------------------- | ------- | ----------------------------------------------------------------------- |
| `user_id`            | text PK | → user.id (cascade delete)                                              |
| `onboarding_state`   | text    | enum: `none` / `pending` / `approved` / `rejected` / `ready`            |
| `receiver_id`        | text    | BlindPay `re_…`, nullable until onboarding creates it                    |
| `wallet_id`          | text    | BlindPay `bw_…`, nullable                                                |
| `virtual_account_id` | text    | BlindPay `va_…`, nullable                                                |
| `created_at`         | integer |                                                                          |

ToS is accepted on BlindPay's hosted KYC flow (see [open-questions.md §7](open-questions.md)) — Bulma does not persist a `tos_id`.

Bank accounts (`ba_…`) are listed/created via BlindPay's bank-account endpoints — no local table; we always call BlindPay to enumerate the user's recipients.

### `device_codes`

CLI device-flow pairing (see [auth.md](auth.md)).

| Column                  | Type    | Notes                                                            |
| ----------------------- | ------- | ---------------------------------------------------------------- |
| `device_code`           | text PK | 32B hex                                                           |
| `user_code`             | text UQ | 8 chars                                                           |
| `expires_at`            | integer | created + 600                                                     |
| `approved_session_id`   | text    | nullable; references `session.id`                                  |
| `last_polled_at`        | integer | rate-limit                                                        |
| `created_at`            | integer |                                                                   |

### `referral_codes`

Each user gets exactly 5 rows on onboarding completion. **`owner_user_id` is nullable** to allow system-bootstrap codes (see "Seed data" below).

| Column         | Type    | Notes                                                |
| -------------- | ------- | ---------------------------------------------------- |
| `id`           | text PK | `rc_<12-char nanoid>`                                 |
| `owner_user_id`| text FK | → user.id, nullable for system-bootstrap codes        |
| `code`         | text UQ | 6-char alphanumeric (excluding ambiguous I/O/0/1); system-bootstrap codes are free-form |
| `status`       | text    | `available` / `shared` / `converted` / `expired`      |
| `shared_at`    | integer | nullable                                              |
| `converted_user_id` | text FK | nullable — who signed up                          |
| `converted_at` | integer | nullable                                              |
| `created_at`   | integer |                                                       |

### `referral_credits`

Earned zero-fee credits awaiting consumption.

| Column            | Type    | Notes                                              |
| ----------------- | ------- | -------------------------------------------------- |
| `id`              | text PK | `rcr_<12-char nanoid>`                              |
| `user_id`         | text FK | → user.id (owner who earned the credit)            |
| `source_code_id`  | text FK | → referral_codes.id                                 |
| `status`          | text    | `available` / `consumed` / `expired`                 |
| `consumed_payout_id` | text    | BlindPay `po_…`, nullable (not a local FK; lives in BlindPay) |
| `created_at`      | integer |                                                     |
| `consumed_at`     | integer | nullable                                            |
| `expires_at`      | integer | nullable — see referrals.md for expiry rules         |

### `webhook_events`

Deduplication + audit.

| Column          | Type    | Notes                                |
| --------------- | ------- | ------------------------------------ |
| `id`            | text PK | `svix-id`                             |
| `event_type`    | text    |                                       |
| `payload`       | text    | raw JSON body                        |
| `processed_at`  | integer | nullable until handler succeeds      |
| `error`         | text    | nullable                              |
| `received_at`   | integer |                                       |

### `idempotency_keys`

| Column         | Type    | Notes                                |
| -------------- | ------- | ------------------------------------ |
| `key`          | text PK | `<user_id>:<client_key>`             |
| `request_hash` | text    | sha256 of method+path+body           |
| `response`     | text    | JSON snapshot                        |
| `status_code`  | integer |                                       |
| `created_at`   | integer | TTL 24h cleanup                       |

## Indexes

- `sessions(user_id)`, `sessions(expires_at)`
- `referral_codes(owner_user_id)`, `referral_codes(code) UNIQUE`
- `referral_credits(user_id, status)`
- `webhook_events(event_type, received_at)`

## Seed data

- `referral_codes` ships with one bootstrap row at migration time: `code = 'INITIAL'`, `owner_user_id = NULL`, `status = 'available'`. This is the founder's personal share code (bernardo@blindpay.com); when it converts an invitee, the credit is attributed via app logic that resolves the founder by email rather than by `owner_user_id`.

## Migrations

Two generators contribute SQL into `apps/api/migrations/`:

1. `bunx @better-auth/cli generate --output ./drizzle/auth-schema.ts` produces Drizzle definitions for `user`/`session`/`account`/`verification`; we then `drizzle-kit generate` to emit the migration.
2. `bunx drizzle-kit generate` for our domain schema (everything in this doc except the better-auth tables).

Generation order:

1. better-auth tables (`user`, `session`, `account`, `verification`) + `user_profile` + `device_codes`.
2. `referral_codes`, `referral_credits` (referrals).
3. `webhook_events`, `idempotency_keys` (infra).

Indexes:

- `session(userId)`, `session(expiresAt)`
- `referral_codes(owner_user_id)`, `referral_codes(code) UNIQUE`
- `referral_credits(user_id, status)`
- `webhook_events(event_type, received_at)`
- `device_codes(user_code) UNIQUE`
