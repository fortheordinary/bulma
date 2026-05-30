import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import {
  payouts as payoutsTable,
  quotes as quotesTable,
  referralCredits,
  userProfile,
} from "../db/schema"
import { createBlindPay, BlindPayError } from "../lib/blindpay"
import {
  beginIdempotent,
  finalizeIdempotent,
  MAX_CLIENT_KEY_LEN,
  releaseIdempotent,
  scopedKey,
} from "../lib/idempotency"
import { isQuoteExpired, normalizePayoutStatus } from "../lib/payouts"
import {
  commitReferralCredit,
  hasAvailableReferralCredit,
  reserveReferralCredit,
  unreserveReferralCredit,
} from "../lib/referrals"
import { requireUser, type AuthContext } from "../middleware/require-user"
import type { Bindings } from "../lib/env"

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

const QuoteRequest = z
  .object({
    recipientId: z.string().min(1),
    amountCents: z.number().int().positive(),
  })
  .openapi("PayoutQuoteRequest")

const QuoteView = z
  .object({
    quoteId: z.string(),
    expiresAt: z.number(),
    senderAmountCents: z.number().int(),
    receiverAmount: z.number().int(),
    flatFeeCents: z.number().int(),
    partnerFeeCents: z.number().int(),
  })
  .openapi("PayoutQuoteView")

const ExecuteRequest = z
  .object({ quoteId: z.string().min(1) })
  .openapi("PayoutExecuteRequest")

const PayoutStatusEnum = z.enum(["pending", "completed", "failed", "refunded"])

const PayoutView = z
  .object({
    payoutId: z.string(),
    status: PayoutStatusEnum,
    senderAmountCents: z.number().int().nullable(),
    receiverAmount: z.number().int().nullable(),
    freeCreditApplied: z.boolean(),
  })
  .openapi("PayoutView")

const ErrorResponse = z
  .object({ error: z.string(), detail: z.string().optional() })
  .openapi("PayoutErrorResponse")

export const payouts = new OpenAPIHono<{
  Bindings: Bindings
  Variables: AuthContext
}>()

payouts.use("*", requireUser)

function blindpayError(
  err: unknown,
): {
  error: string
  detail?: string
} {
  if (err instanceof BlindPayError) {
    const detail =
      typeof err.body === "object" && err.body !== null && "message" in err.body
        ? String((err.body as { message: unknown }).message)
        : undefined
    return { error: "blindpay_error", detail }
  }
  return { error: "blindpay_unavailable" }
}

