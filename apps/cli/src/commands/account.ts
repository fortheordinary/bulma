import { z } from "zod"
import { loadCredentials } from "../lib/credentials"

const Rail = z
  .object({
    routingNumber: z.string().nullable(),
    accountNumber: z.string().nullable(),
    accountNumberMasked: z.string().nullable(),
  })
  .nullable()

const Party = z
  .object({
    name: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    city: z.string().nullable(),
    stateProvinceRegion: z.string().nullable(),
    country: z.string().nullable(),
    postalCode: z.string().nullable(),
  })
  .nullable()

const VirtualAccountResponse = z.object({
  status: z.string().nullable(),
  ach: Rail,
  wire: Rail,
  rtp: Rail,
  swiftBicCode: z.string().nullable(),
  beneficiary: Party,
  receivingBank: Party,
  accountType: z.string().nullable(),
})

type RailValue = z.infer<typeof Rail>
type PartyValue = z.infer<typeof Party>

type AccountOptions = {
  json?: boolean
}

function printRail(label: string, rail: RailValue): void {
  if (!rail) return
  const acct = rail.accountNumber ?? rail.accountNumberMasked ?? "—"
  console.log(`${label}`)
  console.log(`  Routing number:  ${rail.routingNumber ?? "—"}`)
  console.log(`  Account number:  ${acct}`)
}

function printParty(label: string, party: PartyValue): void {
  if (!party) return
  const candidates = [
    party.name,
    party.addressLine1,
    party.addressLine2,
    [party.city, party.stateProvinceRegion, party.postalCode]
      .filter(Boolean)
      .join(", "),
    party.country,
  ]
  const lines: string[] = []
  for (const c of candidates) {
    if (c && c.trim().length > 0) lines.push(c)
  }
  if (lines.length === 0) return
  console.log(`${label}`)
  for (const line of lines) console.log(`  ${line}`)
}

export async function account(opts: AccountOptions = {}): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }

  const url = `${creds.apiUrl}/accounts/virtual?reveal=1`
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
  printRail("ACH", va.ach)
  printRail("Wire", va.wire)
  printRail("RTP", va.rtp)
  if (va.accountType) console.log(`Account type:    ${va.accountType}`)
  if (va.swiftBicCode) console.log(`SWIFT/BIC:       ${va.swiftBicCode}`)
  if (va.beneficiary || va.receivingBank) console.log("")
  printParty("Beneficiary", va.beneficiary)
  printParty("Receiving bank", va.receivingBank)
  return 0
}
