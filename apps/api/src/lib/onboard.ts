import { and, eq, ne } from "drizzle-orm"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import { z } from "zod"
import { user as userTable, userProfile } from "../db/schema"
import { BlindPayError, createBlindPay } from "./blindpay"
import { convertReferralForReferee, ensureReferralCodes } from "./referrals"
import type { Bindings } from "./env"

const ManagedWalletRefSchema = z.object({
  id: z.string(),
  address: z.string(),
})
export type ManagedWalletRef = z.infer<typeof ManagedWalletRefSchema>

const BlockchainWalletRefSchema = z.object({
  id: z.string(),
  address: z.string().optional(),
  is_account_abstraction: z.boolean().optional(),
})
export type BlockchainWalletRef = z.infer<typeof BlockchainWalletRefSchema>

const VirtualAccountRefSchema = z.object({ id: z.string() })
export type VirtualAccountRef = z.infer<typeof VirtualAccountRefSchema>

/**
 * Pick an existing BlindPay-managed wallet to reuse, or null to signal "create
 * a new one". Reusing keeps a duplicate `receiver.update approved` event (after
 * local state was lost) from provisioning a second wallet.
 */
export function pickManagedWallet(
  existing: ManagedWalletRef[],
): ManagedWalletRef | null {
  return existing[0] ?? null
}

/**
 * Virtual accounts are US-only (SSN/EIN). Missing country → attempt (BlindPay is
 * the final arbiter); an explicit non-US country → skip the VA step entirely.
 */
export function isVirtualAccountEligible(
  country: string | null | undefined,
): boolean {
  return country == null || country.toUpperCase() === "US"
}

const VirtualAccountPlanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skip") }),
  z.object({ kind: z.literal("reuse"), virtualAccountId: z.string() }),
  z.object({ kind: z.literal("create"), bridgeId: z.string().nullable() }),
])
export type VirtualAccountPlan = z.infer<typeof VirtualAccountPlanSchema>

/**
 * Decide how to satisfy the virtual account: skip (ineligible / no wallet),
 * reuse an existing VA, or create one — reusing an AA blockchain-wallet bridge
 * for the managed wallet's address when present, else creating the bridge
 * (`bridgeId: null`).
 */
export function pickVirtualAccountPlan(
  eligible: boolean,
  walletAddress: string | null,
  existingVas: VirtualAccountRef[],
  existingBridges: BlockchainWalletRef[],
): VirtualAccountPlan {
  if (!eligible || !walletAddress) return { kind: "skip" }
  const reusedVa = existingVas[0]
  if (reusedVa) return { kind: "reuse", virtualAccountId: reusedVa.id }
  const bridge = existingBridges.find(
    (w) =>
      Boolean(w.is_account_abstraction) &&
      w.address?.toLowerCase() === walletAddress.toLowerCase(),
  )
  return { kind: "create", bridgeId: bridge?.id ?? null }
}

export type ReceiverSnapshot = {
  id: string
  email?: string
  kyc_status?: "verifying" | "approved" | "rejected"
  country?: string | null
}

/**
 * Resolve a BlindPay receiver to a local user. Prefers a receiver_id match
 * (the strongest binding) and falls through to email lookup only when no
 * profile is yet bound to the receiver. If the receiver is already bound to
 * a different user, the email fallback is refused so a colliding email can't
 * silently re-assign another user's receiver.
 */
export async function findUserIdForReceiver(
  data: {
    id: string
    email?: string
  },
  db: DrizzleD1Database,
): Promise<string | null> {
  const byReceiver = await db
    .select({ userId: userProfile.userId })
    .from(userProfile)
    .where(eq(userProfile.receiverId, data.id))
    .get()
  if (byReceiver) return byReceiver.userId

  if (data.email) {
    const byEmail = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, data.email))
      .get()
    if (!byEmail) return null
    const candidateProfile = await db
      .select({ receiverId: userProfile.receiverId })
      .from(userProfile)
      .where(eq(userProfile.userId, byEmail.id))
      .get()
    // Refuse to migrate a user from one receiver to another via email match.
    if (
      candidateProfile?.receiverId &&
      candidateProfile.receiverId !== data.id
    ) {
      console.warn(
        "findUserIdForReceiver: refusing email-match cross-binding",
        {
          userId: byEmail.id,
          existingReceiverId: candidateProfile.receiverId,
          incomingReceiverId: data.id,
        },
      )
      return null
    }
    return byEmail.id
  }
  return null
}

