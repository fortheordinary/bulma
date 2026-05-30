# CLI Commands

All commands run after `bulma login`. CLI loads `~/.config/bulma/credentials.json`, attaches `Authorization: Bearer …`, talks only to Bulma API (never directly to BlindPay).

All amounts are exchanged in **integer cents** between CLI and API. CLI formats for display.

---

## `bulma onboard`

### Flow

1. CLI: `POST /onboard/start` (no body, just session auth).
2. API:
   - If user already has `receivers` row with `approved` + wallet + virtual_account → return `{ state: "ready" }` and exit 0 with "Already onboarded".
   - Otherwise, ensure a pending `receivers` row exists (create if missing).
   - Generate a hosted KYC URL signed/scoped to that receiver — BlindPay's onboarding link (TBD: which exact endpoint; the skill docs describe API-only receiver creation, hosted link likely separate product → mark as [open-question](open-questions.md)).
   - Return `{ state: "pending", verificationUri, receiverId }`.
3. CLI: opens `verificationUri` in browser (`Bun.spawn(['open', url])` on macOS, `xdg-open` Linux, `start` Windows; fallback prints URL).
4. CLI: poll `GET /onboard/status` every 3s up to 30 min.
5. API status states:
   - `pending` — KYC not started or in review.
   - `approved` — KYC approved; wallet + virtual account provisioning in progress.
   - `ready` — all three (receiver + wallet + virtual account) provisioned.
   - `rejected` — KYC denied; include `reasons[]`.
6. On `ready`, CLI prints summary:
   ```
   ✓ Identity verified
   ✓ Account provisioned
   ✓ US account ready (run `bulma account` to see details)
   ```

### Errors

- KYC rejected → print `kyc_warnings` translated to plain language, exit 1.
- Wallet creation fails (BlindPay 5xx) → API auto-retries (3x exp backoff); after that, status stuck in `approved` and `GET /onboard/status` returns `provisioning_error` with a support ref id.

---

## `bulma balance`

### Flow

1. CLI: `GET /accounts/balance`.
2. API:
   - Load `user_profile.wallet_id`.
   - Call BlindPay `GET /receivers/{re_…}/blockchain-wallets/{bw_…}` to resolve the on-chain `address` (cached 5 min).
   - Resolve USDC balance — preferred path: BlindPay endpoint if/when available; fallback path: Polygon RPC `eth_call balanceOf(address)` against native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`.
   - Convert 6-decimal token units → integer cents (divide by 10_000).
   - Return `{ amountUsdCents, asOf }`.
3. CLI prints: `Balance: $1,234.56 USD`.

### Notes

- Native Polygon USDC only, not USDC.e (bridged).
- 10s in-memory cache per address to avoid hammering BlindPay / RPC.

---

## `bulma account`

### Flow

1. CLI: `GET /accounts/virtual`.
2. API: load `user_profile.virtual_account_id`, call BlindPay `GET /receivers/{re_…}/virtual-accounts/{va_…}`, mask the account number in the response by default.
3. CLI prints, e.g.:
   ```
   US Account
   ----------
   Beneficiary:     Bernardo Simonassi Moura
   Bank:            Lead Bank (or whichever BlindPay uses)
   Routing number:  101019644
   Account number:  •••• 5678
   (full number copied to clipboard)

   Wire instructions and ACH are supported.
   ```
4. `bulma account --show-full` adds `?reveal=1` (or similar) to the API call; API gates by re-validating the bearer session (no extra auth in MVP).

---

## `bulma recipient add`

Interactive. The CLI is the form.

### Flow

1. CLI: `GET /recipients/types` → API returns the supported types (derived from the per-rail Zod schemas; not from a remote BlindPay call). Shape:
   ```json
   [
     { "type": "ach", "label": "US ACH", "fields": [ /* … */ ] },
     { "type": "pix", "label": "Brazil PIX", "fields": [ /* … */ ] }
   ]
   ```
2. CLI prompts: arrow-key picker through `label`s.
3. CLI prompts for each `fields[i]` — name, label, type, validation regex/zod schema, optional dropdown enum values.
4. CLI: `POST /recipients` body `{ type, payload }`. Bulma API:
   - Validates payload with the matching Zod schema (server-side schemas are the single source of truth; `/recipients/types` is derived from them).
   - Forwards to BlindPay `POST /instances/{in_…}/receivers/{re_…}/bank-accounts`.
   - Returns the new `ba_…` id + masked display fields directly from BlindPay's response.
5. CLI prints `✓ Added recipient "Display Name" (••••5678)`.

> No local `bank_accounts` table — BlindPay is the source of truth. The webhook `bankAccount.new` is informational only.

### Field catalog (initial)

Map directly from [bank-accounts.md](../.agents/skills/blindpay/references/essentials/bank-accounts.md):

| Type                  | Required fields                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ach` / `wire` / `rtp`| `name`, `beneficiary_name`, `routing_number`, `account_number`, `account_type` (for ach), `account_class`, full US address, `recipient_relationship`                       |
| `pix`                 | `name`, `pix_key`                                                                                                                                                         |
| `spei_bitso`          | `name`, `beneficiary_name`, `spei_protocol`, `spei_institution_code`, `spei_clabe`                                                                                        |
| `ach_cop_bitso`       | `name`, `account_type`, beneficiary first/last name, `ach_cop_document_id`, `ach_cop_document_type`, email, bank code, bank account                                       |
| `transfers_bitso`     | `name`, `beneficiary_name`, `transfers_type`, `transfers_account`                                                                                                         |
| `international_swift` | `name`, `account_class`, swift_code_bic, account number/IBAN, full beneficiary + bank address blocks, `recipient_relationship`, `swift_payment_code`                       |

