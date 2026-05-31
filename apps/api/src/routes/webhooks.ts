import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { and, eq, isNull, lt, sql } from "drizzle-orm"
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"
import { payouts as payoutsTable, webhookEvents } from "../db/schema"
import {
  applyReceiverStateForUser,
  findUserIdForReceiver,
  isVirtualAccountEligible,
  pickManagedWallet,
  pickVirtualAccountPlan,
} from "../lib/onboard"
import { returnReferralCredit } from "../lib/referrals"
import { isTerminalStatus, normalizePayoutStatus } from "../lib/payouts"
import { verifySvix } from "../lib/svix"
import type { Bindings } from "../lib/env"

// Re-exported for tests/webhooks-provision.test.ts (planners are pure).
export { isVirtualAccountEligible, pickManagedWallet, pickVirtualAccountPlan }

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

const WebhookResponse = z
  .object({ ok: z.literal(true), deduplicated: z.boolean().optional() })
  .openapi("WebhookResponse")

const WebhookErrorResponse = z
  .object({ error: z.string() })
  .openapi("WebhookErrorResponse")

export const webhooks = new OpenAPIHono<{ Bindings: Bindings }>()

const route = createRoute({
  method: "post",
  path: "/blindpay",
  tags: ["webhooks"],
  summary: "BlindPay webhook intake",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: z.unknown() } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: WebhookResponse } },
      description: "Accepted (verified + persisted)",
    },
    400: {
      content: { "application/json": { schema: WebhookErrorResponse } },
      description: "Malformed / stale",
    },
    401: {
      content: { "application/json": { schema: WebhookErrorResponse } },
      description: "Invalid signature",
    },
  },
})

webhooks.openapi(route, async (c) => {
  const svixId = c.req.header("svix-id") ?? ""
  const svixTs = c.req.header("svix-timestamp") ?? ""
  const svixSig = c.req.header("svix-signature") ?? ""
  const payload = await c.req.text()

  const verify = await verifySvix({
    svixId,
    svixTimestamp: svixTs,
    svixSignature: svixSig,
    payload,
    secret: c.env.BLINDPAY_WEBHOOK_SECRET,
  })

  if (!verify.ok) {
    if (verify.error === "invalid_signature") {
      return c.json({ error: "invalid_signature" }, 401)
    }
    return c.json({ error: verify.error }, 400)
  }

  const db = drizzle(c.env.DB)

  const existing = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.id, svixId))
    .get()
  if (existing) {
    return c.json({ ok: true as const, deduplicated: true }, 200)
  }

  let event: unknown
  try {
    event = JSON.parse(payload)
  } catch {
    return c.json({ error: "malformed_payload" }, 400)
  }

  // BlindPay sends a flat payload with the event type in `webhook_event`
  // (e.g. "receiver.update"). Accept `event_type` too for forward-compat.
  const eventRecord =
    typeof event === "object" && event !== null
      ? event as Record<string, unknown>
      : {}
  const eventType = String(
    eventRecord.webhook_event ?? eventRecord.event_type ?? "unknown",
  )

  await db.insert(webhookEvents).values({
    id: svixId,
    eventType,
    payload,
    receivedAt: nowSec(),
  })

  c.executionCtx.waitUntil(dispatch(svixId, eventType, event, c.env, db))

  return c.json({ ok: true as const }, 200)
})

// Svix accepts our synchronous 200 and never redelivers, so a dispatch that
// throws would otherwise be lost. The nightly cron retries unprocessed rows up
// to this many total attempts (the live intake call counts as attempt 1).
const MAX_DISPATCH_ATTEMPTS = 5