/**
 * Apply a BlindPay receiver snapshot to a known local user. Sets onboarding
 * state from kyc_status, and provisions wallet + virtual account on approval.
 * Idempotent: safe to call from webhook delivery and from on-demand polling.
 */
export async function applyReceiverStateForUser(
  userId: string,
  snapshot: ReceiverSnapshot,
  env: Bindings,
  db: DrizzleD1Database,
): Promise<void> {
  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .get()
  if (!profile) return

  // Never overwrite a different receiver already bound to this profile; never
  // adopt a receiver that another user already owns. Both are cross-tenant
  // hazards (the second can't happen via the receiver-first lookup above, but
  // applyReceiverStateForUser is also called directly from the webhook path).
  if (profile.receiverId && profile.receiverId !== snapshot.id) {
    console.warn(
      "applyReceiverStateForUser: profile already bound to different receiver",
      {
        userId,
        existingReceiverId: profile.receiverId,
        incomingReceiverId: snapshot.id,
      },
    )
    return
  }
  const otherOwner = await db
    .select({ userId: userProfile.userId })
    .from(userProfile)
    .where(
      and(
        eq(userProfile.receiverId, snapshot.id),
        ne(userProfile.userId, userId),
      ),
    )
    .get()
  if (otherOwner) {
    console.warn(
      "applyReceiverStateForUser: receiver already owned by another user",
      {
        userId,
        otherUserId: otherOwner.userId,
        receiverId: snapshot.id,
      },
    )
    return
  }

  const updates: Partial<typeof userProfile.$inferInsert> = {
    receiverId: snapshot.id,
  }

  if (snapshot.kyc_status === "rejected") {
    updates.onboardingState = "rejected"
    await db
      .update(userProfile)
      .set(updates)
      .where(eq(userProfile.userId, userId))
    return
  }

  if (snapshot.kyc_status === "approved") {
    updates.onboardingState = "approved"
    await db
      .update(userProfile)
      .set(updates)
      .where(eq(userProfile.userId, userId))
    await provisionWalletAndVirtualAccount(
      userId,
      snapshot.id,
      isVirtualAccountEligible(snapshot.country),
      env,
      db,
    )
    return
  }

  if (snapshot.kyc_status === "verifying" || !snapshot.kyc_status) {
    updates.onboardingState = "pending"
    await db
      .update(userProfile)
      .set(updates)
      .where(eq(userProfile.userId, userId))
  }
}

