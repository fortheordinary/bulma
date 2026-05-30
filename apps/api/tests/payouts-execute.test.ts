import { beforeEach, describe, expect, it, mock } from "bun:test"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import {
  payouts as payoutsTable,
  quotes as quotesTable,
  referralCodes,
  referralCredits,
  userProfile,
} from "../src/db/schema"
import { freshDb } from "./helpers/d1"

// --- Auth: stub createAuth so requireUser yields a fixed user without a real
// better-auth/session lookup. Must be mocked before importing the route. ---
const USER_ID = "us_testuser0001"
const SESSION = {
  user: { id: USER_ID, email: "tester@bul.ma", name: "Tester" },
  session: { id: "se_x", token: "t", userId: USER_ID, expiresAt: new Date() },
}
mock.module("../src/lib/auth", () => ({
  createAuth: () => ({ api: { getSession: async () => SESSION } }),
}))

const { payouts } = await import("../src/routes/payouts")

const FREE = "fee_free"
const PAID = "fee_paid"

// --- BlindPay upstream: a controllable global fetch. Each test sets `fetchImpl`;
// `fetchCalls` proves we never hit BlindPay twice for one quote. ---
let fetchCalls = 0
let fetchImpl: (url: string) => Promise<Response> = async () => payoutResponse()
globalThis.fetch = ((async (input: RequestInfo | URL) => {
  fetchCalls++
  return fetchImpl(String(input))
}) as typeof fetch)

function payoutResponse(over: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      id: "po_test0001",
      status: "processing",
      sender_amount: 1000,
      receiver_amount: 5000,
      ...over,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  )
}

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

let sqliteDb: ReturnType<typeof freshDb>["sqlite"]
let env: Record<string, unknown>
let db: ReturnType<typeof drizzle>

beforeEach(() => {
  const fresh = freshDb()
  sqliteDb = fresh.sqlite
  db = drizzle(fresh.DB)
  fetchCalls = 0
  fetchImpl = async () => payoutResponse()
  env = {
    DB: fresh.DB,
    ENVIRONMENT: "test",
    LOG_LEVEL: "fatal",
    BLINDPAY_API_URL: "https://blindpay.test/v1",
    BLINDPAY_INSTANCE_ID: "in_test",
    BLINDPAY_API_KEY: "key",
    BLINDPAY_NETWORK: "polygon_sepolia",
    BLINDPAY_TOKEN: "USDB",
    BLINDPAY_PARTNER_FEE_ID_FREE: FREE,
    BLINDPAY_PARTNER_FEE_ID_PAID: PAID,
  }
})

async function seedProfile(walletAddress: string | null = "0xWALLET") {
  await db.insert(userProfile).values({
    userId: USER_ID,
    onboardingState: "ready",
    receiverId: "re_test",
    walletId: "bl_test",
    walletAddress,
    createdAt: nowSec(),
  })
}

async function seedQuote(opts: {
  id: string
  partnerFeeId: string
  expiresAt?: number
}) {
  await db.insert(quotesTable).values({
    id: opts.id,
    userId: USER_ID,
    bankAccountId: "ba_test",
    currencyType: "sender",
    coverFees: false,
    network: "polygon_sepolia",
    token: "USDB",
    partnerFeeId: opts.partnerFeeId,
    senderAmount: 1000,
    receiverAmount: 5000,
    flatFee: 0,
    partnerFeeAmount: 0,
    expiresAt: opts.expiresAt ?? Date.now() + 5 * 60_000,
    createdAt: nowSec(),
  })
}

async function seedCredit() {
  await db.insert(referralCodes).values({
    id: "rc_source0001",
    ownerUserId: USER_ID,
    code: "ABCDEF",
    status: "converted",
    createdAt: nowSec(),
  })
  await db.insert(referralCredits).values({
    id: "rcr_credit0001",
    userId: USER_ID,
    sourceCodeId: "rc_source0001",
    status: "available",
    createdAt: nowSec(),
  })
}

function execute(body: unknown, headers: Record<string, string> = {}) {
  return payouts.request(
    "/execute",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    env,
  )
}

