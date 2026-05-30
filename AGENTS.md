# AGENTS.md

Rules for any AI agent working in the Bulma repo. Read before writing code or docs.

## 0. Agent instruction file

`AGENTS.md` is the single source of truth for agent rules in this repo. Ignore other conventional files (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, etc.) even if your tool auto-loads them. `CLAUDE.md` is a symlink to this file; do not edit it directly. If you find guidance only in one of those other files, treat it as stale and surface it for migration into `AGENTS.md`.

## 1. Terminology — scoped prohibition

Bulma is **"Agentic global account for remote workers"**. It is built on BlindPay's stablecoin rails, so internal code, schema, comments, and `.plans/` docs may use the literal blindpay vocabulary (USDC, USDT, wallet, Polygon, network, signature, etc.) — pretending otherwise would make the code unreadable against blindpay docs.

**Customer-facing surface area is strict fiat.** Anywhere the user sees output, crypto vocabulary is banned:

- CLI command output (`bulma balance` → "Balance: $1,234.56 USD", never "1234.56 USDC")
- API response field names and human-readable messages
- Error messages shown to users
- Marketing / README / public docs
- Commit messages and PR descriptions affecting public surface

Forbidden in customer-facing copy: crypto, cryptocurrency, blockchain, web3, stablecoin, USDC, USDT, wallet (use "account"), on-chain, chain names (Polygon, Ethereum, etc.), gas, mint, burn, bridge.

Internal surface (code, schema columns, log lines, `.plans/`, AGENTS.md, internal types) — use the technically correct term; do not coin euphemisms that diverge from BlindPay's API.

When in doubt about which side of the line a string lives on, ask.

## 2. Tech stack (authoritative)

| Layer            | Choice                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| Runtime / PM     | Bun (`>=1.2`)                                                                          |
| Monorepo         | Turborepo                                                                              |
| Language         | TypeScript (strict), Zod-first (schemas drive types)                                   |
| API              | Hono on Cloudflare Workers + `@hono/zod-openapi`                                       |
| Auth             | better-auth (Drizzle adapter, Google social plugin, Bearer plugin)                     |
| Database         | Cloudflare D1 (SQLite) via Drizzle ORM + drizzle-kit                                   |
| Secrets (dev)    | `.env` at each `apps/*` root (wrangler 4+ auto-loads for `wrangler dev`; vite for www). Optional: Infisical project; `bun run dev` pulls fresh secrets from the `/api` folder into `.env.infisical` per start. Secrets are namespaced per app (`/api`, `/www`) — see §5 Infisical secret layout. |
| Public ingress   | Cloudflare Tunnel (`cloudflared`) — `local.bul.ma` → `localhost:8787` for BlindPay webhooks. `bun run --filter=api tunnel` to start. |
| Web              | Vue 3.6 + Vapor mode + Tailwind v4 + shadcn-vue (reka-ui), Vite                        |
| Lint / Format    | oxlint + oxfmt                                                                         |
| Apps             | `apps/api` (Hono Worker), `apps/cli` (Bun CLI), `apps/www` (Vue SPA)                   |
| Shared packages  | `packages/typescript` (tsconfig), `packages/oxc` (lint cfg)                            |

**Do not introduce** other runtimes (Node-specific APIs), other ORMs (Prisma, Kysely), other validators (Yup, Valibot), other auth libs (Lucia, Clerk, Auth.js/NextAuth, Supabase Auth), other UI frameworks (React, Svelte, Solid), other CSS systems (CSS-in-JS, Sass), other linters/formatters (ESLint, Prettier, Biome), or other package managers (npm, pnpm, yarn). If a real need arises, propose it to the user before installing.

### Commit identity — agent@bul.ma only
Every commit (author **and** committer) MUST be `agent@bul.ma`. Enforced at three layers:
- `.githooks/pre-commit` — blocks a commit when `git config user.email` ≠ `agent@bul.ma`.
- `.githooks/pre-push` — blocks pushing any commit whose author/committer ≠ `agent@bul.ma`.
- `.github/workflows/verify-author.yml` — CI gate on every PR + push to `main` (catches `--no-verify` / web edits).

Hooks live in `.githooks` (version-controlled) but `core.hooksPath` is local config, so **after cloning** run once:
```sh
git config user.name "agent-bulma" && git config user.email agent@bul.ma
git config core.hooksPath .githooks
```

### 2a. Zod-first

Define a Zod schema, then derive the type with `z.infer<typeof Schema>`. Do **not** hand-write `interface` or `type` declarations for data that crosses any boundary (API I/O, DB rows, CLI args, config files, env vars). Exceptions: utility types, generics, branded primitives, internal helpers with no runtime shape.

