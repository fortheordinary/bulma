import { z } from "zod"
import { loadCredentials } from "../lib/credentials"

const Rail = z
  .object({
    routingNumber: z.string().nullable(),
    accountNumber: z.string().nullable(),
    accountNumberMasked: z.string().nullable(),
  })
  .nullable()

const VirtualAccountResponse = z.object({
  status: z.string().nullable(),
  ach: Rail,
  wire: Rail,
  rtp: Rail,
  beneficiary: z.unknown().nullable(),
  accountType: z.string().nullable(),
})

type RailValue = z.infer<typeof Rail>

type AccountOptions = {
  showFull?: boolean
  json?: boolean
}

function printRail(label: string, rail: RailValue, showFull: boolean): void {
  if (!rail) return
  const acct = showFull
    ? (rail.accountNumber ?? rail.accountNumberMasked ?? "—")
    : (rail.accountNumberMasked ?? "—")
  console.log(`${label}`)
  console.log(`  Routing number:  ${rail.routingNumber ?? "—"}`)
  console.log(`  Account number:  ${acct}`)
}

export async function account(opts: AccountOptions = {}): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }

  const url = `${creds.apiUrl}/accounts/virtual${
    opts.showFull ? "?reveal=1" : ""
  }`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.sessionToken}` },
  })

  if (res.status === 401) {
    console.error("Session expired. Run `bulma login`.")
    return 3
  }
  if (res.status === 404) {
    console.error("No US account yet. Run `bulma onboard` first.")
    return 4
  }
  if (!res.ok) {
    console.error(`account failed: ${res.status}`)
    return 10
  }

  const va = VirtualAccountResponse.parse(await res.json())

  if (opts.json) {
    console.log(JSON.stringify(va, null, 2))
    return 0
  }

  if (va.status !== "approved") {
    console.log("Account being generated, it should be ready in 24 hours.")
    return 0
  }

  console.log("US Account")
  console.log("==========")
  printRail("ACH", va.ach, !!opts.showFull)
  printRail("Wire", va.wire, !!opts.showFull)
  printRail("RTP", va.rtp, !!opts.showFull)
  if (va.accountType) console.log(`Account type:    ${va.accountType}`)
  if (!opts.showFull) {
    console.log("(run `bulma account --show-full` to reveal full numbers)")
  }
  return 0
}
