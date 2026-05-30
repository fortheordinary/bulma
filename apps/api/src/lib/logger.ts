import { LogLayer, StructuredTransport } from "loglayer"
import { serializeError } from "serialize-error"
import type { Bindings } from "./env"

export type Logger = LogLayer

/**
 * Structured logger backed by LogLayer + StructuredTransport. Each record is
 * a single JSON line emitted via `console.log`, which the Workers runtime
 * captures into Workers Logs (and any bound Logpush job).
 *
 * Every record is tagged with `app=bulma-api` + `env`; callers can chain
 * `.withContext` / `.withMetadata` to scope further (e.g. per-request
 * `request_id`).
 */
export function createLogger(
  env: Bindings,
  context?: Record<string, unknown>,
): Logger {
  const log = new LogLayer({
    errorSerializer: serializeError,
    transport: new StructuredTransport({
      logger: console,
      level:
        env.LOG_LEVEL as "trace" | "debug" | "info" | "warn" | "error" | "fatal" | undefined ??
        "info",
      stringify: true,
    }),
  })
  log.withContext({ app: "bulma-api", env: env.ENVIRONMENT, ...context })
  return log
}