const quoteRoute = createRoute({
  method: "post",
  path: "/quote",
  tags: ["payouts"],
  summary: "Quote a payout to a recipient",
  security: [{ Bearer: [] }, { Cookie: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: QuoteRequest } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: QuoteView } },
      description: "Quote (valid 5 minutes)",
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

payouts.openapi(quoteRoute, async (c) => {
  const user = c.get("user")
  const { recipientId, amountCents } = QuoteRequest.parse(await c.req.json())
  const db = drizzle(c.env.DB)

  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()
  if (!profile?.receiverId || !profile.walletId) {
    return c.json({ error: "no_account" }, 404)
  }

  const blindpay = createBlindPay(c.env)

  // Ownership check: the bank account must belong to this user's receiver,
  // otherwise an attacker who guessed/learned another user's `ba_…` id could
  // settle a payout into someone else's account from their own balance.
  try {
    const owned = await blindpay.listBankAccounts(profile.receiverId)
    if (!owned.some((a) => a.id === recipientId)) {
      return c.json({ error: "recipient_not_found" }, 404)
    }
  } catch (err) {
    return c.json(blindpayError(err), 502)
  }

  // Pick partner-fee config: free if a referral credit is on file (consumed at
  // execute, FIFO), paid otherwise. The quote preview thus matches the fee the
  // user will actually pay on execute.
  const willApplyCredit = await hasAvailableReferralCredit(db, user.id)
  const partnerFeeId = willApplyCredit
    ? c.env.BLINDPAY_PARTNER_FEE_ID_FREE
    : c.env.BLINDPAY_PARTNER_FEE_ID_PAID

  try {
    const quote = await blindpay.createQuote({
      bank_account_id: recipientId,
      currency_type: "sender",
      cover_fees: false,
      request_amount: amountCents,
      network: c.env.BLINDPAY_NETWORK,
      token: c.env.BLINDPAY_TOKEN,
      partner_fee_id: partnerFeeId,
    })
    await db
      .insert(quotesTable)
      .values({
        id: quote.id,
        userId: user.id,
        bankAccountId: recipientId,
        currencyType: "sender",
        coverFees: false,
        network: c.env.BLINDPAY_NETWORK,
        token: c.env.BLINDPAY_TOKEN,
        partnerFeeId,
        senderAmount: quote.sender_amount,
        receiverAmount: quote.receiver_amount,
        flatFee: quote.flat_fee ?? 0,
        partnerFeeAmount: quote.partner_fee_amount ?? 0,
        expiresAt: quote.expires_at,
        createdAt: nowSec(),
      })
      .onConflictDoNothing()
    return c.json(
      {
        quoteId: quote.id,
        expiresAt: quote.expires_at,
        senderAmountCents: quote.sender_amount,
        receiverAmount: quote.receiver_amount,
        flatFeeCents: quote.flat_fee ?? 0,
        partnerFeeCents: quote.partner_fee_amount ?? 0,
      },
      200,
    )
  } catch (err) {
    return c.json(blindpayError(err), 502)
  }
})

const executeRoute = createRoute({
  method: "post",
  path: "/execute",
  tags: ["payouts"],
  summary: "Execute a previously quoted payout",
  description:
    "Idempotent. Send an `Idempotency-Key` header (defaults to the quoteId) to " +
    "make a retried execute safe: a replay returns the original payout instead " +
    "of moving money twice.",
  security: [{ Bearer: [] }, { Cookie: [] }],
  request: {
    headers: z.object({
      "idempotency-key": z.string().max(MAX_CLIENT_KEY_LEN).optional(),
    }),
    body: {
      required: true,
      content: { "application/json": { schema: ExecuteRequest } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: PayoutView } },
      description: "Payout created (or replayed); status reflects BlindPay",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "No account / quote not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponse } },
      description:
        "Quote expired / referral credit gone / idempotency conflict / " +
        "request still in progress",
    },
    502: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "BlindPay upstream error",
    },
  },
})

