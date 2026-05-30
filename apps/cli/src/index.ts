#!/usr/bin/env bun
import { account } from "./commands/account"
import { balance } from "./commands/balance"
import { login } from "./commands/login"
import { logout } from "./commands/logout"
import { onboard } from "./commands/onboard"
import { payout } from "./commands/payout"
import { recipient } from "./commands/recipient"
import { referral } from "./commands/referral"
import { whoami } from "./commands/whoami"
import { maybeUpdateBanner } from "./lib/update-check"
import { VERSION } from "./lib/version"

const PKG_NAME = "bulma"

const HELP = `${PKG_NAME} — Agentic global account for remote workers

Usage:
  ${PKG_NAME} <command> [flags]

Commands:
  login               Authenticate via Google (device flow)
    --force           Force re-login even if a session exists
    --no-browser      Do not auto-open the browser
    --json            Stream newline-delimited JSON events (pending/success/error)
  logout              Revoke session and remove local credentials
  whoami              Show the current user
    --json            Machine-readable output
  onboard             Open BlindPay KYC link (status arrives via email in 24h)
    --referral <code> Apply a referral code
    --no-browser      Do not auto-open the browser
    --json            Machine-readable output
  account             Show US account instructions
    --show-full       Reveal the full account number
    --json            Machine-readable output
  balance             Show account balance in USD
    --json            Machine-readable output
  recipient <sub>     Manage payout recipients
    add               Add a recipient (--type <rail> --set k=v … or interactive)
    list              List recipients (masked)
    fields            Show rails, or a rail's --set fields (--type <rail>)
    remove <id>       Remove a recipient
    --json            Machine-readable output (add/list/fields)
  payout              Send a payout (--recipient <id> --amount <usd> [--yes] or interactive)
    status <id>       Show a payout's status
    --json            Machine-readable output
  referral <sub>      Referral codes + free-payout credits
    list              List your codes and credit balance
    share <code>      Mark a code shared and print its invite link
    status            Show credit balance
    --json            Machine-readable output
  help                Show this help
  version             Print CLI version
`

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`)
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 ? args[idx + 1] : undefined
}

async function main(argv: string[]): Promise<number> {
  const [, , raw, ...rest] = argv
  const cmd = raw ?? "help"

  switch (cmd) {
    case "help":
    case "-h":
    case "--help":
      console.log(HELP)
      return 0
    case "version":
    case "-v":
    case "--version":
      console.log(`${PKG_NAME} ${VERSION}`)
      return 0
    case "login":
      return login({
        force: hasFlag(rest, "force"),
        noBrowser: hasFlag(rest, "no-browser"),
        json: hasFlag(rest, "json"),
      })
    case "logout":
      return logout()
    case "whoami":
      return whoami(hasFlag(rest, "json"))
    case "onboard":
      return onboard({
        noBrowser: hasFlag(rest, "no-browser"),
        json: hasFlag(rest, "json"),
        referralCode: flagValue(rest, "referral"),
      })
    case "account":
      return account({
        showFull: hasFlag(rest, "show-full"),
        json: hasFlag(rest, "json"),
      })
    case "balance":
      return balance({ json: hasFlag(rest, "json") })
    case "recipient":
    case "recipients":
      return recipient(rest)
    case "payout":
      return payout(rest)
    case "referral":
    case "referrals":
      return referral(rest)
    default:
      console.error(`unknown command: ${cmd}`)
      console.error(HELP)
      return 2
  }
}

main(Bun.argv).then(async (code) => {
  // Best-effort upstream-version probe. Printed after the command output so
  // it never interleaves with structured (--json) responses. Returns null
  // when there's nothing to say, when --json/CI/scripts (non-TTY), or when
  // BULMA_NO_UPDATE_CHECK=1.
  const banner = await maybeUpdateBanner()
  if (banner) console.error(`\n${banner}`)
  process.exit(code)
})
