import { z } from "zod"
import { loadCredentials, type Credentials } from "../lib/credentials"

const Slot = z.object({
  code: z.string(),
  status: z.enum(["available", "shared", "converted", "expired"]),
  sharedAt: z.number().nullable(),
  convertedAt: z.number().nullable(),
  link: z.string(),
})
const ReferralsView = z.object({
  slots: z.array(Slot),
  credits: z.object({
    available: z.number().int(),
    consumed: z.number().int(),
    expired: z.number().int(),
  }),
})
const ShareView = z.object({
  code: z.string(),
  link: z.string(),
  slotsRemaining: z.number().int(),
})
const CreditsView = z.object({
  available: z.number().int(),
  consumed: z.number().int(),
  expired: z.number().int(),
})

type Options = { json?: boolean }

function authHeaders(creds: Credentials): Record<string, string> {
  return { Authorization: `Bearer ${creds.sessionToken}` }
}

async function list(creds: Credentials, opts: Options): Promise<number> {
  const res = await fetch(`${creds.apiUrl}/referrals`, {
    headers: authHeaders(creds),
  })
  if (res.status === 401) {
    console.error("Session expired. Run `bulma login`.")
    return 3
  }
  if (!res.ok) {
    console.error(`referral list failed: ${res.status}`)
    return 10
  }
  const data = ReferralsView.parse(await res.json())
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2))
    return 0
  }
  if (data.slots.length === 0) {
    console.log(
      "No referral codes yet. Finish onboarding first (`bulma onboard`).",
    )
    return 0
  }
  console.log("Referral codes")
  console.log("==============")
  for (const s of data.slots) {
    const tag =
      s.status === "available"
        ? "○ available"
        : s.status === "shared"
          ? "→ shared"
          : s.status === "converted"
            ? "★ converted"
            : "✗ expired"
    console.log(`  ${s.code}   ${tag}`)
  }
  console.log("")
  console.log(`Free payout credits: ${data.credits.available} available`)
  console.log("Share a code:  bulma referral share <code>")
  return 0
}

async function share(
  creds: Credentials,
  code: string,
  opts: Options,
): Promise<number> {
  if (!code) {
    console.error("Usage: bulma referral share <code>")
    return 2
  }
  const res = await fetch(`${creds.apiUrl}/referrals/share`, {
    method: "POST",
    headers: { ...authHeaders(creds), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })
  if (res.status === 404) {
    console.error("Code not found (is it one of yours? run `bulma referral`).")
    return 4
  }
  if (res.status === 409) {
    console.error("That code is already converted or expired.")
    return 6
  }
  if (!res.ok) {
    console.error(`referral share failed: ${res.status}`)
    return 10
  }
  const data = ShareView.parse(await res.json())
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2))
    return 0
  }
  console.log("Share your invite:")
  console.log(`  ${data.link}`)
  console.log("")
  console.log(
    "The recipient must finish onboarding for you to earn the free payout.",
  )
  console.log(`${data.slotsRemaining} slots remaining.`)
  return 0
}

async function status(creds: Credentials, opts: Options): Promise<number> {
  const res = await fetch(`${creds.apiUrl}/referrals/credits`, {
    headers: authHeaders(creds),
  })
  if (!res.ok) {
    console.error(`referral status failed: ${res.status}`)
    return 10
  }
  const data = CreditsView.parse(await res.json())
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2))
    return 0
  }
  console.log(`Free payout credits: ${data.available} available`)
  console.log(`  ${data.consumed} used, ${data.expired} expired`)
  return 0
}

export async function referral(args: string[]): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }
  const opts: Options = { json: args.includes("--json") }
  const sub = args[0]
  switch (sub) {
    case "share":
      return share(creds, args[1] ?? "", opts)
    case "status":
      return status(creds, opts)
    case undefined:
    case "list":
      return list(creds, opts)
    default:
      // bare `bulma referral --json` (sub is the flag)
      if (sub.startsWith("--")) return list(creds, opts)
      console.error("Usage: bulma referral [list|share <code>|status]")
      return 2
  }
}