### 2b. Hono routes use `@hono/zod-openapi`

All `apps/api` routes are declared with `createRoute` from `@hono/zod-openapi` and mounted on an `OpenAPIHono` instance. Request/response schemas are Zod. Plain `app.get('/x', handler)` is not allowed for shipped endpoints — it skips validation and breaks the generated OpenAPI doc. Health checks and internal-only debug routes are the only exemption.

### 2c. Database id format — prefixed nanoid

All Bulma-owned database row primary keys (and foreign keys to those rows) use the format:

```
<prefix>_<12-char nanoid>
```

- Generator: `nanoid` (cryptographically secure) with the default URL-safe alphabet (`A-Za-z0-9_-`).
- 12 chars ≈ 72 bits of entropy — sufficient for app scale, much shorter than UUID v4 in URLs and logs.
- Total id length is `prefix.length + 1 + 12`.

Prefix table:

| Table              | Prefix  | Example                |
| ------------------ | ------- | ---------------------- |
| `user`             | `us_`   | `us_kV9aQ3p7Lm2X`      |
| `session`          | `se_`   | `se_bN4cD8e1Fg6H`      |
| `account`          | `ac_`   | `ac_xQ2vR5tY9uA1`      |
| `verification`     | `ve_`   | `ve_jK7mP3nL8oW2`      |
| `user_profile`     | n/a     | uses `user.id` as PK   |
| `referral_codes`   | `rc_`   | `rc_zT6yU1iO9pE4`      |
| `referral_credits` | `rcr_`  | `rcr_aB3cD5fG7hJ9`     |
| `webhook_events`   | n/a     | external `svix-id`     |
| `idempotency_keys` | n/a     | composite `<user_id>:<client_key>` |

Rules:

- **better-auth tables** (`user`, `session`, `account`, `verification`): configure better-auth's `advanced.database.generateId` to return the right prefix per table.
- **BlindPay-owned ids** keep BlindPay's exact format: `re_…` (receiver), `ba_…` (bank account), `bw_…` (wallet), `va_…` (virtual account), `po_…` (payout). Do **not** re-prefix or rewrap.
- **`device_codes`**: `device_code` is 32-byte hex, `user_code` is 8-char alphanumeric — these are RFC 8628 device-flow protocol values, not row ids, and bypass this rule.
- **Referral `code` column** (`referral_codes.code`) is the human-facing share code (6-char alphanumeric, excluding ambiguous I/O/0/1), not a row id, and also bypasses this rule.

## 3. Build & test workflow for new features

Follow this loop exactly. Do not skip steps.

1. **Write the code** — implement schema changes, routes, CLI commands, etc.
2. **Run the database locally**
   - If schema changed: `bun run --filter=api db:generate`
   - Apply: `bun run --filter=api db:migrate:local`
3. **Run the API**: `bun run --filter=api dev` (wrangler dev on `:8787`)
4. **Start the Cloudflare tunnel** — required to capture BlindPay webhooks against the local API (`local.bul.ma` → `:8787`). Without it, `receiver.*`, `payout.*`, etc. never reach the local dispatch path and onboarding stays stuck in `pending`.
5. **Test locally** — exercise the change with `curl` (API) or `bun run apps/cli/src/index.ts <cmd>` (CLI). Verify state by querying D1 directly: `bunx wrangler d1 execute bulma --local --command='…'`
6. **Check the result** — compare actual response and DB rows against expected behavior.
7. **Branch on outcome**
   - ✅ Works → write unit tests covering the happy path and key edge cases, then run `bunx turbo run typecheck lint format:check` before declaring done.
   - ❌ Fails → diagnose root cause, fix the code, restart from step 2 (re-migrate if schema touched, re-run API, re-test). Do **not** patch over symptoms or silence errors to make tests pass.

Never declare a feature complete without having seen it run end-to-end against local D1.

## 4. Observability — LogLayer + Workers Logs + Logpush (R2)

Structured logging is **LogLayer** with its `StructuredTransport`, which emits one JSON line per record via `console.log`. Workers Logs and any bound Logpush job capture those lines as-is.

### In the API
- `apps/api/src/lib/logger.ts` — `createLogger(env, context?)` returns a `LogLayer` instance tagged with `app=bulma-api` + `env` (plus any extra context).
- `apps/api/src/middleware/request-logger.ts` — Hono middleware that attaches a request-scoped LogLayer to `c.var.logger` (carries `request_id` from `cf-ray`, `method`, `path`). Use it instead of `console.*` in handlers so request correlation is preserved.
- The scheduled (cron) handler in `apps/api/src/index.ts` also uses `createLogger` directly with `source=cron`.

Set `LOG_LEVEL` via wrangler vars/Infisical to override the default `info`.

