import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import { referralCodes } from "../../db/schema"
import { generateReferralCode } from "../referrals"

/**
 * System-issued invite codes for the email agent. They are ordinary
 * `referral_codes` rows with `owner_user_id = NULL` (so no one earns a credit
 * when they convert) and `issued_to_email` set. `attachReferralCode` already
 * accepts unowned codes, and every owner-scoped query (`ensureReferralCodes`,
 * the forfeit sweep) filters on `owner_user_id`, so these rows are invisible
 * to the user-facing referral mechanic.
 */

const LIVE_STATUSES = ["available", "shared"] as const

export type LiveInvite = {
  id: string
  code: string
}

export type IssuedInvite = {
  id: string
  code: string
  /** True when the sender already had a live code and we re-sent it. */
  reused: boolean
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

/** The sender's live (not yet converted / expired) invite, if any. */
export async function findLiveInviteForEmail(
  db: DrizzleD1Database,
  email: string,
): Promise<LiveInvite | null> {
  const row = await db
    .select({ id: referralCodes.id, code: referralCodes.code })
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.issuedToEmail, email.toLowerCase()),
        inArray(referralCodes.status, [...LIVE_STATUSES]),
      ),
    )
    .get()
  return row ?? null
}

/**
 * One live invite per email address: return the existing one if present,
 * otherwise mint a new unowned code. Idempotent, so a sender asking twice gets
 * the same code and cannot farm invites.
 */
export async function issueInviteForEmail(
  db: DrizzleD1Database,
  email: string,
): Promise<IssuedInvite> {
  const normalized = email.toLowerCase()
  const existing = await findLiveInviteForEmail(db, normalized)
  if (existing) return { ...existing, reused: true }

  const row = {
    id: `rc_${nanoid(12)}`,
    ownerUserId: null,
    code: generateReferralCode(),
    status: "available" as const,
    issuedToEmail: normalized,
    createdAt: nowSec(),
  }
  await db.insert(referralCodes).values(row)
  return { id: row.id, code: row.code, reused: false }
}
