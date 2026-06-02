import { z } from "zod"
import type { Bindings } from "./env"

const ExternalReceiverTokenResponse = z
  .object({
    token: z.string(),
    expires_at: z.string().optional(),
  })
  .passthrough()

const ReceiverSchema = z
  .object({
    id: z.string(),
    type: z.enum(["individual", "business"]),
    kyc_type: z.enum(["standard", "enhanced"]).optional(),
    kyc_status: z.enum(["verifying", "approved", "rejected"]).optional(),
    email: z.string().email().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    legal_name: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    kyc_warnings: z.array(z.unknown()).nullable().optional(),
  })
  .passthrough()

const BlockchainWalletResponse = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    network: z.string().optional(),
    address: z.string().optional(),
    is_account_abstraction: z.boolean().optional(),
  })
  .passthrough()

const ManagedWalletResponse = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    network: z.string().optional(),
    address: z.string(),
    external_id: z.string().nullable().optional(),
  })
  .passthrough()

const UsRailSchema = z
  .object({
    routing_number: z.string().optional(),
    account_number: z.string().optional(),
  })
  .passthrough()

// Beneficiary (account holder) and receiving-bank parties. The payer needs the
// full name + address of both to wire salary. Every field is optional — BlindPay
// only populates what the banking partner returns — and passthrough preserves
// anything we don't model.
const UsPartySchema = z
  .object({
    name: z.string().nullable().optional(),
    address_line_1: z.string().nullable().optional(),
    address_line_2: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state_province_region: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
  })
  .passthrough()

const VirtualAccountResponse = z
  .object({
    id: z.string(),
    status: z.string().optional(),
    kyc_status: z.string().optional(),
    banking_partner: z.string().optional(),
    token: z.string().optional(),
    blockchain_wallet_id: z.string().optional(),
    us: z
      .object({
        ach: UsRailSchema.optional(),
        wire: UsRailSchema.optional(),
        rtp: UsRailSchema.optional(),
        swift_bic_code: z.string().optional(),
        beneficiary: UsPartySchema.optional(),
        receiving_bank: UsPartySchema.optional(),
        account_type: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const TokenBalanceSchema = z
  .object({
    address: z.string(),
    id: z.string(),
    symbol: z.string(),
    amount: z.number(),
  })
  .passthrough()

// Keyed by token symbol (USDC / USDT / USDB). `amount` is BlindPay-normalized to
// a human-readable decimal token amount (the on-chain token's decimals — 6 for
// USDC, 18 for the dev USDB — are already applied upstream).
const WalletBalanceResponse = z.record(z.string(), TokenBalanceSchema)

// BlindPay bank account (`ba_…`). A flat superset of rail-specific fields;
// only id/type/name are guaranteed present, the rest are rail-dependent.
const BankAccountSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    name: z.string().nullable().optional(),
  })
  .passthrough()

// Quote response. Amounts are integer cents; expires_at is ms epoch.
// sender_amount = stablecoin the sender sends; receiver_amount = receiver's
// local fiat. `contract` (ERC20 abi/address) is only needed for external
// wallets — BlindPay-managed wallets are signed + gassed upstream.
const QuoteResponse = z
  .object({
    id: z.string(),
    expires_at: z.number(),
    sender_amount: z.number(),
    receiver_amount: z.number(),
    flat_fee: z.number().optional(),
    partner_fee_amount: z.number().optional(),
    commercial_quotation: z.number().optional(),
    blindpay_quotation: z.number().optional(),
  })
  .passthrough()

const PayoutResponse = z
  .object({
    id: z.string(),
    status: z.string().optional(),
    sender_amount: z.number().optional(),
    receiver_amount: z.number().optional(),
    tracking_transaction: z.unknown().optional(),
  })
  .passthrough()

const BlockchainSignMessageResponse = z
  .object({
    message: z.string(),
  })
  .passthrough()

export type Receiver = z.infer<typeof ReceiverSchema>
export type BlockchainWallet = z.infer<typeof BlockchainWalletResponse>
export type VirtualAccount = z.infer<typeof VirtualAccountResponse>
export type WalletBalance = z.infer<typeof WalletBalanceResponse>
export type BankAccount = z.infer<typeof BankAccountSchema>
export type Quote = z.infer<typeof QuoteResponse>
export type Payout = z.infer<typeof PayoutResponse>

export class BlindPayError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `BlindPay ${status}`)
    this.status = status
    this.body = body
  }
}

