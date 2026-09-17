/**
 * Deterministic inbound prefilter. Runs before any model call so spam, bounces,
 * auto-replies and mailing-list traffic never cost AI tokens. Pure: no I/O, no
 * clock. Unit-tested in tests/email-agent-spam.test.ts.
 *
 * Everything here is a heuristic, so it is tuned to be conservative: a false
 * "drop" means a real user gets silence, a false "pass" only costs one cheap
 * Flash call (the model has its own `spam` category as a second gate).
 */

export type PrefilterInput = {
  /** SMTP envelope MAIL FROM. Trustworthy (unlike the From: header). */
  envelopeFrom: string
  /** SMTP envelope RCPT TO. */
  envelopeTo: string
  /** Lower-cased header name -> value. */
  headers: Record<string, string>
  subject: string
  /** Plain-text body after quote stripping (see sanitize.ts). */
  text: string
  rawSize: number
  /** Mailbox we answer for, e.g. agent@bul.ma. */
  agentAddress: string
  /** Extra sender domains to drop outright. */
  blockedDomains?: string[]
}

export type PrefilterResult = {
  verdict: "pass"
  score: number
} | {
  verdict: "drop"
  reason: DropReason
  score: number
}

export type DropReason = "wrong_recipient" | "null_sender" | "invalid_sender" | "self_loop" | "automated_sender" | "auto_reply_or_list" | "auth_fail" | "too_large" | "empty" | "blocked_domain" | "heuristic_spam"

export const MAX_RAW_SIZE = 1024 * 1024 // 1 MiB; support mail is text.
export const SPAM_THRESHOLD = 4

const AUTOMATED_LOCAL_PARTS = new Set([
  "mailer-daemon",
  "postmaster",
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "bounce",
  "bounces",
  "notifications",
  "notification",
  "newsletter",
  "marketing",
])

// Each hit adds `weight`. Phrases are lower-case; matched against subject+body.
const SPAM_PHRASES: Array<[string, number]> = [
  ["unsubscribe", 2],
  ["viagra", 4],
  ["casino", 3],
  ["lottery", 3],
  ["you have won", 3],
  ["guest post", 3],
  ["backlink", 3],
  ["seo service", 3],
  ["link building", 3],
  ["increase your traffic", 3],
  ["make money fast", 4],
  ["work from home and earn", 3],
  ["bitcoin giveaway", 4],
  ["crypto giveaway", 4],
  ["double your", 3],
  ["limited time offer", 2],
  ["act now", 2],
  ["click here", 1],
  ["dear friend", 2],
  ["dear sir/madam", 2],
  ["business proposal", 2],
  ["million dollars", 3],
  ["nigerian", 2],
  ["wire transfer fee", 3],
  ["100% free", 2],
  ["risk free", 2],
  ["no obligation", 2],
  ["weight loss", 3],
  ["enlargement", 4],
  ["escort", 4],
  ["adult content", 4],
  ["web design services", 3],
  ["app development services", 3],
  ["outsourcing", 1],
  ["we can help you rank", 3],
]

const URL_RE = /https?:\/\/[^\s<>"')]+/gi

export function senderDomain(address: string): string {
  const at = address.lastIndexOf("@")
  return at === -1
    ? ""
    : address
        .slice(at + 1)
        .toLowerCase()
        .replace(/>$/, "")
}

export function senderLocalPart(address: string): string {
  const at = address.lastIndexOf("@")
  return at === -1 ? address.toLowerCase() : address.slice(0, at).toLowerCase()
}

/** Loose RFC 5321 shape check, enough to refuse garbage envelopes. */
export function isPlausibleEmail(address: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)
}

/** Parse an `Authentication-Results` header into method -> result. */
export function parseAuthResults(
  header: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const m of header.matchAll(/\b(spf|dkim|dmarc|arc)=([a-z]+)/gi)) {
    const method = m[1]!.toLowerCase()
    // Keep the first result per method (the receiving MTA's own evaluation).
    if (!(method in out)) out[method] = m[2]!.toLowerCase()
  }
  return out
}

function isAutoReplyOrList(h: Record<string, string>): boolean {
  const autoSubmitted = h["auto-submitted"]?.toLowerCase()
  if (autoSubmitted && autoSubmitted !== "no") return true
  if (h["x-auto-response-suppress"]) return true
  if (h["x-autoreply"] || h["x-autorespond"]) return true
  const precedence = h["precedence"]?.toLowerCase()
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") {
    return true
  }
  if (h["list-id"] || h["list-unsubscribe"] || h["list-post"]) return true
  return false
}

/** Additive spam score over subject + body. Exported for tests. */
export function spamScore(subject: string, text: string): number {
  const hay = `${subject}\n${text}`.toLowerCase()
  let score = 0
  for (const [phrase, weight] of SPAM_PHRASES) {
    if (hay.includes(phrase)) score += weight
  }
  const urls = hay.match(URL_RE)?.length ?? 0
  if (urls >= 5) score += 3
  else if (urls >= 3) score += 1

  const letters = subject.replace(/[^a-z]/gi, "")
  if (letters.length >= 8) {
    const upper = letters.replace(/[^A-Z]/g, "").length
    if (upper / letters.length > 0.7) score += 1
  }
  if (/!{3,}|\${2,}/.test(subject)) score += 1
  if (/(?:^|\s)(?:re|fwd?):\s*(?:re|fwd?):/i.test(subject)) score += 0 // noise, ignore

  // Bodies that are nearly all links with almost no prose.
  const words = text.split(/\s+/).filter(Boolean).length
  if (urls >= 2 && words < 20) score += 2
  return score
}

export function prefilter(input: PrefilterInput): PrefilterResult {
  const from = input.envelopeFrom.trim().toLowerCase()
  const to = input.envelopeTo.trim().toLowerCase()
  const agent = input.agentAddress.trim().toLowerCase()

  if (to !== agent)
    return { verdict: "drop", reason: "wrong_recipient", score: 0 }
  if (!from || from === "<>")
    return { verdict: "drop", reason: "null_sender", score: 0 }
  if (!isPlausibleEmail(from))
    return { verdict: "drop", reason: "invalid_sender", score: 0 }

  const domain = senderDomain(from)
  const agentDomain = senderDomain(agent)
  if (domain === agentDomain || domain.endsWith(`.${agentDomain}`)) {
    return { verdict: "drop", reason: "self_loop", score: 0 }
  }
  if (
    input.blockedDomains?.some(
      (d) => d && (domain === d || domain.endsWith(`.${d}`)),
    )
  ) {
    return { verdict: "drop", reason: "blocked_domain", score: 0 }
  }
  if (AUTOMATED_LOCAL_PARTS.has(senderLocalPart(from))) {
    return { verdict: "drop", reason: "automated_sender", score: 0 }
  }
  if (isAutoReplyOrList(input.headers)) {
    return { verdict: "drop", reason: "auto_reply_or_list", score: 0 }
  }

  const auth = parseAuthResults(input.headers["authentication-results"])
  if (auth.dmarc === "fail" || (auth.spf === "fail" && auth.dkim === "fail")) {
    return { verdict: "drop", reason: "auth_fail", score: 0 }
  }

  if (input.rawSize > MAX_RAW_SIZE)
    return { verdict: "drop", reason: "too_large", score: 0 }
  if (!input.subject.trim() && !input.text.trim()) {
    return { verdict: "drop", reason: "empty", score: 0 }
  }

  const score = spamScore(input.subject, input.text)
  if (score >= SPAM_THRESHOLD)
    return { verdict: "drop", reason: "heuristic_spam", score }
  return { verdict: "pass", score }
}
