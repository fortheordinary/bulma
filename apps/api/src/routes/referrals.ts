import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { referralCodes, referralCredits, userProfile } from "../db/schema"
import { ensureReferralCodes, shareLink } from "../lib/referrals"
import { requireUser, type AuthContext } from "../middleware/require-user"
import type { Bindings } from "../lib/env"

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

const SlotView = z.object({
  code: z.string(),
  status: z.enum(["available", "shared", "converted", "expired"]),
  sharedAt: z.number().nullable(),
  convertedAt: z.number().nullable(),
  link: z.string(),
})

const ReferralsView = z
  .object({
    slots: z.array(SlotView),
    credits: z.object({
      available: z.number().int(),
      consumed: z.number().int(),
      expired: z.number().int(),
    }),
  })
  .openapi("ReferralsView")

const CreditsView = z
  .object({
    available: z.number().int(),
    consumed: z.number().int(),
    expired: z.number().int(),
  })
  .openapi("ReferralCreditsView")

const ShareRequest = z
  .object({ code: z.string().min(1) })
  .openapi("ReferralShareRequest")

const ShareView = z
  .object({
    code: z.string(),
    link: z.string(),
    slotsRemaining: z.number().int(),
  })
  .openapi("ReferralShareView")

const ErrorResponse = z
  .object({ error: z.string() })
  .openapi("ReferralErrorResponse")

export const referrals = new OpenAPIHono<{
  Bindings: Bindings
  Variables: AuthContext
}>()

referrals.use("*", requireUser)

async function creditCounts(
  db: ReturnType<typeof drizzle>,
  userId: string,
): Promise<z.infer<typeof CreditsView>> {
  const rows = await db
    .select({ status: referralCredits.status })
    .from(referralCredits)
    .where(eq(referralCredits.userId, userId))
    .all()
  return {
    available: rows.filter((r) => r.status === "available").length,
    consumed: rows.filter((r) => r.status === "consumed").length,
    expired: rows.filter((r) => r.status === "expired").length,
  }
}

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["referrals"],
  summary: "List referral slots and credit balance",
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: ReferralsView } },
      description: "The user's 5 slots + credits",
    },
  },
})

referrals.openapi(listRoute, async (c) => {
  const user = c.get("user")
  const db = drizzle(c.env.DB)

  // Lazily backfill slots for users who reached `ready` before Phase 7 shipped.
  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()
  if (profile?.onboardingState === "ready") {
    await ensureReferralCodes(db, user.id)
  }

  const codes = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.ownerUserId, user.id))
    .all()
  const slots = codes.map((r) => ({
    code: r.code,
    status: r.status,
    sharedAt: r.sharedAt ?? null,
    convertedAt: r.convertedAt ?? null,
    link: shareLink(c.env.WWW_URL, r.code),
  }))
  return c.json({ slots, credits: await creditCounts(db, user.id) }, 200)
})

const shareRoute = createRoute({
  method: "post",
  path: "/share",
  tags: ["referrals"],
  summary: "Mark a referral code as shared and get its invite link",
  security: [{ Bearer: [] }, { Cookie: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ShareRequest } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ShareView } },
      description: "Invite link",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Code not found / not owned",
    },
    409: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Code already converted or expired",
    },
  },
})

referrals.openapi(shareRoute, async (c) => {
  const user = c.get("user")
  const { code } = ShareRequest.parse(await c.req.json())
  const db = drizzle(c.env.DB)

  const row = await db
    .select()
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.code, code.trim().toUpperCase()),
        eq(referralCodes.ownerUserId, user.id),
      ),
    )
    .get()
  if (!row) return c.json({ error: "code_not_found" }, 404)
  if (row.status === "converted" || row.status === "expired") {
    return c.json({ error: "code_not_shareable" }, 409)
  }

  if (row.status === "available") {
    await db
      .update(referralCodes)
      .set({ status: "shared", sharedAt: nowSec() })
      .where(eq(referralCodes.id, row.id))
  }

  const remaining = await db
    .select({ status: referralCodes.status })
    .from(referralCodes)
    .where(eq(referralCodes.ownerUserId, user.id))
    .all()
  const slotsRemaining = remaining.filter(
    (r) => r.status === "available",
  ).length

  return c.json(
    {
      code: row.code,
      link: shareLink(c.env.WWW_URL, row.code),
      slotsRemaining,
    },
    200,
  )
})

const creditsRoute = createRoute({
  method: "get",
  path: "/credits",
  tags: ["referrals"],
  summary: "Referral credit balance",
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: CreditsView } },
      description: "Credit counts",
    },
  },
})

referrals.openapi(creditsRoute, async (c) => {
  const user = c.get("user")
  const db = drizzle(c.env.DB)
  return c.json(await creditCounts(db, user.id), 200)
})
