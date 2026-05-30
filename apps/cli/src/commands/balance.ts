import { z } from "zod"
import { loadCredentials } from "../lib/credentials"

const BalanceResponse = z.object({
  currency: z.literal("USD"),
  amountCents: z.number().int(),
})

type BalanceOptions = {
  json?: boolean
}

function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

export async function balance(opts: BalanceOptions = {}): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }

  const res = await fetch(`${creds.apiUrl}/accounts/balance`, {
    headers: { Authorization: `Bearer ${creds.sessionToken}` },
  })

  if (res.status === 401) {
    console.error("Session expired. Run `bulma login`.")
    return 3
  }
  if (res.status === 404) {
    console.error("No account yet. Run `bulma onboard` first.")
    return 4
  }
  if (!res.ok) {
    console.error(`balance failed: ${res.status}`)
    return 10
  }

  const data = BalanceResponse.parse(await res.json())

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2))
    return 0
  }

  console.log(`Balance: ${formatUsdCents(data.amountCents)} USD`)
  return 0
}