---

## `bulma recipient list`

1. CLI: `GET /recipients`.
2. API calls BlindPay `GET /instances/{in_…}/receivers/{re_…}/bank-accounts`, masks each row (last4 only, no full account numbers), returns the array.
3. CLI prints table:
   ```
   ID         TYPE   CURRENCY  DISPLAY NAME            DEST
   bp_a1b2c3  ACH    USD       Jane main account       ••••5678
   bp_d4e5f6  PIX    BRL       Self BRL                CPF ••••12
   ```

---

## `bulma payout`

### Flow

1. `bulma payout` with no args → prompt for recipient (table from `recipient list`) + amount.
   `bulma payout --recipient bp_a1b2c3 --amount 100.00` → skips prompts.
2. CLI: `POST /payouts/quote` body `{ bankAccountId, amountUsdCents, currencyType: 'sender' | 'recipient' }` (default `sender`).
3. API: BlindPay `POST /quotes` (token: `USDC`, network: `polygon`). Persist quote, check if a `referral_credits.status='available'` exists for user → set `referralCreditAvailable: true` in response.
4. CLI shows:
   ```
   Quote qu_xxx (expires in 5:00)

   You send:        $100.00 USD
   Recipient gets:  $98.43  USD
   Total fee:       $1.57   USD
   Rate:            1.0000 USD/USD
   ★ Apply free payout credit? (y/n)
   ```
   On `y` if credit exists, recompute (call quote API again with `cover_fees: true` so receiver gets full amount), show updated breakdown.
5. CLI: confirm `Send payout? (y/n)`. On `y` → `POST /payouts/execute` body `{ quoteId, useReferralCredit: bool }`.
6. API:
   - Reload quote, ensure not expired.
   - Mark credit as `consumed` (transaction-locked) if requested.
   - Call BlindPay `POST /instances/{instance}/payouts/evm` body `{ quote_id, sender_wallet_address: <user_profile.wallet_id resolved address> }`. Custody, signing, and gas are BlindPay's responsibility.
   - Persist `payouts` row keyed by BlindPay `po_…`, return `{ payoutId, status: 'pending', estimatedArrival }`.
7. CLI prints:
   ```
   ✓ Payout submitted (po_xxx)
   Recipient gets: $98.43 USD via ACH (~2 business days)
   Track: bulma payout status po_xxx
   ```

### Errors

- `quote_expired` → CLI says "Quote expired, run `bulma payout` again".
- `insufficient_balance` → CLI says "Insufficient balance. Current: $X, needed: $Y".
- `kyc_not_approved` → CLI says "Identity verification required. Run `bulma onboard`".

---

## `bulma referral`

Subcommands:

| Subcommand                       | Behavior                                                                |
| -------------------------------- | ----------------------------------------------------------------------- |
| `bulma referral` (default `list`)| Show 5 codes + status + earned credits.                                  |
| `bulma referral share <code>`    | Marks a code as `shared` (locks the slot until it converts or expires).  |
| `bulma referral status`          | Show pending credits and consumed credits log.                            |

Display:
```
Your referral codes:
  KRT8MN   AVAILABLE
  P5JX2W   AVAILABLE
  TQ9DH3   SHARED      (2026-03-12)
  WB7FK4   CONVERTED ✓ (1 free payout earned)
  ZM2NX9   AVAILABLE

Free payout credits: 1 available

Caution: if you share all 5 codes and none convert,
you forfeit all future referral credits.
```

Full mechanic in [referrals.md](referrals.md).

---

## Errors and exit codes

| Scenario                            | Exit code |
| ----------------------------------- | --------- |
| Success                             | 0         |
| Validation error (bad input)        | 2         |
| Auth required / expired             | 3         |
| Onboarding not complete             | 4         |
| BlindPay 4xx                        | 5         |
| Bulma API 5xx / network             | 10        |
| Unknown                             | 1         |

Every CLI command also supports `--json` to emit machine-readable output for AI agents.