// Per-request timeout: a hung upstream otherwise stalls the Worker to the
// platform CPU/wall limit. Retries use exponential backoff between attempts.
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 250

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createBlindPay(env: Bindings) {
  const baseUrl = env.BLINDPAY_API_URL.replace(/\/$/, "")
  const instance = env.BLINDPAY_INSTANCE_ID
  const key = env.BLINDPAY_API_KEY

  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    schema: z.ZodSchema<T>,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
    }
    if (body !== undefined) init.body = JSON.stringify(body)

    // Only idempotent methods are safe to retry blindly. POSTs (quote / payout
    // creation) carry no BlindPay idempotency header, so a retry could mint a
    // duplicate — never retry them here.
    const retryable = method === "GET" || method === "DELETE"
    const maxAttempts = retryable ? MAX_RETRIES + 1 : 1

    let lastErr: unknown
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(`${baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
        })
      } catch (err) {
        // Network error or timeout abort. Retry idempotent methods, else throw.
        clearTimeout(timer)
        lastErr =
          err instanceof Error && err.name === "AbortError"
            ? new BlindPayError(
                504,
                null,
                `BlindPay ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`,
              )
            : err
        if (attempt < maxAttempts - 1) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
          continue
        }
        throw lastErr
      } finally {
        clearTimeout(timer)
      }

      const text = await res.text()
      let parsed: unknown
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }
      if (!res.ok) {
        const error = new BlindPayError(
          res.status,
          parsed,
          `BlindPay ${method} ${path} → ${res.status}`,
        )
        // Retry transient upstream failures (5xx) on idempotent methods only.
        if (res.status >= 500 && attempt < maxAttempts - 1) {
          lastErr = error
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
          continue
        }
        throw error
      }
      return schema.parse(parsed)
    }
    throw lastErr
  }

  return {
    /**
     * Mint an external receiver token. Returned `token` is a JWT used to
     * build the hosted KYC invite URL.
     */
    async createExternalReceiverToken(input: {
      type: "individual" | "business"
      kyc_type: "standard" | "enhanced"
    }) {
      return request(
        "POST",
        `/instances/${instance}/external-receiver-token`,
        ExternalReceiverTokenResponse,
        input,
      )
    },

    async getReceiver(receiverId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}`,
        ReceiverSchema,
      )
    },

    async listReceivers() {
      return request(
        "GET",
        `/instances/${instance}/receivers`,
        z.array(ReceiverSchema).or(z.object({ data: z.array(ReceiverSchema) })),
      )
    },

    /**
     * Create a BlindPay-managed wallet. BlindPay generates and controls the
     * key (no custody on Bulma's side). Returns a `bl_` id + on-chain address.
     */
    async createManagedWallet(input: {
      receiverId: string
      name: string
      network: string
    }) {
      const { receiverId, ...body } = input
      return request(
        "POST",
        `/instances/${instance}/receivers/${receiverId}/wallets`,
        ManagedWalletResponse,
        body,
      )
    },

    async listManagedWallets(receiverId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}/wallets`,
        z.array(ManagedWalletResponse),
      )
    },

    async listBlockchainWallets(receiverId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}/blockchain-wallets`,
        z.array(BlockchainWalletResponse),
      )
    },

    async listVirtualAccounts(receiverId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}/virtual-accounts`,
        z.array(VirtualAccountResponse),
      )
    },

    async getBlockchainSignMessage(receiverId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}/blockchain-wallets/sign-message`,
        BlockchainSignMessageResponse,
      )
    },

    async createBlockchainWallet(input: {
      receiverId: string
      name: string
      network: string
      is_account_abstraction?: boolean
      address?: string
      signature_tx_hash?: string
    }) {
      const { receiverId, ...body } = input
      return request(
        "POST",
        `/instances/${instance}/receivers/${receiverId}/blockchain-wallets`,
        BlockchainWalletResponse,
        body,
      )
    },

    async getVirtualAccount(receiverId: string, virtualAccountId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}/virtual-accounts/${virtualAccountId}`,
        VirtualAccountResponse,
      )
    },

    /**
     * Per-token balances for a managed wallet, keyed by token symbol. Amounts
     * are BlindPay-normalized decimals (token decimals already applied).
     */
    async getWalletBalance(receiverId: string, walletId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}/wallets/${walletId}/balance`,
        WalletBalanceResponse,
      )
    },

    async createVirtualAccount(input: {
      receiverId: string
      token: string
      blockchain_wallet_id: string
      banking_partner: string
    }) {
      const { receiverId, ...body } = input
      return request(
        "POST",
        `/instances/${instance}/receivers/${receiverId}/virtual-accounts`,
        VirtualAccountResponse,
        body,
      )
    },

    async createBankAccount(receiverId: string, body: Record<string, unknown>) {
      return request(
        "POST",
        `/instances/${instance}/receivers/${receiverId}/bank-accounts`,
        BankAccountSchema,
        body,
      )
    },

    async listBankAccounts(receiverId: string) {
      return request(
        "GET",
        `/instances/${instance}/receivers/${receiverId}/bank-accounts`,
        z.array(BankAccountSchema),
      )
    },

    async deleteBankAccount(receiverId: string, bankAccountId: string) {
      return request(
        "DELETE",
        `/instances/${instance}/receivers/${receiverId}/bank-accounts/${bankAccountId}`,
        z.unknown(),
      )
    },

    async createQuote(input: {
      bank_account_id: string
      currency_type: "sender" | "receiver"
      cover_fees: boolean
      request_amount: number
      network: string
      token: string
      partner_fee_id: string
    }) {
      return request(
        "POST",
        `/instances/${instance}/quotes`,
        QuoteResponse,
        input,
      )
    },

    /**
     * Execute an EVM payout against a quote. For BlindPay-managed wallets,
     * BlindPay performs the on-chain approve + transfer + gas; we only pass the
     * managed wallet's address as the sender.
     */
    async createPayoutEvm(input: {
      quote_id: string
      sender_wallet_address: string
    }) {
      return request(
        "POST",
        `/instances/${instance}/payouts/evm`,
        PayoutResponse,
        input,
      )
    },

    async getPayout(payoutId: string) {
      return request(
        "GET",
        `/instances/${instance}/payouts/${payoutId}`,
        PayoutResponse,
      )
    },
  }
}

export type BlindPayClient = ReturnType<typeof createBlindPay>
