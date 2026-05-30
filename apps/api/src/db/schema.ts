import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { user } from "./auth-schema"

export * from "./auth-schema"

export const userProfile = sqliteTable("user_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  onboardingState: text("onboarding_state", {
    enum: ["none", "pending", "approved", "rejected", "ready"],
  })
    .notNull()
    .default("none"),
  receiverId: text("receiver_id").unique(),
  walletId: text("wallet_id"),
  walletAddress: text("wallet_address"),
  virtualAccountId: text("virtual_account_id"),
  createdAt: integer("created_at").notNull(),
})

export const deviceCodes = sqliteTable("device_codes", {
  deviceCode: text("device_code").primaryKey(),
  userCode: text("user_code").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  approvedSessionId: text("approved_session_id"),
  lastPolledAt: integer("last_polled_at"),
  createdAt: integer("created_at").notNull(),
})

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  response: text("response").notNull(),
  statusCode: integer("status_code").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const referralCodes = sqliteTable("referral_codes", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").references(() => user.id, {
    onDelete: "cascade",
  }),
  code: text("code").notNull().unique(),
  status: text("status", {
    enum: ["available", "shared", "converted", "expired"],
  })
    .notNull()
    .default("available"),
  sharedAt: integer("shared_at"),
  convertedUserId: text("converted_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  convertedAt: integer("converted_at"),
  createdAt: integer("created_at").notNull(),
})

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  processedAt: integer("processed_at"),
  error: text("error"),
  // Dispatch attempts so far. The nightly cron re-dispatches unprocessed rows
  // (Svix already got 200, so it never redelivers) up to MAX_DISPATCH_ATTEMPTS.
  attempts: integer("attempts").notNull().default(0),
  receivedAt: integer("received_at").notNull(),
})

export const referralCredits = sqliteTable("referral_credits", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  sourceCodeId: text("source_code_id")
    .notNull()
    .references(() => referralCodes.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["available", "consumed", "expired"],
  })
    .notNull()
    .default("available"),
  consumedPayoutId: text("consumed_payout_id"),
  createdAt: integer("created_at").notNull(),
  consumedAt: integer("consumed_at"),
  expiresAt: integer("expires_at"),
})

// Quote audit trail. id is BlindPay's `qu_…`. Amounts are integer cents.
export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  bankAccountId: text("bank_account_id").notNull(),
  currencyType: text("currency_type").notNull(),
  coverFees: integer("cover_fees", { mode: "boolean" }).notNull(),
  network: text("network").notNull(),
  token: text("token").notNull(),
  partnerFeeId: text("partner_fee_id"),
  senderAmount: integer("sender_amount").notNull(),
  receiverAmount: integer("receiver_amount").notNull(),
  flatFee: integer("flat_fee"),
  partnerFeeAmount: integer("partner_fee_amount"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
})

// Payout status tracking. id is BlindPay's `po_…`. `status` mirrors BlindPay's
// raw status (processing/completed/failed/refunded/…); kept as text so a new
// upstream status never drops an event.
export const payouts = sqliteTable("payouts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  quoteId: text("quote_id").notNull(),
  bankAccountId: text("bank_account_id"),
  status: text("status").notNull(),
  senderAmount: integer("sender_amount"),
  receiverAmount: integer("receiver_amount"),
  senderWalletAddress: text("sender_wallet_address"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export type UserProfile = typeof userProfile.$inferSelect
export type NewUserProfile = typeof userProfile.$inferInsert
export type DeviceCode = typeof deviceCodes.$inferSelect
export type NewDeviceCode = typeof deviceCodes.$inferInsert
export type ReferralCode = typeof referralCodes.$inferSelect
export type NewReferralCode = typeof referralCodes.$inferInsert
export type ReferralCredit = typeof referralCredits.$inferSelect
export type NewReferralCredit = typeof referralCredits.$inferInsert
export type WebhookEvent = typeof webhookEvents.$inferSelect
export type NewWebhookEvent = typeof webhookEvents.$inferInsert
export type Quote = typeof quotes.$inferSelect
export type NewQuote = typeof quotes.$inferInsert
export type Payout = typeof payouts.$inferSelect
export type NewPayout = typeof payouts.$inferInsert
