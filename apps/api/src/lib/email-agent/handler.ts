import { and, count, eq, gt } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { nanoid } from "nanoid"
import PostalMime from "postal-mime"
import { agentEmails } from "../../db/schema"
import type { Bindings } from "../env"
import { createLogger, type Logger } from "../logger"
import { shareLink } from "../referrals"
import { classifyAndDraft, GeminiError, type AgentDecision } from "./gemini"
import { findLiveInviteForEmail, issueInviteForEmail } from "./invites"
import {
  AGENT_NAME,
  FALLBACK_REPLY,
  OFF_TOPIC_REPLY,
  inviteBlock,
} from "./knowledge"
import {
  cleanBody,
  cleanSubject,
  replySubject,
  validateReply,
} from "./sanitize"
import { prefilter } from "./spam"

/**
 * Inbound pipeline for agent@bul.ma. Wired to the Worker's `email()` export in
 * src/index.ts. Order matters: every step before the model call is free:
 *
 *   parse MIME → deterministic prefilter (spam/bounce/list/auth) → Message-ID
 *   dedupe → per-sender rate limit → Gemini classify+draft → output validation
 *   → invite issuance (by code, never by the model) → send via EMAIL binding.
 *
 * Silence is the default failure mode: a dropped email gets no reply at all,
 * a model/validation failure gets a fixed fallback (never model text).
 */

export const DEFAULT_AGENT_ADDRESS = "agent@bul.ma"
const DEFAULT_MAX_PER_SENDER_DAY = 10
const DAY_SEC = 60 * 60 * 24

export type EmailAgentDeps = {
  /** Injected in tests; defaults to global fetch (Gemini). */
  fetchImpl?: typeof fetch
  now?: () => number
}

export type HandleResult = {
  outcome: "dropped"
  stage: "prefilter" | "dedupe" | "rate_limit" | "model"
  reason: string
} | {
  outcome: "replied"
  category: AgentDecision["category"] | "fallback"
  inviteCode?: string
} | {
  outcome: "error"
  reason: string
}

