# Bulma — Plan

Bulma is an agentic global account for remote workers. It is an API + CLI built on top of [BlindPay](.agents/skills/blindpay/SKILL.md) for KYC, payment rails, virtual US accounts, and stablecoin settlement. The CLI is the primary surface for end users — every command is callable by any AI agent acting on the user's behalf.

## Scope (one-liner per command)

| Command                | Purpose                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `bulma login`          | OAuth login → Bulma API session token cached on disk.                                                    |
| `bulma onboard`        | Open BlindPay hosted KYC link → on `receiver.update approved` webhook, create EVM wallet + US virtual account, attach all to user. |
| `bulma balance`        | Fetch USDC balance from user's Polygon wallet via RPC, display as USD.                                    |
| `bulma account`        | Print US virtual account (routing + account #) for the authenticated user.                                |
| `bulma recipient add`  | Interactive bank-account builder (ACH/Wire/RTP/PIX/SPEI/SWIFT/etc.) → POST to BlindPay + persist.        |
| `bulma recipient list` | List user's saved destinations.                                                                          |
| `bulma payout`         | Create quote → show rates → on accept, execute payout. Apply zero-fee credit if available.               |
| `bulma referral`       | Manage 5-slot referral codes; track conversion → grant zero-fee payout credit.                            |

## Plan documents

1. [architecture.md](architecture.md) — components, request flow, security model
2. [data-model.md](data-model.md) — Drizzle schema (users, receivers, wallets, virtual accounts, bank accounts, quotes, payouts, referrals)
3. [auth.md](auth.md) — OAuth provider choice, CLI device-flow login, session model
4. [commands.md](commands.md) — per-command request/response shape, errors, edge cases
5. [webhooks.md](webhooks.md) — BlindPay webhook intake (svix verification, idempotency, dispatch)
6. [referrals.md](referrals.md) — 5-code mechanic, conversion ledger, credit application, expiry semantics
7. [phases.md](phases.md) — implementation milestones, dependency order, what ships first
8. [open-questions.md](open-questions.md) — decisions deferred to the user

## Apps

| App        | What                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ |
| `apps/api` | Hono on Cloudflare Workers + D1 + Drizzle. `@hono/zod-openapi` routes. better-auth.  |
| `apps/cli` | Bun CLI. Talks only to api over HTTPS.                                                |
| `apps/www` | Vue 3.6 + Vapor + Tailwind v4 + shadcn-vue. Hosts `/cli` device-flow confirm page + future dashboard. |

## Hard constraints (see [AGENTS.md](../AGENTS.md))

- Customer-facing copy = fiat only. No "USDC", no "wallet", no "Polygon" in CLI output, API response messages, or www UI strings.
- Tech stack locked: Bun, Turborepo, TS+Zod, Hono+`@hono/zod-openapi` on CF Workers, D1 + Drizzle, better-auth, Vue 3.6+Vapor+Tailwind v4+shadcn-vue, oxlint+oxfmt.
- Build/test loop: write code → migrate local D1 → run wrangler dev → exercise via curl/CLI → verify rows → write unit tests on green, restart loop on red.
