import { beforeEach, describe, expect, it, mock } from "bun:test"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { referralCodes, userProfile } from "../src/db/schema"
import { freshDb } from "./helpers/d1"

// --- Auth: stub createAuth so requireUser yields a fixed user. Must be mocked
// before importing the route. ---
const USER_ID = "us_referee00001"
const OWNER_ID = "us_owner000001"
const SESSION = {
  user: { id: USER_ID, email: "referee@bul.ma", name: "Referee" },
  session: { id: "se_x", token: "t", userId: USER_ID, expiresAt: new Date() },
}
mock.module("../src/lib/auth", () => ({
  createAuth: () => ({ api: { getSession: async () => SESSION } }),
}))

const { onboard } = await import("../src/routes/onboard")

// --- BlindPay upstream: a controllable global fetch. The mandatory-referral
// gate must reject *before* this is ever called. ---
let fetchCalls = 0
globalThis.fetch = ((async () => {
  fetchCalls++
  return new Response(JSON.stringify({ token: "tok_test" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}) as typeof fetch)

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

let db: ReturnType<typeof drizzle>
let env: Record<string, unknown>

beforeEach(() => {
  const fresh = freshDb()
  db = drizzle(fresh.DB)
  fetchCalls = 0
  env = {
    DB: fresh.DB,
    ENVIRONMENT: "test",
    LOG_LEVEL: "fatal",
    BLINDPAY_API_URL: "https://blindpay.test/v1",
    BLINDPAY_INSTANCE_ID: "in_test",
    BLINDPAY_API_KEY: "key",
    BLINDPAY_HOSTED_INVITE_URL: "https://invite.test/start",
  }
})

function start(body: unknown) {
  return onboard.request(
    "/start",
    {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify(body),
    },
    env,
  )
}

async function seedCode(code: string, over: Record<string, unknown> = {}) {
  await db.insert(referralCodes).values({
    id: `rc_${code}`,
    ownerUserId: OWNER_ID,
    code,
    status: "available",
    createdAt: nowSec(),
    ...over,
  })
}

describe("POST /onboard/start — mandatory referral", () => {
  it("rejects a new user with no referral code (400, no BlindPay call)", async () => {
    const res = await start({})
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "referral_required" })
    expect(fetchCalls).toBe(0)
  })

  it("rejects an unknown referral code", async () => {
    const res = await start({ referralCode: "ZZZZZZ" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "invalid_referral_code" })
    expect(fetchCalls).toBe(0)
  })

  it("attaches a valid code and proceeds to KYC", async () => {
    await seedCode("ABCDEF")
    const res = await start({ referralCode: "abcdef" })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ state: "pending" })
    expect(fetchCalls).toBe(1)
    const row = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, "ABCDEF"))
      .get()
    expect(row?.convertedUserId).toBe(USER_ID)
    expect(row?.status).toBe("shared")
  })

  it("exempts a user who already attached a code on re-run with no code", async () => {
    await seedCode("ABCDEF", { status: "shared", convertedUserId: USER_ID })
    const res = await start({})
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ state: "pending" })
    expect(fetchCalls).toBe(1)
  })
})
