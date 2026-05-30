import { and, eq, lt } from "drizzle-orm"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import { idempotencyKeys } from "../db/schema"

// Sentinel statusCode for a claimed-but-unfinalized row. A real response always
// carries a 1xx–5xx code, so 0 unambiguously marks "in flight".
const IN_FLIGHT = 0

// Cap the client-supplied key so a hostile caller can't bloat the row.
export const MAX_CLIENT_KEY_LEN = 255

// Grace before an in-flight claim is treated as orphaned by a crashed request.
// Matches the reservation grace so the two reconcile passes agree.
const CLAIM_GRACE_SEC = 60 * 15 // 15 minutes

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

// fresh: caller is the first writer; must finalize/release.
// replay: a prior call's result, returned verbatim.
// in_flight: a concurrent caller holds the key.
// conflict: same key, different request body.
export type IdempotencyOutcome = { kind: "fresh" } | {
  kind: "replay"
  statusCode: number
  response: unknown
} | { kind: "in_flight" } | { kind: "conflict" }

/**
 * Scope the client key to the user. The composite is the table PK, so one
 * user's idempotency key lives in a different namespace from every other
 * user's — a key can never collide with, or replay, another user's cached
 * response. (Closes the cross-tenant gap in the unscoped `idempotency_keys`
 * table.)
 */
export function scopedKey(userId: string, clientKey: string): string {
  return `${userId}:${clientKey}`
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")
}

/**
 * Atomically claim an idempotency key. The unique-PK insert is the lock: only
 * the first of N concurrent callers gets `fresh`; the rest see `in_flight`
 * until the winner calls `finalizeIdempotent` (then they get `replay`) or
 * `releaseIdempotent` (then a retry gets `fresh`). A replay with a different
 * request body for the same key is a `conflict`.
 */
export async function beginIdempotent(
  db: DrizzleD1Database,
  key: string,
  requestBody: string,
  now: number,
): Promise<IdempotencyOutcome> {
  const requestHash = await sha256Hex(requestBody)
  const res = await db
    .insert(idempotencyKeys)
    .values({
      key,
      requestHash,
      response: "",
      statusCode: IN_FLIGHT,
      createdAt: now,
    })
    .onConflictDoNothing()
    .run()
  if ((res.meta?.changes ?? 0) > 0) return { kind: "fresh" }

  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .get()
  // Row vanished between insert and select (cleanup race) — treat as fresh and
  // let the caller proceed; a duplicate is far cheaper than a wrong 409.
  if (!existing) return { kind: "fresh" }
  if (existing.requestHash !== requestHash) return { kind: "conflict" }
  if (existing.statusCode === IN_FLIGHT) return { kind: "in_flight" }
  return {
    kind: "replay",
    statusCode: existing.statusCode,
    response: JSON.parse(existing.response),
  }
}

/** Persist the definitive response so subsequent replays short-circuit to it. */
export async function finalizeIdempotent(
  db: DrizzleD1Database,
  key: string,
  statusCode: number,
  response: unknown,
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ response: JSON.stringify(response), statusCode })
    .where(eq(idempotencyKeys.key, key))
}

/**
 * Release a claimed-but-unfinalized key so a later retry can proceed. Use when
 * the operation failed before it became durable (e.g. BlindPay threw), so the
 * caller is free to try again rather than being pinned to a cached error.
 */
export async function releaseIdempotent(
  db: DrizzleD1Database,
  key: string,
): Promise<void> {
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key))
}

/**
 * Delete in-flight claims left behind by a request that crashed before
 * finalizing or releasing — otherwise that key stays pinned at
 * `409 request_in_progress` forever. Only rows past the grace window are
 * removed, so a genuinely in-progress execute is never cleared. Finalized rows
 * (real responses) are left intact for replay. Run nightly alongside the credit
 * reconcile. Returns the number cleared.
 */
export async function reconcileStuckIdempotencyKeys(
  db: DrizzleD1Database,
  now: number = nowSec(),
  graceSec: number = CLAIM_GRACE_SEC,
): Promise<number> {
  const res = await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.statusCode, IN_FLIGHT),
        lt(idempotencyKeys.createdAt, now - graceSec),
      ),
    )
    .run()
  return res.meta?.changes ?? 0
}
