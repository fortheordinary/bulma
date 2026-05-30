import { createInterface } from "node:readline/promises"
import { z } from "zod"
import { loadCredentials, type Credentials } from "../lib/credentials"

const RecipientView = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().nullable(),
  summary: z.string(),
})
const QuoteView = z.object({
  quoteId: z.string(),
  expiresAt: z.number(),
  senderAmountCents: z.number().int(),
  receiverAmount: z.number().int(),
  flatFeeCents: z.number().int(),
  partnerFeeCents: z.number().int(),
})
const PayoutView = z.object({
  payoutId: z.string(),
  status: z.enum(["pending", "completed", "failed", "refunded"]),
  senderAmountCents: z.number().int().nullable(),
  receiverAmount: z.number().int().nullable(),
  freeCreditApplied: z.boolean(),
})

function authHeaders(creds: Credentials): Record<string, string> {
  return { Authorization: `Bearer ${creds.sessionToken}` }
}

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

function parseUsdToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const cents = Math.round(Number(cleaned) * 100)
  return cents > 0 ? cents : null
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 ? args[idx + 1] : undefined
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

async function pollUntilTerminal(
  creds: Credentials,
  id: string,
): Promise<z.infer<typeof PayoutView> | null> {
  const deadline = Date.now() + 40_000
  let last = ""
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000))
    const res = await fetch(`${creds.apiUrl}/payouts/${id}`, {
      headers: authHeaders(creds),
    })
    if (!res.ok) continue
    const view = PayoutView.parse(await res.json())
    if (view.status !== last) {
      console.log(`  status: ${view.status}`)
      last = view.status
    }
    if (view.status !== "pending") return view
  }
  return null
}

async function run(
  creds: Credentials,
  args: string[],
  json: boolean,
): Promise<number> {
  const interactive = Boolean(process.stdin.isTTY)

  // 1. Recipient
  let recipientId = flagValue(args, "recipient")
  if (!recipientId) {
    const res = await fetch(`${creds.apiUrl}/recipients`, {
      headers: authHeaders(creds),
    })
    if (res.status === 404) {
      console.error("No account yet. Run `bulma onboard` first.")
      return 4
    }
    if (!res.ok) {
      console.error(`could not load recipients: ${res.status}`)
      return 10
    }
    const rows = z.array(RecipientView).parse(await res.json())
    if (rows.length === 0) {
      console.error("No recipients. Add one with `bulma recipient add`.")
      return 4
    }
    if (interactive) {
      console.log("Recipients:")
      rows.forEach((r, i) =>
        console.log(`  ${i + 1}. ${r.summary} — ${r.name ?? "—"}`),
      )
      const pick = await promptLine("Pay which recipient? [number]: ")
      recipientId = rows[Number(pick) - 1]?.id
    } else if (rows.length === 1) {
      recipientId = rows[0]?.id
    }
  }
  if (!recipientId) {
    console.error("No recipient selected. Pass --recipient <id>.")
    return 2
  }

  // 2. Amount
  let amountRaw = flagValue(args, "amount")
  if (!amountRaw && interactive) amountRaw = await promptLine("Amount (USD): ")
  const amountCents = amountRaw ? parseUsdToCents(amountRaw) : null
  if (!amountCents) {
    console.error("Invalid or missing --amount (USD).")
    return 2
  }

  // 3. Quote
  const quoteRes = await fetch(`${creds.apiUrl}/payouts/quote`, {
    method: "POST",
    headers: { ...authHeaders(creds), "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId, amountCents }),
  })
  if (quoteRes.status === 404) {
    console.error("No account yet. Run `bulma onboard` first.")
    return 4
  }
  if (!quoteRes.ok) {
    const e = await quoteRes.json().catch(() => ({}))
    const detail = (e as { detail?: string }).detail
    console.error(
      `quote failed: ${quoteRes.status}${detail ? ` — ${detail}` : ""}`,
    )
    return 10
  }
  const quote = QuoteView.parse(await quoteRes.json())

  console.log("")
  console.log("Payout quote")
  console.log(`  You send:           ${usd(quote.senderAmountCents)} USD`)
  console.log(
    `  Fee:                ${usd(quote.flatFeeCents + quote.partnerFeeCents)}`,
  )
  console.log(
    `  Recipient receives: ${(quote.receiverAmount / 100).toFixed(2)} (local currency)`,
  )
  console.log("")

  // 4. Confirm
  const yes = args.includes("--yes") || args.includes("-y")
  if (!yes) {
    if (!interactive) {
      console.error("Pass --yes to confirm the payout.")
      return 2
    }
    const ans = (await promptLine("Send this payout? [y/N]: ")).toLowerCase()
    if (ans !== "y" && ans !== "yes") {
      console.log("Cancelled.")
      return 0
    }
  }

  // 5. Execute
  const execRes = await fetch(`${creds.apiUrl}/payouts/execute`, {
    method: "POST",
    headers: { ...authHeaders(creds), "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId: quote.quoteId }),
  })
  if (execRes.status === 409) {
    const body = (await execRes.json().catch(() => ({}))) as { error?: string }
    if (body.error === "credit_no_longer_available") {
      console.error(
        "Your free-payout credit was used by another payout. Run `bulma payout` again to re-quote.",
      )
    } else {
      console.error("Quote expired. Run `bulma payout` again.")
    }
    return 5
  }
  if (!execRes.ok) {
    const e = await execRes.json().catch(() => ({}))
    const detail = (e as { detail?: string }).detail
    console.error(
      `payout failed: ${execRes.status}${detail ? ` — ${detail}` : ""}`,
    )
    return 10
  }
  let view = PayoutView.parse(await execRes.json())
  console.log(`Payout ${view.payoutId}`)
  if (view.freeCreditApplied) console.log("  ★ Free payout credit applied")
  console.log(`  status: ${view.status}`)

  // 6. Poll to terminal
  if (view.status === "pending") {
    const final = await pollUntilTerminal(creds, view.payoutId)
    if (final) view = final
  }

  if (json) console.log(JSON.stringify(view, null, 2))
  if (view.status === "completed") console.log("✓ Payout completed")
  else if (view.status === "failed") console.log("✗ Payout failed")
  else if (view.status === "refunded") console.log("↩ Payout refunded")
  return view.status === "completed" ? 0 : view.status === "pending" ? 0 : 6
}

async function status(
  creds: Credentials,
  id: string,
  json: boolean,
): Promise<number> {
  if (!id) {
    console.error("Usage: bulma payout status <id>")
    return 2
  }
  const res = await fetch(`${creds.apiUrl}/payouts/${id}`, {
    headers: authHeaders(creds),
  })
  if (res.status === 404) {
    console.error("Payout not found.")
    return 4
  }
  if (!res.ok) {
    console.error(`payout status failed: ${res.status}`)
    return 10
  }
  const view = PayoutView.parse(await res.json())
  if (json) {
    console.log(JSON.stringify(view, null, 2))
    return 0
  }
  console.log(`Payout ${view.payoutId}: ${view.status}`)
  return 0
}

export async function payout(args: string[]): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }
  const json = args.includes("--json")
  if (args[0] === "status") return status(creds, args[1] ?? "", json)
  return run(creds, args, json)
}
