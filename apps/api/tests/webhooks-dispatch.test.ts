import { beforeEach, describe, expect, it } from "bun:test"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { userProfile, webhookEvents } from "../src/db/schema"
import { computeSvixSignature } from "../src/lib/svix"
import { webhooks } from "../src/routes/webhooks"
import { freshDb } from "./helpers/d1"

// Regression: BlindPay sends a FLAT payload with the event type in
// `webhook_event` (not a nested `{ event_type, data }`). The old code read
// `event_type` + `data.*`, so every event landed as "unknown" and was dropped
// silently — leaving approved users stuck at `pending`. These tests pin the
// real wire format.

const SECRET = "whsec_plJ3nmyCDGBKInavdOK15jsl"
const USER_ID = "us_gui00000001"
const RECEIVER_ID = "re_2DWix15QAqCq"

let db: ReturnType<typeof drizzle>
let env: Record<string, unknown>

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

beforeEach(async () => {
  const fresh = freshDb()
  db = drizzle(fresh.DB)
  env = {
    DB: fresh.DB,
    ENVIRONMENT: "test",
    LOG_LEVEL: "fatal",
    BLINDPAY_WEBHOOK_SECRET: SECRET,
  }
  await db.insert(userProfile).values({
    userId: USER_ID,
    onboardingState: "pending",
    receiverId: RECEIVER_ID,
    createdAt: nowSec(),
  })
})

async function postWebhook(payloadObj: unknown) {
  const payload = JSON.stringify(payloadObj)
  const ts = String(nowSec())
  const msgId = "msg_test00000001"
  const sig = await computeSvixSignature({
    msgId,
    timestamp: ts,
    payload,
    secret: SECRET,
  })
  const req = new Request("http://localhost/blindpay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": msgId,
      "svix-timestamp": ts,
      "svix-signature": `v1,${sig}`,
    },
    body: payload,
  })
  // Capture waitUntil-scheduled dispatch so we can await it deterministically.
  const tasks: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (p: Promise<unknown>) => tasks.push(p),
    passThroughOnException: () => {},
  }
  const res = await webhooks.fetch(req, env, ctx as unknown as ExecutionContext)
  await Promise.all(tasks)
  return res
}

describe("POST /webhooks/blindpay — flat BlindPay payload", () => {
  it("reads the event type from `webhook_event` (not `event_type`)", async () => {
    const res = await postWebhook({
      webhook_event: "receiver.update",
      id: RECEIVER_ID,
      email: "gui.rodz.dev@gmail.com",
      kyc_status: "verifying",
      country: "BR",
    })
    expect(res.status).toBe(200)
    const row = await db
      .select({ eventType: webhookEvents.eventType })
      .from(webhookEvents)
      .where(eq(webhookEvents.id, "msg_test00000001"))
      .get()
    // The bug stored "unknown" here for every event.
    expect(row?.eventType).toBe("receiver.update")
  })

  it("routes a flat receiver.update to the state machine (verifying -> pending stays pending)", async () => {
    const res = await postWebhook({
      webhook_event: "receiver.update",
      id: RECEIVER_ID,
      email: "gui.rodz.dev@gmail.com",
      kyc_status: "verifying",
      country: "BR",
    })
    expect(res.status).toBe(200)
    const profile = await db
      .select({ state: userProfile.onboardingState })
      .from(userProfile)
      .where(eq(userProfile.userId, USER_ID))
      .get()
    expect(profile?.state).toBe("pending")
    const row = await db
      .select({ processedAt: webhookEvents.processedAt, error: webhookEvents.error })
      .from(webhookEvents)
      .where(eq(webhookEvents.id, "msg_test00000001"))
      .get()
    expect(row?.error).toBeNull()
    expect(row?.processedAt).not.toBeNull()
  })
})
