import { customAlphabet, nanoid } from "nanoid"
import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import { payouts, quotes, referralCodes, referralCredits } from "../db/schema"

const SLOTS_PER_USER = 5
const FORFEIT_WINDOW_SEC = 60 * 60 * 24 * 30 // 30 days
// Grace before a reserved-but-uncommitted credit is treated as orphaned by a
// crashed execute. Far longer than any in-flight execute (a single BlindPay
// round-trip), so a live request is never reconciled out from under itself.
const RESERVATION_GRACE_SEC = 60 * 15 // 15 minutes

// 6-char human share code, excluding ambiguous I/O/0/1 (AGENTS.md §2c).
const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const REFERRAL_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
const codeGen = customAlphabet(REFERRAL_ALPHABET, 6)

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

// --- Pure helpers (unit-tested in tests/referrals.test.ts) ---

export function generateReferralCode(): string {
  return codeGen()
}

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_RE.test(code)
}

export type AttachableCode = {
  ownerUserId: string | null
  status: "available" | "shared" | "converted" | "expired"
  convertedUserId: string | null
}

export type AttachResult = "ok" | "self_referral" | "already_used" | "expired" | "not_shareable"

/** Decide whether `refereeUserId` may attach to a referral code. Pure: the DB
 *  write is gated separately (first-wins on `converted_user_id IS NULL`). */
export function attachDecision(
  code: AttachableCode,
  refereeUserId: string,
): AttachResult {
  if (code.ownerUserId && code.ownerUserId === refereeUserId) {
    return "self_referral"
  }
  if (code.status === "expired") return "expired"
  if (code.status === "converted" || code.convertedUserId) return "already_used"
  if (code.status === "available" || code.status === "shared") return "ok"
  return "not_shareable"
}

export type ForfeitSlot = {
  status: "available" | "shared" | "converted" | "expired"
  sharedAt: number | null
  convertedAt: number | null
}

/** Forfeit (Option A, open-questions.md §8): all 5 slots shared, none converted,
 *  and the oldest share is past the window. */
export function isForfeitEligible(
  slots: ForfeitSlot[],
  now: number = nowSec(),
  windowSec: number = FORFEIT_WINDOW_SEC,
): boolean {
  if (slots.length !== SLOTS_PER_USER) return false
  if (!slots.every((s) => s.status === "shared")) return false
  if (slots.some((s) => s.convertedAt != null)) return false
  const oldestShare = Math.min(
    ...slots.map((s) => s.sharedAt ?? Number.POSITIVE_INFINITY),
  )
  return Number.isFinite(oldestShare) && oldestShare < now - windowSec
}

export type ReservationRow = {
  status: "available" | "consumed" | "expired"
  consumedPayoutId: string | null
  consumedAt: number | null
}

/** A reservation is orphaned when it was reserved (`consumed`) but never linked
 *  to a payout (`consumedPayoutId IS NULL`) and the grace window has elapsed —
 *  i.e. an execute crashed between reserving the credit and committing it. Pure;
 *  the DB resolution is `reconcileStuckReferralCredits`. */
export function isOrphanedReservation(
  credit: ReservationRow,
  now: number = nowSec(),
  graceSec: number = RESERVATION_GRACE_SEC,
): boolean {
  return (
    credit.status === "consumed" &&
    credit.consumedPayoutId == null &&
    (credit.consumedAt ?? 0) <= now - graceSec
  )
}

export function shareLink(wwwUrl: string, code: string): string {
  return `${wwwUrl.replace(/\/$/, "")}/i/${code}`
}

function newCodeId(): string {
  return `rc_${nanoid(12)}`
}

function newCreditId(): string {
  return `rcr_${nanoid(12)}`
}

// --- DB operations (shared by routes, webhook handler, and cron) ---

/** Idempotently give a user their 5 referral slots. Called on the ready
 *  transition and lazily on first GET /referrals. */
export async function ensureReferralCodes(
  db: DrizzleD1Database,
  userId: string,
): Promise<void> {
  const existing = await db
    .select({ id: referralCodes.id })
    .from(referralCodes)
    .where(eq(referralCodes.ownerUserId, userId))
    .all()
  if (existing.length > 0) return
  const now = nowSec()
  const rows = Array.from({ length: SLOTS_PER_USER }, () => ({
    id: newCodeId(),
    ownerUserId: userId,
    code: generateReferralCode(),
    status: "available" as const,
    createdAt: now,
  }))
  await db.insert(referralCodes).values(rows)
}

/** Attach a referee to a code at onboarding start. First-wins on the atomic
 *  `converted_user_id IS NULL` guard so a code can only be claimed once. */
