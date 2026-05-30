import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { userProfile } from "../db/schema"
import { createBlindPay, BlindPayError } from "../lib/blindpay"
import { walletBalanceToCents } from "../lib/money"
import { requireUser, type AuthContext } from "../middleware/require-user"
import type { Bindings } from "../lib/env"

// Read-through balance cache, 10s per wallet. Keyed by the BlindPay wallet id
// (`bl_…`); a user can only ever query their own single wallet, so no
// cross-user leakage. Module scope persists for the life of the isolate.
const BALANCE_TTL_MS = 10_000
type BalanceCacheEntry = {
  cents: number
  expires: number
}
const balanceCache = new Map<string, BalanceCacheEntry>()

type BlindPayRail = {
  routing_number?: string
  account_number?: string
}

function maskAccountNumber(n: string | undefined): string | null {
  if (!n) return null
  if (n.length <= 4) return n
  return `••••${n.slice(-4)}`
}

const RailResponse = z.object({
  routingNumber: z.string().nullable(),
  accountNumber: z.string().nullable(),
  accountNumberMasked: z.string().nullable(),
})

const VirtualAccountResponse = z
  .object({
    status: z.string().nullable(),
    ach: RailResponse.nullable(),
    wire: RailResponse.nullable(),
    rtp: RailResponse.nullable(),
    beneficiary: z.unknown().nullable(),
    accountType: z.string().nullable(),
  })
  .openapi("AccountVirtualResponse")

const ErrorResponse = z
  .object({ error: z.string() })
  .openapi("AccountErrorResponse")

const BalanceResponse = z
  .object({
    currency: z.literal("USD"),
    amountCents: z.number().int(),
  })
  .openapi("AccountBalanceResponse")

export const accounts = new OpenAPIHono<{
  Bindings: Bindings
  Variables: AuthContext
}>()

accounts.use("*", requireUser)

const virtualRoute = createRoute({
  method: "get",
  path: "/virtual",
  tags: ["accounts"],
  summary: "US virtual account instructions",
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: VirtualAccountResponse } },
      description:
        "Virtual account details (account number masked unless reveal=1)",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "No virtual account provisioned",
    },
    502: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "BlindPay upstream error",
    },
  },
})

accounts.openapi(virtualRoute, async (c) => {
  const user = c.get("user")
  const reveal = c.req.query("reveal") === "1"
  const db = drizzle(c.env.DB)

  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()

  if (!profile?.virtualAccountId || !profile.receiverId) {
    return c.json({ error: "no_virtual_account" }, 404)
  }

  const blindpay = createBlindPay(c.env)
  try {
    const va = await blindpay.getVirtualAccount(
      profile.receiverId,
      profile.virtualAccountId,
    )
    const rail = (r: BlindPayRail | undefined) =>
      r
        ? {
            routingNumber: r.routing_number ?? null,
            accountNumber: reveal ? (r.account_number ?? null) : null,
            accountNumberMasked: maskAccountNumber(r.account_number),
          }
        : null
    return c.json(
      {
        status: va.kyc_status ?? va.status ?? null,
        ach: rail(va.us?.ach),
        wire: rail(va.us?.wire),
        rtp: rail(va.us?.rtp),
        beneficiary: va.us?.beneficiary ?? null,
        accountType: va.us?.account_type ?? null,
      },
      200,
    )
  } catch (err) {
    const status = err instanceof BlindPayError ? err.status : 0
    console.error("blindpay get virtual-account failed", { status })
    return c.json({ error: "blindpay_unavailable" }, 502)
  }
})

const balanceRoute = createRoute({
  method: "get",
  path: "/balance",
  tags: ["accounts"],
  summary: "Account balance in USD",
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: BalanceResponse } },
      description: "Current balance, in USD cents",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "No account provisioned",
    },
    502: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "BlindPay upstream error",
    },
  },
})

accounts.openapi(balanceRoute, async (c) => {
  const user = c.get("user")
  const db = drizzle(c.env.DB)

  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()

  if (!profile?.walletId || !profile.receiverId) {
    return c.json({ error: "no_account" }, 404)
  }

  const now = Date.now()
  const cached = balanceCache.get(profile.walletId)
  if (cached && cached.expires > now) {
    return c.json({ currency: "USD" as const, amountCents: cached.cents }, 200)
  }

  const blindpay = createBlindPay(c.env)
  try {
    const balances = await blindpay.getWalletBalance(
      profile.receiverId,
      profile.walletId,
    )
    // Single token per instance (env.BLINDPAY_TOKEN): USDB on dev, USDC on prod.
    const cents = walletBalanceToCents(balances, c.env.BLINDPAY_TOKEN)
    balanceCache.set(profile.walletId, { cents, expires: now + BALANCE_TTL_MS })
    return c.json({ currency: "USD" as const, amountCents: cents }, 200)
  } catch (err) {
    const status = err instanceof BlindPayError ? err.status : 0
    console.error("blindpay get wallet-balance failed", { status })
    return c.json({ error: "blindpay_unavailable" }, 502)
  }
})
