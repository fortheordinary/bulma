import type { Context, MiddlewareHandler } from "hono"
import { nanoid } from "nanoid"
import { createLogger, type Logger } from "../lib/logger"
import type { Bindings } from "../lib/env"

export type LoggerContext = { logger: Logger }

/**
 * Per-request structured logger. Generates a request id (from `cf-ray` when
 * present, fallback nanoid), attaches a child LogLayer instance to
 * `c.var.logger`, and emits one record on entry + one on exit (status +
 * duration). Downstream handlers should prefer `c.var.logger` over
 * `console.*` so request_id correlation is preserved end-to-end.
 */
export const requestLogger: MiddlewareHandler<{
  Bindings: Bindings
  Variables: LoggerContext
}> = async (c: Context, next) => {
  const requestId = c.req.header("cf-ray") ?? nanoid(12)
  const start = Date.now()
  const logger = createLogger(c.env as Bindings, {
    request_id: requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
  })
  c.set("logger", logger)
  logger.withMetadata({ event: "request_start" }).info("request_start")
  try {
    await next()
  } finally {
    logger
      .withMetadata({
        event: "request_end",
        status: c.res.status,
        duration_ms: Date.now() - start,
      })
      .info("request_end")
  }
}