async function provisionWalletAndVirtualAccount(
  userId: string,
  receiverId: string,
  vaEligible: boolean,
  env: Bindings,
  db: DrizzleD1Database,
): Promise<void> {
  const blindpay = createBlindPay(env)

  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .get()
  if (!profile) return

  // 1. BlindPay-managed wallet — BlindPay generates + controls the key (no
  //    custody). Reuse the local id, else an existing BlindPay wallet, else
  //    create one. Reuse keeps duplicate `receiver.update approved` events
  //    from provisioning a second wallet.
  let walletId = profile.walletId ?? null
  let walletAddress = profile.walletAddress ?? null
  if (!walletId) {
    const reused = pickManagedWallet(
      await blindpay.listManagedWallets(receiverId),
    )
    if (reused) {
      walletId = reused.id
      walletAddress = reused.address
    } else {
      const wallet = await blindpay.createManagedWallet({
        receiverId,
        name: "Primary",
        network: env.BLINDPAY_NETWORK,
      })
      walletId = wallet.id
      walletAddress = wallet.address
    }
    await db
      .update(userProfile)
      .set({ walletId, walletAddress })
      .where(eq(userProfile.userId, userId))
  }

  // 2. Virtual account needs a blockchain-wallet (bw_) reference. Reuse the
  //    local id, else an existing VA, else bridge the managed wallet's
  //    BlindPay-controlled address as an AA wallet and create the VA.
  let virtualAccountId = profile.virtualAccountId ?? null
  if (!virtualAccountId) {
    try {
      const plan = pickVirtualAccountPlan(
        vaEligible,
        walletAddress,
        await blindpay.listVirtualAccounts(receiverId),
        await blindpay.listBlockchainWallets(receiverId),
      )
      if (plan.kind === "reuse") {
        virtualAccountId = plan.virtualAccountId
      } else if (plan.kind === "create") {
        const bridgeId =
          plan.bridgeId ??
          (
            await blindpay.createBlockchainWallet({
              receiverId,
              name: "Primary",
              network: env.BLINDPAY_NETWORK,
              is_account_abstraction: true,
              address: walletAddress ?? undefined,
            })
          ).id
        // JP Morgan is the only supported issuer. Issuance has a ~24h SLA;
        // surfaced by `GET /accounts/virtual` via the VA's `status` field.
        const va = await blindpay.createVirtualAccount({
          receiverId,
          token: env.BLINDPAY_TOKEN,
          blockchain_wallet_id: bridgeId,
          banking_partner: "jpmorgan",
        })
        virtualAccountId = va.id
      }
      if (virtualAccountId) {
        await db
          .update(userProfile)
          .set({ virtualAccountId })
          .where(eq(userProfile.userId, userId))
      }
    } catch (err) {
      console.warn(
        "virtual account creation skipped/failed (non-US receiver?)",
        err,
      )
    }
  }

  await db
    .update(userProfile)
    .set({ onboardingState: "ready" })
    .where(eq(userProfile.userId, userId))

  await ensureReferralCodes(db, userId)
  await convertReferralForReferee(db, userId)
}

/**
 * On-demand poll: if local onboarding is still `pending`, fetch the receiver
 * from BlindPay and apply any state change (approved/rejected). No-op for
 * users in any other state — terminal states are trusted, and we don't want
 * to spam BlindPay on every authed request.
 *
 * Falls back to `listReceivers` + email match when the local profile has no
 * receiverId (the `receiver.new` webhook was dropped between hosted-KYC
 * completion and our handler).
 */
export async function reconcileReceiverForUser(
  userId: string,
  env: Bindings,
  db: DrizzleD1Database,
): Promise<void> {
  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .get()
  if (!profile) return
  if (profile.onboardingState !== "pending") return

  const blindpay = createBlindPay(env)

  let receiverId = profile.receiverId
  if (!receiverId) {
    const u = await db
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .get()
    if (!u?.email) return
    try {
      const list = await blindpay.listReceivers()
      const arr = Array.isArray(list) ? list : list.data
      const match = arr.find(
        (r) => r.email?.toLowerCase() === u.email.toLowerCase(),
      )
      if (!match) return
      receiverId = match.id
    } catch (err) {
      const status = err instanceof BlindPayError ? err.status : 0
      console.warn("reconcileReceiverForUser: listReceivers failed", {
        userId,
        status,
      })
      return
    }
  }

  try {
    const receiver = await blindpay.getReceiver(receiverId)
    await applyReceiverStateForUser(
      userId,
      {
        id: receiver.id,
        email: receiver.email,
        kyc_status: receiver.kyc_status,
        country: receiver.country ?? undefined,
      },
      env,
      db,
    )
  } catch (err) {
    const status = err instanceof BlindPayError ? err.status : 0
    console.warn("reconcileReceiverForUser: getReceiver failed", {
      userId,
      receiverId,
      status,
    })
  }
}