async function dispatch(
  svixId: string,
  eventType: string,
  event: unknown,
  env: Bindings,
  db: DrizzleD1Database,
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ attempts: sql`${webhookEvents.attempts} + 1` })
    .where(eq(webhookEvents.id, svixId))
  try {
    switch (eventType) {
      case "receiver.new":
      case "receiver.update":
        await onReceiverEvent(event, env, db)
        break
      case "tos.accept":
        await onTosAccept(event, db)
        break
      case "bankAccount.new":
        // Informational only — recipients live in BlindPay; the row is already
        // persisted in webhook_events above. No local mirror to update.
        break
      case "payout.new":
      case "payout.update":
      case "payout.complete":
        await onPayoutEvent(event, db)
        break
      default:
        break
    }
    await db
      .update(webhookEvents)
      .set({ processedAt: nowSec(), error: null })
      .where(eq(webhookEvents.id, svixId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("webhook dispatch failed", { svixId, eventType, msg })
    await db
      .update(webhookEvents)
      .set({ error: msg.slice(0, 2000) })
      .where(eq(webhookEvents.id, svixId))
  }
}

// BlindPay receiver payloads are flat: the receiver object's fields sit at the
// top level of the webhook body (no `data` envelope). kyc_status is read as a
// free string and narrowed below so an unmodeled status can't fail the parse.
const ReceiverEventSchema = z
  .object({
    id: z.string(),
    email: z.string().email().optional(),
    kyc_status: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough()

const KYC_STATES = ["verifying", "approved", "rejected"] as const

async function onReceiverEvent(
  event: unknown,
  env: Bindings,
  db: DrizzleD1Database,
): Promise<void> {
  const parsed = ReceiverEventSchema.safeParse(event)
  if (!parsed.success) return

  const data = parsed.data
  const userId = await findUserIdForReceiver(data, db)
  if (!userId) {
    console.warn("webhook: no matching user for receiver", {
      receiverId: data.id,
    })
    return
  }

  const kycStatus = (KYC_STATES as readonly string[]).includes(
    data.kyc_status ?? "",
  )
    ? data.kyc_status as typeof KYC_STATES[number]
    : undefined

  await applyReceiverStateForUser(
    userId,
    {
      id: data.id,
      email: data.email,
      kyc_status: kycStatus,
      country: data.country,
    },
    env,
    db,
  )
}

// Flat payload (see ReceiverEventSchema): payout fields at the top level.
const PayoutEventSchema = z
  .object({
    id: z.string(),
    status: z.string().optional(),
  })
  .passthrough()

// payout.new/update/complete → flip the local payout's status. Only our own
// tracked payouts (by `po_` id) are updated; unknown ids are ignored.
async function onPayoutEvent(
  event: unknown,
  db: DrizzleD1Database,
): Promise<void> {
  const parsed = PayoutEventSchema.safeParse(event)
  if (!parsed.success) return
  const data = parsed.data
  if (!data.status) return

  // Guard against out-of-order events clobbering a terminal status. Once a
  // payout is completed/failed/refunded, no further BlindPay update may move
  // it (a stale `payout.update` must not flip `completed` back to `pending`).
  const existing = await db
    .select({ status: payoutsTable.status })
    .from(payoutsTable)
    .where(eq(payoutsTable.id, data.id))
    .get()
  if (!existing) return
  if (isTerminalStatus(normalizePayoutStatus(existing.status))) return

  await db
    .update(payoutsTable)
    .set({ status: data.status, updatedAt: nowSec() })
    .where(eq(payoutsTable.id, data.id))

  // A free-payout credit is returned if the payout it paid for didn't land.
  const normalized = normalizePayoutStatus(data.status)
  if (normalized === "refunded" || normalized === "failed") {
    await returnReferralCredit(db, data.id)
  }
}

// Flat payload (see ReceiverEventSchema): receiver_id at the top level.
const TosEventSchema = z
  .object({ receiver_id: z.string().optional() })
  .passthrough()

async function onTosAccept(
  event: unknown,
  _db: DrizzleD1Database,
): Promise<void> {
  const parsed = TosEventSchema.safeParse(event)
  if (!parsed.success) return
  // TOS acceptance tracked via receiver lookup later; no schema column for tos_id yet.
}

/** Nightly cron pass: re-dispatch webhook events that never finished
 *  processing. A dispatch that threw during the live `waitUntil` (or a Worker
 *  that died mid-dispatch) leaves `processed_at IS NULL`; Svix already received a
 *  200 so it will not redeliver. Retry each such row, bounded by
 *  `MAX_DISPATCH_ATTEMPTS`. Returns counts for cron logging. */
export async function redispatchFailedEvents(
  env: Bindings,
): Promise<{
  attempted: number
  recovered: number
}> {
  const db = drizzle(env.DB)
  const stuck = await db
    .select({
      id: webhookEvents.id,
      eventType: webhookEvents.eventType,
      payload: webhookEvents.payload,
    })
    .from(webhookEvents)
    .where(
      and(
        isNull(webhookEvents.processedAt),
        lt(webhookEvents.attempts, MAX_DISPATCH_ATTEMPTS),
      ),
    )
    .all()

  let recovered = 0
  for (const row of stuck) {
    let event: unknown
    try {
      event = JSON.parse(row.payload)
    } catch {
      // Unparseable payload will never dispatch — mark it terminal so the cron
      // stops re-selecting it.
      await db
        .update(webhookEvents)
        .set({ attempts: MAX_DISPATCH_ATTEMPTS, error: "malformed_payload" })
        .where(eq(webhookEvents.id, row.id))
      continue
    }
    await dispatch(row.id, row.eventType, event, env, db)
    const after = await db
      .select({ processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(eq(webhookEvents.id, row.id))
      .get()
    if (after?.processedAt != null) recovered++
  }

  return { attempted: stuck.length, recovered }
}