payouts.openapi(executeRoute, async (c) => {
  const user = c.get("user")
  const { quoteId } = ExecuteRequest.parse(await c.req.json())
  const db = drizzle(c.env.DB)

  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()
  if (!profile?.walletAddress) return c.json({ error: "no_account" }, 404)

  // Idempotency key, scoped to this user so it can never collide with — or
  // replay — another user's payout. Defaults to the quoteId: re-executing the
  // same quote is itself a duplicate, so even a client that omits the header is
  // protected. The claim below is the lock that makes execute double-spend safe.
  const headerKey = c.req.header("Idempotency-Key")?.trim()
  const clientKey =
    headerKey && headerKey.length > 0 && headerKey.length <= MAX_CLIENT_KEY_LEN
      ? headerKey
      : quoteId
  const idemKey = scopedKey(user.id, clientKey)
  const claim = await beginIdempotent(
    db,
    idemKey,
    JSON.stringify({ quoteId }),
    nowSec(),
  )
  if (claim.kind === "replay") {
    return c.json(claim.response as z.infer<typeof PayoutView>, 200)
  }
  if (claim.kind === "in_flight") {
    // A concurrent execute already holds this key and is mid-flight against
    // BlindPay. Refuse rather than fire a second payout for the same quote.
    return c.json({ error: "request_in_progress" }, 409)
  }
  if (claim.kind === "conflict") {
    return c.json({ error: "idempotency_key_reused" }, 409)
  }

  // claim.kind === "fresh": we hold the key. Every early return from here on
  // must release it (so a corrected retry can proceed) or finalize it (so a
  // replay returns the same result).
  const quote = await db
    .select()
    .from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.userId, user.id)))
    .get()
  if (!quote) {
    await releaseIdempotent(db, idemKey)
    return c.json({ error: "quote_not_found" }, 404)
  }
  if (isQuoteExpired(quote.expiresAt)) {
    await releaseIdempotent(db, idemKey)
    return c.json({ error: "quote_expired" }, 409)
  }

  // If the quote was priced with the FREE partner-fee config, reserve a credit
  // *before* executing on BlindPay. If no credit is available, refuse — the
  // user must re-quote at the paid rate. Reserving here avoids charging $0 at
  // BlindPay while the local credit was concurrently spent on another payout.
  const quoteIsFree = quote.partnerFeeId === c.env.BLINDPAY_PARTNER_FEE_ID_FREE
  let reservation: {
    creditId: string
    sourceCodeId: string
  } | null = null
  if (quoteIsFree) {
    reservation = await reserveReferralCredit(db, user.id)
    if (!reservation) {
      await releaseIdempotent(db, idemKey)
      return c.json({ error: "credit_no_longer_available" }, 409)
    }
  }

  const blindpay = createBlindPay(c.env)
  let payout: Awaited<ReturnType<typeof blindpay.createPayoutEvm>>
  try {
    payout = await blindpay.createPayoutEvm({
      quote_id: quoteId,
      sender_wallet_address: profile.walletAddress,
    })
  } catch (err) {
    if (reservation) await unreserveReferralCredit(db, reservation)
    await releaseIdempotent(db, idemKey)
    return c.json(blindpayError(err), 502)
  }

  const status = normalizePayoutStatus(payout.status)
  const senderAmount = payout.sender_amount ?? quote.senderAmount
  const receiverAmount = payout.receiver_amount ?? quote.receiverAmount
  await db
    .insert(payoutsTable)
    .values({
      id: payout.id,
      userId: user.id,
      quoteId,
      bankAccountId: quote.bankAccountId,
      status: payout.status ?? status,
      senderAmount,
      receiverAmount,
      senderWalletAddress: profile.walletAddress,
      createdAt: nowSec(),
      updatedAt: nowSec(),
    })
    .onConflictDoNothing()

  if (reservation) {
    await commitReferralCredit(db, reservation, payout.id)
  }
  const freeCreditApplied = reservation !== null

  const view: z.infer<typeof PayoutView> = {
    payoutId: payout.id,
    status,
    senderAmountCents: senderAmount,
    receiverAmount,
    freeCreditApplied,
  }
  await finalizeIdempotent(db, idemKey, 200, view)
  return c.json(view, 200)
})

const statusRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["payouts"],
  summary: "Payout status",
  security: [{ Bearer: [] }, { Cookie: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: PayoutView } },
      description: "Current payout status (refreshed from BlindPay)",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Payout not found",
    },
    502: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "BlindPay upstream error",
    },
  },
})

payouts.openapi(statusRoute, async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!id) return c.json({ error: "payout_not_found" }, 404)
  const db = drizzle(c.env.DB)

  const local = await db
    .select()
    .from(payoutsTable)
    .where(and(eq(payoutsTable.id, id), eq(payoutsTable.userId, user.id)))
    .get()
  if (!local) return c.json({ error: "payout_not_found" }, 404)

  const credited = await db
    .select({ id: referralCredits.id })
    .from(referralCredits)
    .where(eq(referralCredits.consumedPayoutId, id))
    .get()
  const freeCreditApplied = Boolean(credited)

  const blindpay = createBlindPay(c.env)
  try {
    const fresh = await blindpay.getPayout(id)
    if (fresh.status && fresh.status !== local.status) {
      await db
        .update(payoutsTable)
        .set({ status: fresh.status, updatedAt: nowSec() })
        .where(eq(payoutsTable.id, id))
    }
    return c.json(
      {
        payoutId: id,
        status: normalizePayoutStatus(fresh.status ?? local.status),
        senderAmountCents: local.senderAmount,
        receiverAmount: local.receiverAmount,
        freeCreditApplied,
      },
      200,
    )
  } catch {
    // Fall back to the last known local status if BlindPay is unreachable.
    return c.json(
      {
        payoutId: id,
        status: normalizePayoutStatus(local.status),
        senderAmountCents: local.senderAmount,
        receiverAmount: local.receiverAmount,
        freeCreditApplied,
      },
      200,
    )
  }
})