export async function attachReferralCode(
  db: DrizzleD1Database,
  codeValue: string,
  refereeUserId: string,
): Promise<AttachResult | "invalid"> {
  const code = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.code, codeValue))
    .get()
  if (!code) return "invalid"

  const decision = attachDecision(code, refereeUserId)
  if (decision !== "ok") return decision

  const res = await db
    .update(referralCodes)
    .set({
      convertedUserId: refereeUserId,
      status: "shared",
      sharedAt: code.sharedAt ?? nowSec(),
    })
    .where(
      and(eq(referralCodes.id, code.id), isNull(referralCodes.convertedUserId)),
    )
    .run()
  return (res.meta?.changes ?? 0) > 0 ? "ok" : "already_used"
}

/** Fire on the referee reaching `ready`: convert the code they used and award
 *  the owner one available credit. */
export async function convertReferralForReferee(
  db: DrizzleD1Database,
  refereeUserId: string,
): Promise<void> {
  const code = await db
    .select()
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.convertedUserId, refereeUserId),
        eq(referralCodes.status, "shared"),
        isNull(referralCodes.convertedAt),
      ),
    )
    .get()
  if (!code?.ownerUserId) return

  await db
    .update(referralCodes)
    .set({ status: "converted", convertedAt: nowSec() })
    .where(eq(referralCodes.id, code.id))
  await db.insert(referralCredits).values({
    id: newCreditId(),
    userId: code.ownerUserId,
    sourceCodeId: code.id,
    status: "available",
    createdAt: nowSec(),
  })
}

/** Atomically reserve the oldest available credit (FIFO) for an in-flight
 *  payout. Returns `{ creditId, sourceCodeId }` on success, null if no credit
 *  is available or another writer already grabbed it. The source-code slot is
 *  not yet recycled — that happens at `commitReferralCredit` once the BlindPay
 *  payout has been created — so an aborted execute can be rolled back without
 *  losing the original referral code value.
 *
 *  Pair with `commitReferralCredit` (on payout success) or
 *  `unreserveReferralCredit` (on payout failure). */
export async function reserveReferralCredit(
  db: DrizzleD1Database,
  userId: string,
): Promise<{
  creditId: string
  sourceCodeId: string
} | null> {
  const credit = await db
    .select()
    .from(referralCredits)
    .where(
      and(
        eq(referralCredits.userId, userId),
        eq(referralCredits.status, "available"),
      ),
    )
    .orderBy(asc(referralCredits.createdAt))
    .limit(1)
    .get()
  if (!credit) return null
  const res = await db
    .update(referralCredits)
    .set({ status: "consumed", consumedAt: nowSec() })
    .where(
      and(
        eq(referralCredits.id, credit.id),
        eq(referralCredits.status, "available"),
      ),
    )
    .run()
  if ((res.meta?.changes ?? 0) === 0) return null
  return { creditId: credit.id, sourceCodeId: credit.sourceCodeId }
}

/** Link a reserved credit to a payout and recycle its source-code slot. */
export async function commitReferralCredit(
  db: DrizzleD1Database,
  reservation: {
    creditId: string
    sourceCodeId: string
  },
  payoutId: string,
): Promise<void> {
  await db
    .update(referralCredits)
    .set({ consumedPayoutId: payoutId })
    .where(eq(referralCredits.id, reservation.creditId))
  await db
    .update(referralCodes)
    .set({
      status: "available",
      convertedUserId: null,
      convertedAt: null,
      sharedAt: null,
      code: generateReferralCode(),
    })
    .where(eq(referralCodes.id, reservation.sourceCodeId))
}

/** Roll back a reserved credit when the payout it backed failed to create. */
export async function unreserveReferralCredit(
  db: DrizzleD1Database,
  reservation: { creditId: string },
): Promise<void> {
  await db
    .update(referralCredits)
    .set({ status: "available", consumedAt: null })
    .where(eq(referralCredits.id, reservation.creditId))
}

/** Peek whether the user has at least one `available` credit. Used by the
 *  quote path to decide which partner-fee id (free vs paid) BlindPay should
 *  apply, without reserving the credit (consumption happens at execute). */
export async function hasAvailableReferralCredit(
  db: DrizzleD1Database,
  userId: string,
): Promise<boolean> {
  const row = await db
    .select({ id: referralCredits.id })
    .from(referralCredits)
    .where(
      and(
        eq(referralCredits.userId, userId),
        eq(referralCredits.status, "available"),
      ),
    )
    .limit(1)
    .get()
  return Boolean(row)
}

