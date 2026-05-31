import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { userProfile, referralCodes } from "../db/schema"
import { createBlindPay, BlindPayError } from "../lib/blindpay"
import { attachReferralCode } from "../lib/referrals"
import { requireUser, type AuthContext } from "../middleware/require-user"
import type { Bindings } from "../lib/env"

function now(): number {
  return Math.floor(Date.now() / 1000)
}

const OnboardingState = z.enum([
  "none",
  "pending",
  "approved",
  "rejected",
  "ready",
])

const StartResponse = z
  .object({
    state: OnboardingState,
    verificationUri: z.string().url().optional(),
  })
  .openapi("OnboardStartResponse")

const StatusResponse = z
  .object({
    state: OnboardingState,
    receiverId: z.string().nullable(),
    walletId: z.string().nullable(),
    virtualAccountId: z.string().nullable(),
  })
  .openapi("OnboardStatusResponse")

const ErrorResponse = z
  .object({ error: z.string() })
  .openapi("OnboardErrorResponse")

export const onboard = new OpenAPIHono<{
  Bindings: Bindings
  Variables: AuthContext
}>()

onboard.use("*", requireUser)

const StartRequest = z
  .object({ referralCode: z.string().optional() })
  .openapi("OnboardStartRequest")

const startRoute = createRoute({
  method: "post",
  path: "/start",
  tags: ["onboard"],
  summary: "Begin onboarding: mint hosted KYC link",
  security: [{ Bearer: [] }, { Cookie: [] }],
  request: {
    body: {
      required: false,
      content: { "application/json": { schema: StartRequest } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: StartResponse } },
      description: "Hosted KYC URL or short-circuit if already ready",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Missing / invalid / self referral code",
    },
    409: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Referral code already used",
    },
    502: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "BlindPay upstream error",
    },
  },
})

onboard.openapi(startRoute, async (c) => {
  const user = c.get("user")
  const db = drizzle(c.env.DB)

  let profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()
  if (!profile) {
    profile = await db
      .insert(userProfile)
      .values({ userId: user.id, onboardingState: "none", createdAt: now() })
      .returning()
      .get()
  }

  if (profile.onboardingState === "ready") {
    return c.json({ state: "ready" as const }, 200)
  }

  // Mandatory referral: every new user must attach a valid code before KYC.
  // A user who already attached on an earlier /start (re-running while pending)
  // is exempt — they don't need to re-supply the code.
  const alreadyAttached = await db
    .select({ id: referralCodes.id })
    .from(referralCodes)
    .where(eq(referralCodes.convertedUserId, user.id))
    .get()
  if (!alreadyAttached) {
    const body = (await c.req.json().catch(() => ({}))) as {
      referralCode?: unknown
    }
    const referralCode =
      typeof body.referralCode === "string"
        ? body.referralCode.trim().toUpperCase()
        : undefined
    if (!referralCode) {
      return c.json({ error: "referral_required" }, 400)
    }
    const result = await attachReferralCode(db, referralCode, user.id)
    if (result === "self_referral") {
      return c.json({ error: "self_referral" }, 400)
    }
    if (result === "already_used") {
      return c.json({ error: "code_taken" }, 409)
    }
    if (result !== "ok") {
      return c.json({ error: "invalid_referral_code" }, 400)
    }
  }

  const blindpay = createBlindPay(c.env)
  let token: string
  try {
    const minted = await blindpay.createExternalReceiverToken({
      type: "business",
      kyc_type: "standard",
    })
    token = minted.token
  } catch (err) {
    const status = err instanceof BlindPayError ? err.status : 0
    const body = err instanceof BlindPayError ? err.body : null
    console.error("blindpay external-receiver-token failed", { status, body })
    return c.json({ error: "blindpay_unavailable" }, 502)
  }

  const params = new URLSearchParams({
    instanceId: c.env.BLINDPAY_INSTANCE_ID,
    type: "business",
    kyc_type: "standard",
    token,
  })
  const verificationUri = `${c.env.BLINDPAY_HOSTED_INVITE_URL}?${params.toString()}`

  await db
    .update(userProfile)
    .set({ onboardingState: "pending" })
    .where(eq(userProfile.userId, user.id))

  return c.json({ state: "pending" as const, verificationUri }, 200)
})

const statusRoute = createRoute({
  method: "get",
  path: "/status",
  tags: ["onboard"],
  summary: "Current onboarding state",
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: StatusResponse } },
      description: "State + linked BlindPay ids",
    },
  },
})

onboard.openapi(statusRoute, async (c) => {
  const user = c.get("user")
  const db = drizzle(c.env.DB)

  let profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()
  if (!profile) {
    profile = await db
      .insert(userProfile)
      .values({ userId: user.id, onboardingState: "none", createdAt: now() })
      .returning()
      .get()
  }

  return c.json(
    {
      state: profile.onboardingState,
      receiverId: profile.receiverId ?? null,
      walletId: profile.walletId ?? null,
      virtualAccountId: profile.virtualAccountId ?? null,
    },
    200,
  )
})
