import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { userProfile } from "../db/schema"
import { requireUser, type AuthContext } from "../middleware/require-user"
import { reconcileReceiverForUser } from "../lib/onboard"
import type { Bindings } from "../lib/env"

const MeResponse = z.object({
  id: z.string().openapi({ example: "user_abc" }),
  email: z.string().email(),
  name: z.string(),
  onboardingState: z.enum(["none", "pending", "approved", "rejected", "ready"]),
})

const route = createRoute({
  method: "get",
  path: "/",
  tags: ["me"],
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: MeResponse } },
      description: "Current user",
    },
    401: { description: "Unauthorized" },
  },
})

export const me = new OpenAPIHono<{
  Bindings: Bindings
  Variables: AuthContext
}>()

me.use("*", requireUser)

me.openapi(route, async (c) => {
  const user = c.get("user")
  const db = drizzle(c.env.DB)

  // If the user is mid-onboarding, the BlindPay webhook may be late or lost.
  // Poll BlindPay once per call so `whoami` reflects the current KYC status
  // (no-op unless onboardingState === "pending").
  await reconcileReceiverForUser(user.id, c.env, db)

  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .get()

  if (!profile) {
    const created = await db
      .insert(userProfile)
      .values({
        userId: user.id,
        onboardingState: "none",
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning()
      .get()
    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      onboardingState: created.onboardingState,
    })
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    onboardingState: profile.onboardingState,
  })
})
