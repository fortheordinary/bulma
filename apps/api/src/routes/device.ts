import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { and, eq, isNull, lt } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import {
  deviceCodes,
  session as sessionTable,
  user as userTable,
} from "../db/schema"
import { requireUser, type AuthContext } from "../middleware/require-user"
import type { Bindings } from "../lib/env"

import { generateDeviceCode, generateUserCode } from "../lib/codes"

const DEVICE_CODE_TTL_SECONDS = 600
const POLL_INTERVAL_SECONDS = 5

function now(): number {
  return Math.floor(Date.now() / 1000)
}

const StartResponse = z
  .object({
    deviceCode: z.string(),
    userCode: z.string(),
    verificationUri: z.string().url(),
    verificationUriComplete: z.string().url(),
    expiresIn: z.number().int(),
    interval: z.number().int(),
  })
  .openapi("DeviceStartResponse")

const VerifyRequest = z
  .object({
    userCode: z.string().min(1),
  })
  .openapi("DeviceVerifyRequest")

const VerifyResponse = z
  .object({
    ok: z.literal(true),
  })
  .openapi("DeviceVerifyResponse")

const PollRequest = z
  .object({
    deviceCode: z.string().min(1),
  })
  .openapi("DevicePollRequest")

const PollSuccessResponse = z
  .object({
    sessionToken: z.string(),
    userId: z.string(),
    email: z.string().email(),
    expiresAt: z.number().int(),
  })
  .openapi("DevicePollSuccessResponse")

const PollPendingResponse = z
  .object({
    error: z.enum([
      "authorization_pending",
      "slow_down",
      "expired_token",
      "access_denied",
    ]),
    interval: z.number().int().optional(),
  })
  .openapi("DevicePollPendingResponse")

const ErrorResponse = z.object({ error: z.string() }).openapi("ErrorResponse")

export const device = new OpenAPIHono<{
  Bindings: Bindings
  Variables: AuthContext
}>()

const startRoute = createRoute({
  method: "post",
  path: "/start",
  tags: ["auth.device"],
  summary: "Begin CLI device flow",
  responses: {
    200: {
      content: { "application/json": { schema: StartResponse } },
      description: "Device + user code minted",
    },
  },
})

device.openapi(startRoute, async (c) => {
  const db = drizzle(c.env.DB)
  const deviceCode = generateDeviceCode()
  let userCode = generateUserCode()

  for (let attempt = 0; attempt < 5; attempt++) {
    // eslint-disable-next-line no-await-in-loop -- retry on collision is intentionally serial
    const collision = await db
      .select()
      .from(deviceCodes)
      .where(eq(deviceCodes.userCode, userCode))
      .get()
    if (!collision) break
    userCode = generateUserCode()
  }

  await db.insert(deviceCodes).values({
    deviceCode,
    userCode,
    expiresAt: now() + DEVICE_CODE_TTL_SECONDS,
    createdAt: now(),
  })

  const verificationUri = `${c.env.WWW_URL}/cli`
  const verificationUriComplete = `${verificationUri}?code=${encodeURIComponent(userCode)}`

  return c.json(
    {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresIn: DEVICE_CODE_TTL_SECONDS,
      interval: POLL_INTERVAL_SECONDS,
    },
    200,
  )
})

const verifyRoute = createRoute({
  method: "post",
  path: "/verify",
  tags: ["auth.device"],
  summary: "Pair a user_code to the current web session",
  security: [{ Cookie: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: VerifyRequest } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: VerifyResponse } },
      description: "Paired",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Invalid or expired code",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
})

device.use("/verify", requireUser)

device.openapi(verifyRoute, async (c) => {
  const { userCode } = c.req.valid("json")
  const session = c.get("session")
  const db = drizzle(c.env.DB)

  const row = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.userCode, userCode))
    .get()

  if (!row) return c.json({ error: "invalid_code" }, 400)
  if (row.expiresAt < now()) return c.json({ error: "expired_code" }, 400)
  if (row.approvedSessionId && row.approvedSessionId !== session.id) {
    return c.json({ error: "code_already_used" }, 400)
  }

  await db
    .update(deviceCodes)
    .set({ approvedSessionId: session.id })
    .where(eq(deviceCodes.deviceCode, row.deviceCode))

  return c.json({ ok: true as const }, 200)
})

const pollRoute = createRoute({
  method: "post",
  path: "/poll",
  tags: ["auth.device"],
  summary: "Poll device code for session token",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PollRequest } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: PollSuccessResponse } },
      description: "Approved, session token returned",
    },
    425: {
      content: { "application/json": { schema: PollPendingResponse } },
      description: "Pending or rate-limited",
    },
    410: {
      content: { "application/json": { schema: PollPendingResponse } },
      description: "Expired",
    },
  },
})

device.openapi(pollRoute, async (c) => {
  const { deviceCode } = c.req.valid("json")
  const db = drizzle(c.env.DB)

  const row = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.deviceCode, deviceCode))
    .get()

  if (!row) {
    return c.json({ error: "expired_token" as const }, 410)
  }

  if (row.expiresAt < now()) {
    await db.delete(deviceCodes).where(eq(deviceCodes.deviceCode, deviceCode))
    return c.json({ error: "expired_token" as const }, 410)
  }

  if (row.lastPolledAt && now() - row.lastPolledAt < POLL_INTERVAL_SECONDS) {
    return c.json(
      { error: "slow_down" as const, interval: POLL_INTERVAL_SECONDS * 2 },
      425,
    )
  }

  await db
    .update(deviceCodes)
    .set({ lastPolledAt: now() })
    .where(eq(deviceCodes.deviceCode, deviceCode))

  if (!row.approvedSessionId) {
    return c.json(
      {
        error: "authorization_pending" as const,
        interval: POLL_INTERVAL_SECONDS,
      },
      425,
    )
  }

  const paired = await db
    .select({
      sessionToken: sessionTable.token,
      userId: sessionTable.userId,
      expiresAt: sessionTable.expiresAt,
      email: userTable.email,
    })
    .from(sessionTable)
    .innerJoin(userTable, eq(userTable.id, sessionTable.userId))
    .where(eq(sessionTable.id, row.approvedSessionId))
    .get()

  if (!paired) {
    return c.json({ error: "expired_token" as const }, 410)
  }

  await db.delete(deviceCodes).where(eq(deviceCodes.deviceCode, deviceCode))

  return c.json(
    {
      sessionToken: paired.sessionToken,
      userId: paired.userId,
      email: paired.email,
      expiresAt: Math.floor(paired.expiresAt.getTime() / 1000),
    },
    200,
  )
})

device.openapi(
  createRoute({
    method: "post",
    path: "/cleanup",
    tags: ["auth.device"],
    summary: "Internal: delete expired device codes",
    responses: {
      200: {
        content: {
          "application/json": { schema: z.object({ deleted: z.number() }) },
        },
        description: "Cleanup done",
      },
    },
  }),
  async (c) => {
    const db = drizzle(c.env.DB)
    const result = await db
      .delete(deviceCodes)
      .where(
        and(
          lt(deviceCodes.expiresAt, now()),
          isNull(deviceCodes.approvedSessionId),
        ),
      )
    return c.json({ deleted: result.meta?.changes ?? 0 }, 200)
  },
)