### Workers Logs (built-in)
`wrangler.toml` already has `[observability] enabled = true`. Records are searchable from the Cloudflare dash → Workers → Logs.

### Logpush → R2 (one-time setup)
Workers Logs ships records to whatever Logpush jobs target the script. Create the R2 destination + job once (not in this repo; CF API call below).

```bash
# 1. Pick / create an R2 bucket (one-time)
bunx wrangler r2 bucket create bulma-logs-prod

# 2. Create the Logpush job (CF API; needs Logpush:Edit token)
curl -X POST "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/logpush/jobs" \
  -H "Authorization: Bearer <CF_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "bulma-api-logs",
    "dataset": "workers_trace_events",
    "destination_conf": "r2://bulma-logs-prod/{DATE}",
    "output_options": {
      "field_names": ["Event", "Outcome", "ScriptName", "Logs", "Exceptions", "EventTimestampMs"],
      "timestamp_format": "rfc3339"
    },
    "filter": "{\"where\":{\"key\":\"ScriptName\",\"operator\":\"eq\",\"value\":\"bulma-api\"}}",
    "enabled": true
  }'
```

The job streams every `console.log` line from the Worker (and pino emits structured JSON), so the resulting R2 objects are line-delimited JSON ready for duckdb / BigQuery / Loki.

### Error alerting (production.md §9)

Alerting on error-level records is **infra, not code** — every failure path already
emits a structured JSON line at `error` level (`cron_error`, webhook dispatch
failures, BlindPay 5xx, `readiness_db_check_failed`, …). Two complementary
Cloudflare-native paths, neither requiring a code change or a new dependency:

1. **Cloudflare Notifications (unhandled exceptions).** Dash → Notifications → add
   a *Workers* alert (e.g. "Errors" / "CPU/exceptions") scoped to `bulma-api`,
   delivered to email / PagerDuty / a webhook. Catches thrown/unhandled errors
   the runtime surfaces as `Outcome=exception`.

2. **Logpush → alert sink (logged `error` records).** A second Logpush job,
   filtered to error records and pointed at an HTTP destination (Slack/Discord
   incoming webhook or an alerting relay), pages on the structured lines above —
   including handled errors that never throw (e.g. a BlindPay 5xx we turn into a
   502). Filter on the log line, not just `ScriptName`:

   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/logpush/jobs" \
     -H "Authorization: Bearer <CF_API_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "bulma-api-error-alerts",
       "dataset": "workers_trace_events",
       "destination_conf": "https://<webhook-relay>?header_Authorization=<secret>",
       "output_options": {
         "field_names": ["Outcome", "ScriptName", "Logs", "Exceptions", "EventTimestampMs"],
         "timestamp_format": "rfc3339"
       },
       "filter": "{\"where\":{\"and\":[{\"key\":\"ScriptName\",\"operator\":\"eq\",\"value\":\"bulma-api\"},{\"or\":[{\"key\":\"Outcome\",\"operator\":\"eq\",\"value\":\"exception\"},{\"key\":\"Logs\",\"operator\":\"contains\",\"value\":\"\\\"level\\\":\\\"error\\\"\"}]}]}}",
       "enabled": true
     }'
   ```

   Tune `Logs contains "level":"error"` to match LogLayer's serialized level key.
   If a richer alerting product is wanted later (grouping, dedup, release
   tracking), wire `@sentry/cloudflare` — left out for now to avoid a new dep +
   `SENTRY_DSN` secret.

## 5. CI/CD

Both `api` and `www` ship as Cloudflare Workers (`www` is a Workers Static Assets SPA — see `apps/www/wrangler.toml`). Two workflows:

- `prepare.yml` — entry point. Runs on push to `main`. `dorny/paths-filter` decides whether the change touches `apps/api`, `apps/www`, or both; dispatches the reusable `deploy.yml` with the matching `APP_NAME`.
- `deploy.yml` — reusable workflow parameterised by `APP_NAME` (`api` | `www`). Fetches secrets from Infisical (OIDC) at `secret-path: /${APP_NAME}`, runs API-only steps (D1 migrations + `wrangler secret bulk`) or the www build, then `wrangler deploy`.

### Infisical secret layout — per-app folders, never root
Secrets are namespaced by app, mirroring the repo: **`apps/api` → `/api`, `apps/www` → `/www`**, in every environment (`dev`, `prod`). The root path `/` holds nothing — do **not** add secrets there.

- Add a new API secret → `/api` in the target env. Add a www build var → `/www`.
- `deploy.yml` reads `/${{ inputs.APP_NAME }}`; `apps/api/scripts/dev.ts` reads `/api` (override via `INFISICAL_PATH`).
- A secret needed by both apps is duplicated into each folder — folders do not inherit from root.
- CLI to manage: `infisical secrets set --env <env> --path /api KEY=value`; `infisical secrets folders get --env <env> --path /`.

### Required GitHub repo secrets
- `INFISICAL_IDENTITY_ID` — OIDC machine identity ID
- `INFISICAL_PROJECT_SLUG` — Infisical project slug
- `CLOUDFLARE_API_TOKEN` — token with Workers Scripts:Edit + D1:Edit + Logpush:Edit
- `CLOUDFLARE_ACCOUNT_ID`

### Branches → envs
Currently only `main → prod`. To add staging/dev later, restore the `contains(github.ref, ...)` ternary the reference YAML used.

## 6. CLI distribution

Install command (canonical):

```bash
curl -fsSL https://bul.ma/install.sh | bash
```

### Pieces
- `apps/www/public/install.sh` — served from the www site at `https://bul.ma/install.sh`. Detects os/arch, downloads from R2, verifies SHA256, installs to `/usr/local/bin/bulma` (falls back to `~/.local/bin`). Strips the macOS quarantine xattr because cross-compiled darwin binaries are unsigned.
- `apps/cli/src/lib/version.ts` — single source of truth for the running CLI's version. Stamped at compile time via `bun build --define process.env.BULMA_VERSION="…"` (the define key MUST be `process.env.BULMA_VERSION` — `version.ts` reads that; a bare `BULMA_VERSION` define silently ships `dev`). Unbuilt local runs report `dev`.
- `apps/cli/src/lib/update-check.ts` — best-effort `dl.bul.ma/latest/VERSION` probe. Cached 24h in `~/.config/bulma/update-check.json`. Skipped on non-TTY, `BULMA_NO_UPDATE_CHECK=1`, or `dev` builds. On a newer upstream, prints a single-line banner on stderr after the command completes (so JSON output stays clean on stdout).
- `.github/workflows/release-cli.yml` — fires on `v*` tags. Cross-compiles linux/darwin × x64/arm64 with `bun build --compile`, writes `SHA256SUMS` + `VERSION`, uploads to R2 (`vX.Y.Z/*` then `latest/*`), smoke-tests the installer in a clean ubuntu container, and creates a GitHub Release.

