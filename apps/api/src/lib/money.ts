/**
 * Convert a USD-pegged token amount (BlindPay's normalized decimal balance,
 * token decimals already applied) to integer USD cents. The token is treated
 * 1:1 with USD — customer-facing output is strict fiat (see AGENTS.md §1).
 *
 * Defensive: non-finite or negative inputs floor to 0. Rounds to the nearest
 * cent, nudged by EPSILON so e.g. 19.99 → 1999 rather than 1998.
 */
export function tokenAmountToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round((amount + Number.EPSILON) * 100)
}

/**
 * Resolve the USD-cent balance for the configured token from BlindPay's
 * per-symbol balance map. Missing token (or symbol absent) → 0 cents.
 */
export function walletBalanceToCents(
  balances: Record<string, { amount: number }>,
  token: string,
): number {
  return tokenAmountToCents(balances[token]?.amount ?? 0)
}

/** Format integer USD cents as `$1,234.56`. */
export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}
