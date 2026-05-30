---
name: bulma
description: Operate a Bulma USD account from an agent — check balance, manage payout recipients, and send money to a local bank via the `bulma` CLI. Use when the user asks about their Bulma account, balance, US account details, recipients, or wants to send/pay out money.
# version is overwritten in CI from the git tag (release-cli.yml); the value
# here is only a fallback for local/dev installs.
version: 0.1.0
license: MIT
homepage: https://bul.ma
metadata:
  hermes:
    tags: [finance, payments, cli, banking]
    category: integrations
---

# Bulma

Bulma is an agentic global account for remote workers: create a USD account, receive salary, and send money to a local bank. This skill drives the `bulma` command-line tool.

## Prerequisites

The `bulma` binary must be on `PATH`. If `bulma version` fails, install it:

```sh
curl -fsSL https://bul.ma/install.sh | bash
```

**Authentication is a one-time human step — you cannot complete it yourself.** `bulma login` is a Google device flow (opens a browser) and `bulma onboard` is a KYC link. A human authorizes once; the session token is then cached locally and every command below reuses it. If a command exits `3` ("Not logged in"), stop and ask the human to authorize. If a command exits `4` ("No account yet"), ask the human to run `bulma onboard` (KYC approval arrives by email in ~24h).

You *can* orchestrate the login: run `bulma login --json --no-browser`. It streams newline-delimited JSON events on stdout — first `{"event":"pending","verificationUriComplete":…,"userCode":…}` (relay that URL + code to your user so they can authorize in their own browser), then blocks until `{"event":"success",…}` or `{"event":"error","error":…}` (e.g. `timeout`, `expired_token`, `access_denied`). `{"event":"already_logged_in",…}` means a session already exists.

## Core rule: always pass `--json`

Every data command supports `--json` and emits machine-readable output. **Always use it** — parse the JSON, do not scrape human text. You run without a TTY, so interactive prompts are disabled; you must supply every value as a flag.

## Reading account state

```sh
bulma whoami --json      # current user { ... }
bulma account --json     # US account details (routing/account number)
bulma balance --json     # USD balance
```

## Recipients

A recipient is a destination bank account. Rails (recipient types) and their required fields are **dynamic** — fetched from the API, not hardcoded.

```sh
bulma recipient list --json                 # [{ id, type, name, summary }]
bulma recipient fields --json                # [{ type, label }] — available rails
bulma recipient fields --type <rail> --json  # one rail's full spec, incl. fields[]
bulma recipient add --type <rail> --set key=value --set key2=value2 [--json]
bulma recipient remove <id>
```

**Before adding a recipient, discover the rail's required fields** — they are dynamic, not hardcoded. Run `bulma recipient fields --type <rail> --json`; each entry in `fields[]` is `{ key, label, required, sensitive, options? }`. Supply every `required` field as `--set <key>=<value>`. Treat `sensitive` fields (account numbers, etc.) with care. A missing required field exits `2` and names the field.

`recipient add --json` returns the created `{ id, type, name, summary }`.

## Sending a payout — moves real money

```sh
bulma payout --recipient <id> --amount <usd> --yes --json
```

- `--amount` is USD as a decimal (e.g. `250` or `250.50`).
- `--yes` is **required** non-interactively; without it the command refuses (exit `2`). Treat `--yes` as irreversible — only send after the user has explicitly confirmed the recipient and amount in this conversation.
- If exactly one recipient exists, `--recipient` may be omitted; otherwise it is required.
- The command quotes, executes, then polls to a terminal status. Output JSON: `{ payoutId, status, senderAmountCents, receiverAmount, freeCreditApplied }`. `status` is one of `pending | completed | failed | refunded`.

Check a past payout:

```sh
bulma payout status <payoutId> --json
```

## Referral credits

```sh
bulma referral status --json          # credit balance
bulma referral list --json            # your codes + credits
bulma referral share <code>           # mark shared, print invite link
```

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | success (also a still-`pending` payout) | continue |
| 2 | bad usage / missing flag or field | fix the flags and retry |
| 3 | not logged in / auth expired | ask human to run `bulma login` |
| 4 | no account / recipient not found | ask human to run `bulma onboard` |
| 5 | quote expired or free credit consumed | re-run `bulma payout` to re-quote |
| 6 | payout reached `failed` / `refunded` | report failure; do not retry blindly |
| 10 | API/network error | surface the message; retry may help |

Always branch on the exit code, not on prose in stdout.