### One-time setup
- Create R2 bucket `bulma-cli-prod` and bind a custom domain (`dl.bul.ma`) to it. Cache rule: `latest/*` TTL 60s, `v*/` TTL forever (immutable).
- Add the bucket to the `CLOUDFLARE_API_TOKEN` scope (R2:Edit).
- DNS: `dl.bul.ma` → R2 custom domain; `bul.ma` → www Worker (or Pages project).
- For unsigned darwin binaries, document the `xattr` step in the README (the installer already does it automatically; manual installs need to know).

### Cutting a release
1. `git tag v0.1.0 && git push origin v0.1.0`
2. Workflow builds, publishes to R2, creates GitHub Release.
3. `curl -fsSL https://bul.ma/install.sh | bash` now installs `v0.1.0` for any user, anywhere. Existing users' next invocation surfaces the upgrade banner within 24h.

## 7. Changelog & releases (GitHub-native)

**Do not hand-maintain a `CHANGELOG.md`.** The changelog is the set of GitHub
Releases, with bodies **auto-generated from merged PRs** — GitHub's recommended
flow. This is a hard rule for **every new build/release**:

- **One release per version tag.** Cut a release by pushing a semver tag
  `vX.Y.Z` (see §6). `release-cli.yml` already creates the Release with
  `generate_release_notes: true`; for api/www or an ad-hoc release use
  `gh release create vX.Y.Z --generate-notes`. Never write the notes by hand.
- **`.github/release.yml` categorizes the notes.** PRs are grouped into
  Breaking / Features / Fixes / Security / Maintenance / Other by their **labels**.
  Keep that file in sync when introducing a new label.
- **Bump versions with the tag, semantically** (MAJOR breaking, MINOR feature,
  PATCH fix). The tag is the source of truth — it also stamps the CLI binary
  (`BULMA_VERSION` → `version.ts`, §6) and the R2 `latest/VERSION`.
- **PR titles + labels feed the notes**, so they must be accurate: Conventional
  Commit style title (`feat: …`, `fix: …`, `chore: …`) and at least one
  category label per PR. An unlabelled PR lands under "Other Changes".
- **Squash-merge** so one PR = one changelog line. Mark a PR `ignore-for-release`
  to omit it (also excludes `dependabot` / `github-actions`).

So the workflow for every build that ships: merge labelled PRs → push a `vX.Y.Z`
tag → GitHub assembles the categorized release notes automatically.
