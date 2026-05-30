import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { drizzle } from "drizzle-orm/d1"
import { cors } from "hono/cors"
import { createAuth } from "./lib/auth"
import { createLogger } from "./lib/logger"
import { requestLogger, type LoggerContext } from "./middleware/request-logger"
import { device } from "./routes/device"
import { me } from "./routes/me"
import { accounts } from "./routes/accounts"
import { onboard } from "./routes/onboard"
import { payouts } from "./routes/payouts"
import { recipients } from "./routes/recipients"
import { referrals } from "./routes/referrals"
import { webhooks, redispatchFailedEvents } from "./routes/webhooks"
import { reconcileStuckIdempotencyKeys } from "./lib/idempotency"
import { reconcileStuckReferralCredits, runForfeitSweep } from "./lib/referrals"
import type { Bindings } from "./lib/env"

const app = new OpenAPIHono<{
  Bindings: Bindings
  Variables: LoggerContext
}>()

app.use("*", requestLogger)

app.use("*", async (c, next) => {
  return cors({
    origin: c.env.WWW_URL,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })(c, next)
})

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})

const RootSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    status: z.literal("ok"),
  })
  .openapi("Root")

const HealthSchema = z
  .object({
    status: z.literal("ok"),
    env: z.string(),
  })
  .openapi("Health")

const ReadySchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    env: z.string(),
    checks: z.object({ db: z.enum(["ok", "error"]) }),
  })
  .openapi("Ready")

const rootRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["meta"],
  summary: "Service info",
  responses: {
    200: {
      content: { "application/json": { schema: RootSchema } },
      description: "Service metadata",
    },
  },
})

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["meta"],
  summary: "Health check",
  responses: {
    200: {
      content: { "application/json": { schema: HealthSchema } },
      description: "Service is healthy",
    },
  },
})

// Readiness probe (deploy smoke test): unlike /health (liveness, always ok),
// this pings D1 so a deploy targeting a wrong/unreachable database fails loudly.
// Returns 503 when a dependency is down so a smoke check / load balancer can
// gate traffic. BlindPay is intentionally not probed here — readiness should not
// flap on an upstream outage we already degrade gracefully around.
const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  tags: ["meta"],
  summary: "Readiness probe (checks D1)",
  responses: {
    200: {
      content: { "application/json": { schema: ReadySchema } },
      description: "All dependency checks passed",
    },
    503: {
      content: { "application/json": { schema: ReadySchema } },
      description: "A dependency check failed",
    },
  },
})

app.openapi(rootRoute, (c) =>
  c.json(
    {
      name: "bulma-api",
      description: "Agentic global account for remote workers",
      status: "ok" as const,
    },
    200,
  ),
)

app.openapi(healthRoute, (c) =>
  c.json({ status: "ok" as const, env: c.env.ENVIRONMENT }, 200),
)

app.openapi(readyRoute, async (c) => {
  let dbOk = false
  try {
    await c.env.DB.prepare("SELECT 1").first()
    dbOk = true
  } catch (err) {
    c.var.logger?.withError(err).error("readiness_db_check_failed")
  }
  return c.json(
    {
      status: dbOk ? "ok" as const : "degraded" as const,
      env: c.env.ENVIRONMENT,
      checks: { db: dbOk ? "ok" as const : "error" as const },
    },
    dbOk ? 200 : 503,
  )
})

app.route("/auth/device", device)
app.route("/me", me)
app.route("/onboard", onboard)
app.route("/accounts", accounts)
app.route("/recipients", recipients)
app.route("/payouts", payouts)
app.route("/referrals", referrals)
app.route("/webhooks", webhooks)

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    version: "0.0.1",
    title: "Bulma API",
    description: "Agentic global account for remote workers",
  },
})

app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
  type: "http",
  scheme: "bearer",
})

app.openAPIRegistry.registerComponent("securitySchemes", "Cookie", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
})

app.get("/docs", Scalar({ url: "/openapi.json" }))

export default {
  fetch: app.fetch,
  // Nightly Cron Trigger (see wrangler.toml [triggers]) — referral forfeit sweep.
  async scheduled(
    event: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const log = createLogger(env, { source: "cron", cron: event.cron })
    log.withMetadata({ event: "cron_start" }).info("cron_start")
    ctx.waitUntil(
      (async () => {
        const db = drizzle(env.DB)
        const forfeited = await runForfeitSweep(db)
        // Resolve credits a crashed execute reserved but never committed, then
        // clear the idempotency claims those same crashes orphaned (production.md
        // §4). Credits first so a recovered payout keeps its free pricing.
        const reservations = await reconcileStuckReferralCredits(
          db,
          env.BLINDPAY_PARTNER_FEE_ID_FREE,
        )
        const idempotencyCleared = await reconcileStuckIdempotencyKeys(db)
        const webhookReplay = await redispatchFailedEvents(env)
        log
          .withMetadata({
            event: "cron_end",
            forfeited,
            reservationsCommitted: reservations.committed,
            reservationsReleased: reservations.released,
            idempotencyCleared,
            webhookReplay,
          })
          .info("cron_end")
      })().catch((err: unknown) => {
        log.withError(err).error("cron_error")
        throw err
      }),
    )
  },
}
