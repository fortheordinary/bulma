export type Bindings = {
  DB: D1Database
  ENVIRONMENT: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  WWW_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  BLINDPAY_API_KEY: string
  BLINDPAY_INSTANCE_ID: string
  BLINDPAY_API_URL: string
  BLINDPAY_NETWORK: string
  BLINDPAY_TOKEN: string
  BLINDPAY_WEBHOOK_SECRET: string
  BLINDPAY_HOSTED_INVITE_URL: string
  BLINDPAY_PARTNER_FEE_ID_FREE: string
  BLINDPAY_PARTNER_FEE_ID_PAID: string
  LOG_LEVEL?: string
  // --- Email agent (agent@bul.ma) ---
  // Cloudflare Email Sending binding (wrangler.toml [[send_email]]).
  EMAIL: SendEmail
  // Google AI Studio key for Gemini (secret).
  GEMINI_API_KEY: string
  // Defaults to gemini-3.8-flash (see lib/email-agent/gemini.ts).
  GEMINI_MODEL?: string
  // Mailbox the agent answers for. Defaults to agent@bul.ma.
  EMAIL_AGENT_ADDRESS?: string
  // Optional verified Email Routing destination that gets a copy of every
  // non-spam inbound (audit trail / human escalation). Off when unset.
  EMAIL_AGENT_FORWARD_TO?: string
  // Per-sender inbound cap per rolling 24h before we stop spending AI tokens.
  EMAIL_AGENT_MAX_PER_SENDER_DAY?: string
  // Comma-separated sender domains dropped before any AI call.
  EMAIL_AGENT_BLOCKED_DOMAINS?: string
}