function nowSecDefault(): number {
  return Math.floor(Date.now() / 1000)
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

function parseBlockedDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Bindings,
  deps: EmailAgentDeps = {},
): Promise<HandleResult> {
  const now = deps.now ?? nowSecDefault
  const agentAddress = (
    env.EMAIL_AGENT_ADDRESS ?? DEFAULT_AGENT_ADDRESS
  ).toLowerCase()
  const from = message.from.trim().toLowerCase()
  const db = drizzle(env.DB)
  const log: Logger = createLogger(env, {
    source: "email_agent",
    from,
    to: message.to,
    size: message.rawSize,
  })

  // 1. Parse. `message.raw` is single-use, buffer once.
  const raw = await new Response(message.raw).arrayBuffer()
  const parsed = await PostalMime.parse(raw)
  const headers = headersToRecord(message.headers)
  const subject = cleanSubject(parsed.subject ?? headers["subject"])
  const body = cleanBody(parsed.text, parsed.html)
  const messageId =
    (headers["message-id"] ?? parsed.messageId ?? "").trim() || null

  const record = async (row: {
    stage: "prefilter" | "model" | "none"
    decision: "dropped" | "replied" | "error"
    reason?: string
    spamScore?: number
    inviteCodeId?: string | null
    promptTokens?: number
    outputTokens?: number
    replied?: boolean
  }) => {
    try {
      await db.insert(agentEmails).values({
        id: `ae_${nanoid(12)}`,
        messageId,
        fromEmail: from || "<>",
        subject: subject || null,
        stage: row.stage,
        decision: row.decision,
        reason: row.reason ?? null,
        spamScore: row.spamScore ?? null,
        inviteCodeId: row.inviteCodeId ?? null,
        promptTokens: row.promptTokens ?? null,
        outputTokens: row.outputTokens ?? null,
        receivedAt: now(),
        repliedAt: row.replied ? now() : null,
      })
    } catch (err) {
      // Audit log must never break the pipeline (e.g. a Message-ID replay races).
      log.withError(err).warn("email_agent_record_failed")
    }
  }

  // 2. Free gates.
  const pre = prefilter({
    envelopeFrom: from,
    envelopeTo: message.to,
    headers,
    subject,
    text: body,
    rawSize: message.rawSize,
    agentAddress,
    blockedDomains: parseBlockedDomains(env.EMAIL_AGENT_BLOCKED_DOMAINS),
  })
  if (pre.verdict === "drop") {
    log
      .withMetadata({
        event: "email_dropped",
        reason: pre.reason,
        score: pre.score,
      })
      .info("email_dropped")
    // Wrong-recipient is Cloudflare misrouting; nothing to audit per sender.
    if (pre.reason !== "wrong_recipient") {
      await record({
        stage: "prefilter",
        decision: "dropped",
        reason: pre.reason,
        spamScore: pre.score,
      })
    }
    return { outcome: "dropped", stage: "prefilter", reason: pre.reason }
  }

  if (messageId) {
    const dup = await db
      .select({ id: agentEmails.id })
      .from(agentEmails)
      .where(eq(agentEmails.messageId, messageId))
      .get()
    if (dup) {
      log
        .withMetadata({ event: "email_dropped", reason: "duplicate" })
        .info("email_dropped")
      return { outcome: "dropped", stage: "dedupe", reason: "duplicate" }
    }
  }

  const maxPerDay =
    Number(env.EMAIL_AGENT_MAX_PER_SENDER_DAY) || DEFAULT_MAX_PER_SENDER_DAY
  const recent = await db
    .select({ n: count() })
    .from(agentEmails)
    .where(
      and(
        eq(agentEmails.fromEmail, from),
        gt(agentEmails.receivedAt, now() - DAY_SEC),
      ),
    )
    .get()
  if ((recent?.n ?? 0) >= maxPerDay) {
    log
      .withMetadata({
        event: "email_dropped",
        reason: "rate_limited",
        n: recent?.n,
      })
      .info("email_dropped")
    await record({
      stage: "prefilter",
      decision: "dropped",
      reason: "rate_limited",
      spamScore: pre.score,
    })
    return { outcome: "dropped", stage: "rate_limit", reason: "rate_limited" }
  }

  // 3. Model.
  const existingInvite = await findLiveInviteForEmail(db, from)
  let decision: AgentDecision
  let usage = { promptTokens: 0, outputTokens: 0 }
  try {
    const res = await classifyAndDraft({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      fetchImpl: deps.fetchImpl,
      email: { from, subject, body },
      hasExistingInvite: Boolean(existingInvite),
    })
    decision = res.decision
    usage = res.usage
  } catch (err) {
    const reason = err instanceof GeminiError ? err.message : "gemini_unknown"
    log.withError(err).error("email_agent_model_failed")
    await record({
      stage: "model",
      decision: "error",
      reason,
      spamScore: pre.score,
    })
    await escalate(message, env, log)
    return { outcome: "error", reason }
  }

  log
    .withMetadata({
      event: "email_classified",
      category: decision.category,
      wants_invite: decision.wants_invite,
      language: decision.language,
      ...usage,
    })
    .info("email_classified")

  // 4. Act.
  if (decision.category === "spam" || decision.category === "injection") {
    await record({
      stage: "model",
      decision: "dropped",
      reason: decision.category,
      spamScore: pre.score,
      ...usage,
    })
    return { outcome: "dropped", stage: "model", reason: decision.category }
  }

  const send = (text: string) =>
    env.EMAIL.send({
      from: { email: agentAddress, name: AGENT_NAME },
      // Envelope sender only. Never the Reply-To/From header: those are
      // attacker-controlled and would turn us into a relay to third parties.
      to: from,
      subject: replySubject(subject),
      text,
      headers: messageId
        ? { "In-Reply-To": messageId, References: messageId }
        : undefined,
    })

  if (decision.category === "off_topic") {
    await send(OFF_TOPIC_REPLY)
    await record({
      stage: "model",
      decision: "replied",
      reason: "off_topic",
      spamScore: pre.score,
      replied: true,
      ...usage,
    })
    await escalate(message, env, log)
    return { outcome: "replied", category: "off_topic" }
  }

  // support | invite_request
  const validated = validateReply(decision.reply, { agentAddress })
  let text: string
  let category: AgentDecision["category"] | "fallback" = decision.category
  if (validated.ok) {
    text = validated.text
  } else {
    log
      .withMetadata({ event: "email_reply_rejected", reason: validated.reason })
      .warn("email_reply_rejected")
    text = FALLBACK_REPLY
    category = "fallback"
  }

  let inviteCodeId: string | null = null
  let inviteCode: string | undefined
  if (decision.wants_invite || decision.category === "invite_request") {
    const invite = await issueInviteForEmail(db, from)
    inviteCodeId = invite.id
    inviteCode = invite.code
    text = `${text}\n\n${inviteBlock(invite.code, shareLink(env.WWW_URL, invite.code))}`
    log
      .withMetadata({
        event: "invite_issued",
        code_id: invite.id,
        reused: invite.reused,
      })
      .info("invite_issued")
  }

  await send(text)
  await record({
    stage: "model",
    decision: "replied",
    reason: decision.category,
    spamScore: pre.score,
    inviteCodeId,
    replied: true,
    ...usage,
  })
  await escalate(message, env, log)
  return { outcome: "replied", category, inviteCode }
}

/** Forward a copy to the human inbox when configured. Best-effort. */
async function escalate(
  message: ForwardableEmailMessage,
  env: Bindings,
  log: Logger,
): Promise<void> {
  const to = env.EMAIL_AGENT_FORWARD_TO?.trim()
  if (!to) return
  try {
    await message.forward(to)
  } catch (err) {
    log.withError(err).warn("email_agent_forward_failed")
  }
}
