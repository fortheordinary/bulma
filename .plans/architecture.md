# Architecture

## Components

```
┌──────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│  bulma CLI       │    │  apps/www (Vue)    │    │ BlindPay Hosted KYC│
│  apps/cli (Bun)  │    │  Vapor + Tailwind  │    │ app.blindpay.com…  │
│  - device flow   │    │  + shadcn-vue      │    └────────────────────┘
│  - HTTPS → api   │    │  /cli pair page    │             ▲
└────────┬─────────┘    │  better-auth signin│             │ user finishes KYC
         │              └─────────┬──────────┘             │
         │ Bearer                 │ cookie                 │
         ▼                        ▼                        │
┌────────────────────────────────────────────────────────────────────┐
│  Bulma API — Hono on Cloudflare Worker (apps/api)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ /api/auth/*  │ │ /auth/device │ │ /accounts  │ │ /webhooks/   │ │
│  │ (better-auth │ │  /start      │ │ /onboard   │ │  blindpay    │ │
│  │  + google)   │ │  /verify     │ │ /recipients│ │ (svix verified)│
│  │              │ │  /poll       │ │ /payouts   │ │              │ │
│  │              │ │              │ │ /referrals │ │              │ │
│  └──────────────┘ └──────────────┘ └────────────┘ └──────────────┘ │
│  All routes: createRoute() from @hono/zod-openapi → OpenAPIHono     │
└─────────────┬──────────────────────┬──────────────────────┬────────┘
              │                      │                      │
              ▼                      ▼                      ▼
      ┌─────────────┐         ┌──────────────┐      ┌───────────────┐
      │  D1 SQLite  │         │ BlindPay API │      │  Polygon RPC  │
      │  + Drizzle  │         │ (REST + WH)  │      │  (Alchemy/…)  │
      └─────────────┘         └──────────────┘      └───────────────┘
```

## Request flow — happy paths

### Onboarding

BlindPay is the source of truth for receiver / wallet / virtual account. Bulma stores only the BlindPay ids on `user_profile`.

1. `bulma onboard` → `POST /onboard/start` → API calls BlindPay to mint a hosted KYC link, stores nothing yet, returns the URL to CLI.
2. CLI opens URL in browser; user completes KYC.
3. BlindPay → `POST /webhooks/blindpay` (event `receiver.update`, status `approved`).
4. Webhook handler:
   - Maps payload's `receiver_id` to a Bulma user (via the `clientReferenceId` / email we passed at `/onboard/start`); writes `user_profile.receiver_id`, flips `onboarding_state = 'approved'`.
   - Calls BlindPay `POST /blockchain-wallets` (Polygon) and stores returned `bw_…` in `user_profile.wallet_id`.
   - Calls BlindPay `POST /virtual-accounts` (`token: USDC`, `blockchain_wallet_id: bw_…`) and stores `va_…` in `user_profile.virtual_account_id`.
   - Flips `onboarding_state = 'ready'`.
   - Emits internal `onboarding.completed` event (for referral conversion, see [referrals.md](referrals.md)).
5. CLI polls `GET /onboard/status` until state == `ready`.

### Balance read

1. `bulma balance` → `GET /accounts/balance`.
2. API loads `user_profile.wallet_id`, calls BlindPay `GET /blockchain-wallets/{bw_…}` to resolve the on-chain `address`, then queries the wallet's USDC balance — either via BlindPay (if a balance endpoint ships) or a Polygon RPC `eth_call balanceOf` if not. Converts 6-decimal raw amount → integer cents.
3. API returns `{ amountUsdCents, asOf }`. CLI prints `Balance: $1,234.56 USD`.

> If the RPC fallback is needed: `POLYGON_RPC_URL` Worker secret, 10s in-memory cache per address. Decision deferred until BlindPay confirms whether they expose balance.

### Payout

1. `bulma payout` (interactive) → choose recipient + amount → `POST /payouts/quote` body `{ bankAccountId, amountUsdCents }`.
2. API calls BlindPay `POST /quotes` (`currency_type: sender`, `cover_fees: false`, `network: polygon`, `token: USDC`). Bulma persists the resulting `qu_…` id + the referral-credit decision in `quotes` (audit only — quote data lives in BlindPay).
3. CLI shows: amount in, amount out, fees, expiry (5 min). User accepts.
4. `POST /payouts/execute` body `{ quoteId, useReferralCredit }`.
5. If credit applied, re-quote with `cover_fees: true` (Bulma absorbs the fee differential — see [referrals.md](referrals.md)).
6. API calls BlindPay `POST /payouts/evm` with `quote_id` + `sender_wallet_address`. (Custody, signing, and gas are BlindPay's responsibility; if a step turns out to require a Bulma-side action, raise it during Phase 6.)
7. Persist `payouts` row keyed by BlindPay `po_…`, return execution receipt to CLI.
8. `payout.complete` webhook flips `payouts.status`.

## Security

| Concern               | Approach                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Web ↔ API auth        | better-auth session cookie (httpOnly, secure, sameSite=lax) — issued after Google OAuth.              |
| CLI ↔ API auth        | Device flow pairs the CLI to a better-auth session; CLI uses `Authorization: Bearer <session-token>`. |
| Token storage on host | `~/.config/bulma/credentials.json`, mode `0600`. Optionally OS keychain (macOS Keychain / libsecret). |
| API ↔ BlindPay        | `BLINDPAY_API_KEY` Worker secret, never exposed to CLI.                                               |
| Webhook auth          | svix HMAC-SHA256 verification (constant-time compare); reject if timestamp drift > 5 min.             |
| Custody               | BlindPay-managed. Bulma holds no private keys, runs no treasury / paymaster / sponsor wallet.         |
| D1 access             | Worker binding only; no public DB endpoint.                                                           |
| Rate limiting         | Per-user + per-IP via Cloudflare Workers KV counters or Durable Object.                               |
| PII                   | KYC files never touch our DB; we only persist BlindPay's ids in `user_profile`.                       |

## Idempotency

- All write endpoints accept `Idempotency-Key` header; key + request hash stored in D1 for 24h.
- Webhook handler deduplicates by `svix-id`.
- BlindPay outbound calls retried with exponential backoff on 5xx (max 3); on 4xx, surface error immediately to user.

## Open architectural questions

→ see [open-questions.md](open-questions.md).
