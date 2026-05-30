import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { userProfile } from "../db/schema"
import { createBlindPay, BlindPayError } from "../lib/blindpay"
import {
  maskRecipient,
  parseRecipientInput,
  railTypesMetadata,
  RailSpecSchema,
  RecipientViewSchema,
} from "../lib/recipients"
import { requireUser, type AuthContext } from "../middleware/require-user"
import type { Bindings } from "../lib/env"

const ErrorResponse = z
  .object({ error: z.string(), detail: z.string().optional() })
  .openapi("RecipientErrorResponse")

const RecipientInput = z
  .object({ type: z.string(), name: z.string() })
  .passthrough()
  .openapi("RecipientInput")

export const recipients = new OpenAPIHono<{
  Bindings: Bindings
  Variables: AuthContext
}>()

recipients.use("*", requireUser)

async function receiverIdFor(c: {
  env: Bindings
  get: (k: "user") => { id: string }
}): Promise<string | null> {
  const db = drizzle(c.env.DB)
  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, c.get("user").id))
    .get()
  return profile?.receiverId ?? null
}

// Surface BlindPay's own validation message (e.g. invalid IBAN / PIX key) to the
// caller, preserving a client-actionable 4xx; otherwise a generic 502.
function blindpayErrorResponse(
  err: unknown,
): {
  status: 400 | 422 | 502
  body: {
    error: string
    detail?: string
  }
} {
  if (
    err instanceof BlindPayError &&
    (err.status === 400 || err.status === 422)
  ) {
    const detail =
      typeof err.body === "object" && err.body !== null && "message" in err.body
        ? String((err.body as { message: unknown }).message)
        : undefined
    return { status: err.status, body: { error: "invalid_recipient", detail } }
  }
  return { status: 502, body: { error: "blindpay_unavailable" } }
}

const typesRoute = createRoute({
  method: "get",
  path: "/types",
  tags: ["recipients"],
  summary: "Supported recipient rails and their fields",
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: z.array(RailSpecSchema) } },
      description: "Rail field metadata for interactive entry",
    },
  },
})

recipients.openapi(typesRoute, (c) => {
  return c.json(railTypesMetadata(), 200)
})

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["recipients"],
  summary: "List recipients (masked)",
  security: [{ Bearer: [] }, { Cookie: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: z.array(RecipientViewSchema) } },
      description: "Masked recipient rows",
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

recipients.openapi(listRoute, async (c) => {
  const receiverId = await receiverIdFor(c)
  if (!receiverId) return c.json({ error: "no_account" }, 404)
  const blindpay = createBlindPay(c.env)
  try {
    const accounts = await blindpay.listBankAccounts(receiverId)
    return c.json(accounts.map(maskRecipient), 200)
  } catch (err) {
    const { status, body } = blindpayErrorResponse(err)
    if (status === 502) return c.json(body, 502)
    return c.json(body, status)
  }
})

const createRecipientRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["recipients"],
  summary: "Add a recipient (proxies BlindPay)",
  security: [{ Bearer: [] }, { Cookie: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RecipientInput } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: RecipientViewSchema } },
      description: "Created (masked)",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Invalid recipient / unsupported rail",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "No account provisioned",
    },
    422: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "BlindPay rejected the recipient",
    },
    502: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "BlindPay upstream error",
    },
  },
})

recipients.openapi(createRecipientRoute, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseRecipientInput(body)
  if (!parsed.success) {
    return c.json(
      {
        error: parsed.error,
        detail:
          parsed.error === "unsupported_rail"
            ? "Unknown recipient type."
            : "Missing or invalid required fields.",
      },
      400,
    )
  }

  const receiverId = await receiverIdFor(c)
  if (!receiverId) return c.json({ error: "no_account" }, 404)

  const blindpay = createBlindPay(c.env)
  try {
    const created = await blindpay.createBankAccount(receiverId, parsed.data)
    return c.json(maskRecipient(created), 201)
  } catch (err) {
    const { status, body } = blindpayErrorResponse(err)
    if (status === 400) return c.json(body, 400)
    if (status === 422) return c.json(body, 422)
    return c.json(body, 502)
  }
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["recipients"],
  summary: "Remove a recipient",
  security: [{ Bearer: [] }, { Cookie: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.literal(true) }) },
      },
      description: "Deleted",
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

recipients.openapi(deleteRoute, async (c) => {
  const receiverId = await receiverIdFor(c)
  if (!receiverId) return c.json({ error: "no_account" }, 404)
  const id = c.req.param("id")
  if (!id) return c.json({ error: "no_account" }, 404)
  const blindpay = createBlindPay(c.env)

  // Ownership check: BlindPay's path scopes by receiver, but verify here so a
  // mismatched parent never reaches upstream — defence-in-depth against an
  // attacker enumerating another user's `ba_…` ids.
  try {
    const owned = await blindpay.listBankAccounts(receiverId)
    if (!owned.some((a) => a.id === id)) {
      return c.json({ error: "recipient_not_found" }, 404)
    }
  } catch (err) {
    const { status, body } = blindpayErrorResponse(err)
    if (status === 502) return c.json(body, 502)
    return c.json(body, status)
  }

  try {
    await blindpay.deleteBankAccount(receiverId, id)
    return c.json({ ok: true as const }, 200)
  } catch (err) {
    const { status, body } = blindpayErrorResponse(err)
    if (status === 502) return c.json(body, 502)
    return c.json(body, status)
  }
})
