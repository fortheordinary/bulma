/**
 * Input/output hygiene for the email agent. Two jobs:
 *
 *  1. Turn an inbound MIME body into a short, quote-free plain-text excerpt
 *     that is safe to place inside a prompt as *data*.
 *  2. Validate the model's drafted reply before anything is sent: length,
 *     links, vocabulary (AGENTS.md §1 fiat-only), and injection tells.
 *
 * Pure functions; unit-tested in tests/email-agent-sanitize.test.ts.
 */

export const MAX_BODY_CHARS = 4000
export const MAX_SUBJECT_CHARS = 200
export const MAX_REPLY_CHARS = 1800

/** Hosts a reply may link to. Anything else fails validation. */
export const ALLOWED_LINK_HOSTS = [
  "bul.ma",
  "www.bul.ma",
  "api.bul.ma",
  "dl.bul.ma",
]

/** Customer-facing vocabulary ban (AGENTS.md §1). Word-boundary, case-insensitive. */
const BANNED_TERMS = [
  "crypto",
  "cryptocurrency",
  "blockchain",
  "web3",
  "stablecoin",
  "usdc",
  "usdt",
  "usdb",
  "wallet",
  "on-chain",
  "onchain",
  "polygon",
  "ethereum",
  "solana",
  "gas fee",
  "mint",
  "burn",
  "bridge",
]
const BANNED_RE = new RegExp(
  `\\b(${BANNED_TERMS.map(escapeRe).join("|")})s?\\b`,
  "i",
)

const INJECTION_ECHO_RE =
  /(ignore (all|any|the|your)? ?(previous|prior|above) instructions|system prompt|as an ai language model|developer message)/i

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

// Zero-width / bidi / control characters commonly used to hide injected text.
const INVISIBLE_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Very small HTML -> text fallback for HTML-only mail. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

/** Cut quoted history / signatures so we only classify what the sender wrote now. */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith(">")) break
    if (/^on .{3,120} wrote:$/i.test(t)) break
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(t)) break
    if (/^-{3,}\s*forwarded message\s*-{3,}$/i.test(t)) break
    if (/^(from|de|von):\s.+@.+$/i.test(t) && out.length > 0) break
    if (t === "--" || t === "-- ") break
    out.push(line)
  }
  return out.join("\n")
}

export function cleanBody(
  text: string | undefined,
  html: string | undefined,
): string {
  const base = text && text.trim() ? text : html ? htmlToText(html) : ""
  return stripQuotedReply(base)
    .replace(INVISIBLE_RE, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY_CHARS)
}

export function cleanSubject(subject: string | undefined): string {
  return (subject ?? "")
    .replace(INVISIBLE_RE, "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, MAX_SUBJECT_CHARS)
}

/** Build the outbound subject: keep the thread, strip header-injection chars. */
export function replySubject(subject: string): string {
  const s = cleanSubject(subject)
  if (!s) return "Re: Bulma"
  return /^re:/i.test(s) ? s : `Re: ${s}`
}

export const EMAIL_START = "<<<EMAIL_START>>>"
export const EMAIL_END = "<<<EMAIL_END>>>"

/**
 * Wrap untrusted email text for the prompt. The sentinels are removed from the
 * content itself so the sender cannot close the block early and append their
 * own "instructions".
 */
export function fenceUntrusted(s: string): string {
  const inner = s.split(EMAIL_START).join("").split(EMAIL_END).join("")
  return `${EMAIL_START}\n${inner}\n${EMAIL_END}`
}

export type ReplyValidation = {
  ok: true
  text: string
} | {
  ok: false
  reason: string
}

/**
 * Gate on the model output. We never send anything that fails here; the
 * caller falls back to a fixed template instead.
 */
export function validateReply(
  reply: string,
  opts: { agentAddress: string },
): ReplyValidation {
  const text = reply.replace(INVISIBLE_RE, "").trim()
  if (!text) return { ok: false, reason: "empty" }
  if (text.length > MAX_REPLY_CHARS) return { ok: false, reason: "too_long" }
  if (text.includes("```")) return { ok: false, reason: "code_block" }
  if (INJECTION_ECHO_RE.test(text))
    return { ok: false, reason: "injection_echo" }

  const banned = text.match(BANNED_RE)
  if (banned)
    return { ok: false, reason: `banned_term:${banned[1]!.toLowerCase()}` }

  for (const url of text.match(URL_RE) ?? []) {
    let host: string
    try {
      host = new URL(url).hostname.toLowerCase()
    } catch {
      return { ok: false, reason: "bad_url" }
    }
    if (!ALLOWED_LINK_HOSTS.includes(host))
      return { ok: false, reason: `link_host:${host}` }
  }

  const agent = opts.agentAddress.toLowerCase()
  for (const addr of text.match(EMAIL_RE) ?? []) {
    if (addr.toLowerCase() !== agent)
      return { ok: false, reason: "foreign_email" }
  }

  return { ok: true, text }
}