describe("POST /payouts/execute", () => {
  it("creates a paid payout and records it (happy path)", async () => {
    await seedProfile()
    await seedQuote({ id: "qu_paid", partnerFeeId: PAID })

    const res = await execute({ quoteId: "qu_paid" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      payoutId: "po_test0001",
      status: "pending", // BlindPay "processing" normalizes to pending
      freeCreditApplied: false,
    })
    expect(fetchCalls).toBe(1)

    const row = await db
      .select()
      .from(payoutsTable)
      .where(eq(payoutsTable.id, "po_test0001"))
      .get()
    expect(row?.userId).toBe(USER_ID)
  })

  it("returns 404 when the user has no account (no wallet address)", async () => {
    await seedProfile(null)
    await seedQuote({ id: "qu_paid", partnerFeeId: PAID })

    const res = await execute({ quoteId: "qu_paid" })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("no_account")
    expect(fetchCalls).toBe(0)
  })

  it("returns 404 for an unknown quote and leaves no idempotency claim", async () => {
    await seedProfile()
    const res = await execute({ quoteId: "qu_missing" })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("quote_not_found")
    expect(fetchCalls).toBe(0)
    // Claim was released, so a corrected retry can proceed.
    const claims = await db
      .select()
      .from((await import("../src/db/schema")).idempotencyKeys)
      .all()
    expect(claims.length).toBe(0)
  })

  it("rejects an expired quote with 409 and never calls BlindPay", async () => {
    await seedProfile()
    await seedQuote({
      id: "qu_old",
      partnerFeeId: PAID,
      expiresAt: Date.now() - 1000,
    })

    const res = await execute({ quoteId: "qu_old" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("quote_expired")
    expect(fetchCalls).toBe(0)
  })

  it("replays a finalized execute without moving money twice", async () => {
    await seedProfile()
    await seedQuote({ id: "qu_paid", partnerFeeId: PAID })

    const first = await execute({ quoteId: "qu_paid" })
    const second = await execute({ quoteId: "qu_paid" })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.json()).toEqual(await second.json())
    expect(fetchCalls).toBe(1) // second was a replay
  })

  it("refuses a concurrent duplicate with 409 request_in_progress", async () => {
    await seedProfile()
    await seedQuote({ id: "qu_paid", partnerFeeId: PAID })

    let release: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    fetchImpl = async () => {
      await gate
      return payoutResponse()
    }

    const p1 = execute({ quoteId: "qu_paid" })
    const p2 = execute({ quoteId: "qu_paid" })
    // Let both reach their decision point: winner gated on fetch, loser bailed.
    await new Promise((r) => setTimeout(r, 50))
    release()
    const [r1, r2] = await Promise.all([p1, p2])

    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 409])
    const conflict = r1.status === 409 ? r1 : r2
    expect((await conflict.json()).error).toBe("request_in_progress")
    expect(fetchCalls).toBe(1)
  })

  it("reuses an idempotency key with a different quote -> 409 key_reused", async () => {
    await seedProfile()
    await seedQuote({ id: "qu_a", partnerFeeId: PAID })
    await seedQuote({ id: "qu_b", partnerFeeId: PAID })

    const first = await execute({ quoteId: "qu_a" }, {
      "Idempotency-Key": "shared-key",
    })
    expect(first.status).toBe(200)
    const second = await execute({ quoteId: "qu_b" }, {
      "Idempotency-Key": "shared-key",
    })
    expect(second.status).toBe(409)
    expect((await second.json()).error).toBe("idempotency_key_reused")
    expect(fetchCalls).toBe(1)
  })

  it("applies a referral credit on a free quote and commits it", async () => {
    await seedProfile()
    await seedCredit()
    await seedQuote({ id: "qu_free", partnerFeeId: FREE })

    const res = await execute({ quoteId: "qu_free" })
    expect(res.status).toBe(200)
    expect((await res.json()).freeCreditApplied).toBe(true)

    const credit = await db
      .select()
      .from(referralCredits)
      .where(eq(referralCredits.id, "rcr_credit0001"))
      .get()
    expect(credit?.status).toBe("consumed")
    expect(credit?.consumedPayoutId).toBe("po_test0001")

    // Source slot recycled back to available with a fresh code.
    const code = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.id, "rc_source0001"))
      .get()
    expect(code?.status).toBe("available")
    expect(code?.code).not.toBe("ABCDEF")
  })

  it("refuses a free quote when no credit is available (exhaustion)", async () => {
    await seedProfile()
    await seedQuote({ id: "qu_free", partnerFeeId: FREE }) // no credit seeded

    const res = await execute({ quoteId: "qu_free" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("credit_no_longer_available")
    expect(fetchCalls).toBe(0)
  })

  it("rolls back the credit and releases the key when BlindPay fails", async () => {
    await seedProfile()
    await seedCredit()
    await seedQuote({ id: "qu_free", partnerFeeId: FREE })

    fetchImpl = async () =>
      new Response(JSON.stringify({ message: "upstream boom" }), {
        status: 500,
      })

    const res = await execute({ quoteId: "qu_free" })
    expect(res.status).toBe(502)

    // Credit returned to available so a retry can re-reserve it.
    const credit = await db
      .select()
      .from(referralCredits)
      .where(eq(referralCredits.id, "rcr_credit0001"))
      .get()
    expect(credit?.status).toBe("available")
    expect(credit?.consumedAt).toBeNull()

    // Idempotency claim released -> a corrected retry succeeds.
    fetchImpl = async () => payoutResponse()
    const retry = await execute({ quoteId: "qu_free" })
    expect(retry.status).toBe(200)
    expect((await retry.json()).freeCreditApplied).toBe(true)
  })
})