/** Return a credit to `available` when its payout is refunded or fails. */
export async function returnReferralCredit(
  db: DrizzleD1Database,
  payoutId: string,
): Promise<void> {
  await db
    .update(referralCredits)
    .set({ status: "available", consumedPayoutId: null, consumedAt: null })
    .where(eq(referralCredits.consumedPayoutId, payoutId))
}

/** Nightly sweep: for owners who shared all 5 slots without a single
 *  conversion past the window, expire those slots and revoke their available
 *  credits (forfeit Option A). Returns the number of owners forfeited. */
export async function runForfeitSweep(
  db: DrizzleD1Database,
  now: number = nowSec(),
  windowSec: number = FORFEIT_WINDOW_SEC,
): Promise<number> {
  const rows = await db
    .select()
    .from(referralCodes)
    .where(ne(referralCodes.status, "expired"))
    .all()

  const byOwner = new Map<string, typeof rows>()
  for (const r of rows) {
    if (!r.ownerUserId) continue
    const list = byOwner.get(r.ownerUserId) ?? []
    list.push(r)
    byOwner.set(r.ownerUserId, list)
  }

  let forfeited = 0
  for (const [ownerUserId, slots] of byOwner) {
    if (!isForfeitEligible(slots, now, windowSec)) continue
    await db
      .update(referralCodes)
      .set({ status: "expired" })
      .where(
        and(
          eq(referralCodes.ownerUserId, ownerUserId),
          eq(referralCodes.status, "shared"),
        ),
      )
    await db
      .update(referralCredits)
      .set({ status: "expired" })
      .where(
        and(
          eq(referralCredits.userId, ownerUserId),
          eq(referralCredits.status, "available"),
        ),
      )
    forfeited++
  }
  return forfeited
}

/**
 * Resolve referral credits that an execute reserved but never committed because
 * the Worker died mid-flight (between `reserveReferralCredit` and
 * `commitReferralCredit` — `unreserveReferralCredit` only fires on a BlindPay
 * *throw*, not a crash). For each orphaned reservation past the grace window:
 *  - commit it to the user's oldest free-priced payout that no credit yet backs
 *    (the crash happened after the payout was created), or
 *  - release it back to `available` if no such payout exists (the crash happened
 *    before any payout was created).
 *
 * Idempotent and safe to run nightly. `linked` is tracked in-process so two
 * orphaned credits for one user can't both grab the same payout. Closes
 * production.md §4.
 */
export async function reconcileStuckReferralCredits(
  db: DrizzleD1Database,
  freePartnerFeeId: string,
  now: number = nowSec(),
  graceSec: number = RESERVATION_GRACE_SEC,
): Promise<{
  committed: number
  released: number
}> {
  const reserved = await db
    .select()
    .from(referralCredits)
    .where(
      and(
        eq(referralCredits.status, "consumed"),
        isNull(referralCredits.consumedPayoutId),
      ),
    )
    .all()
  const orphaned = reserved.filter((c) =>
    isOrphanedReservation(c, now, graceSec),
  )
  if (orphaned.length === 0) return { committed: 0, released: 0 }

  // Payout ids already backed by a committed credit — never double-link one.
  const linkedRows = await db
    .select({ pid: referralCredits.consumedPayoutId })
    .from(referralCredits)
    .where(isNotNull(referralCredits.consumedPayoutId))
    .all()
  const linked = new Set(linkedRows.map((r) => r.pid as string))

  let committed = 0
  let released = 0
  for (const credit of orphaned) {
    // Free-priced payouts for this user, oldest first. A free quote is the only
    // kind that consumes a credit, so a paid payout can never be the match.
    // eslint-disable-next-line no-await-in-loop -- serial: each commit mutates `linked`
    const userFreePayouts = await db
      .select({ id: payouts.id })
      .from(payouts)
      .innerJoin(quotes, eq(quotes.id, payouts.quoteId))
      .where(
        and(
          eq(payouts.userId, credit.userId),
          eq(quotes.partnerFeeId, freePartnerFeeId),
        ),
      )
      .orderBy(asc(payouts.createdAt))
      .all()
    const match = userFreePayouts.find((p) => !linked.has(p.id))
    if (match) {
      // eslint-disable-next-line no-await-in-loop -- serial commit, see above
      await commitReferralCredit(
        db,
        { creditId: credit.id, sourceCodeId: credit.sourceCodeId },
        match.id,
      )
      linked.add(match.id)
      committed++
    } else {
      // eslint-disable-next-line no-await-in-loop -- serial release, see above
      await unreserveReferralCredit(db, { creditId: credit.id })
      released++
    }
  }
  return { committed, released }
}
