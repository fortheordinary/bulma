// Pure payout helpers (unit-tested in tests/payouts.test.ts).

/** Normalized, customer-facing payout status. BlindPay's raw status maps onto
 *  these; anything in flight collapses to `pending`. */
export type PayoutStatus = "pending" | "completed" | "failed" | "refunded"

/** Map BlindPay's raw payout status to our normalized set. Unknown / in-flight
 *  statuses (new, processing, on_hold, …) are treated as `pending`. */
export function normalizePayoutStatus(
  raw: string | null | undefined,
): PayoutStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "refunded":
      return "refunded"
    default:
      return "pending"
  }
}

/** A normalized status is terminal when no further BlindPay update will change it. */
export function isTerminalStatus(status: PayoutStatus): boolean {
  return status !== "pending"
}

/** Quotes are valid for 5 minutes; `expiresAtMs` is BlindPay's ms epoch. */
export function isQuoteExpired(
  expiresAtMs: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs >= expiresAtMs
}

/**
 * Parse a user-entered USD amount ("10", "10.5", "$1,234.56") to integer cents.
 * Returns null for anything non-positive or malformed.
 */
export function parseUsdToCents(input: string | number): number | null {
  const raw = typeof input === "number" ? String(input) : input
  const cleaned = raw.trim().replace(/[$,\s]/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const cents = Math.round(Number(cleaned) * 100)
  return cents > 0 ? cents : null
}
