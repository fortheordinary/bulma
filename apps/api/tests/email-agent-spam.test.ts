import { describe, expect, it } from "bun:test"
import {
  MAX_RAW_SIZE,
  SPAM_THRESHOLD,
  parseAuthResults,
  prefilter,
  spamScore,
  type PrefilterInput,
} from "../src/lib/email-agent/spam"

const AGENT = "agent@bul.ma"

function input(over: Partial<PrefilterInput> = {}): PrefilterInput {
  return {
    envelopeFrom: "maria@example.com",
    envelopeTo: AGENT,
    headers: {},
    subject: "Question about onboarding",
    text: "Hi, I ran bulma onboard yesterday and it still says pending. Is that normal?",
    rawSize: 4_000,
    agentAddress: AGENT,
    ...over,
  }
}

describe("prefilter: envelope gates", () => {
  it("passes a plain support email", () => {
    expect(prefilter(input()).verdict).toBe("pass")
  })

  it("drops mail not addressed to the agent mailbox", () => {
    const r = prefilter(input({ envelopeTo: "someone-else@bul.ma" }))
    expect(r).toMatchObject({ verdict: "drop", reason: "wrong_recipient" })
  })

  it("drops bounces (null sender)", () => {
    expect(prefilter(input({ envelopeFrom: "" }))).toMatchObject({ reason: "null_sender" })
    expect(prefilter(input({ envelopeFrom: "<>" }))).toMatchObject({ reason: "null_sender" })
  })

  it("drops malformed senders", () => {
    expect(prefilter(input({ envelopeFrom: "not-an-address" }))).toMatchObject({
      reason: "invalid_sender",
    })
  })

  it("drops mail from our own domain (loop protection)", () => {
    expect(prefilter(input({ envelopeFrom: "agent@bul.ma" }))).toMatchObject({ reason: "self_loop" })
    expect(prefilter(input({ envelopeFrom: "x@mail.bul.ma" }))).toMatchObject({ reason: "self_loop" })
  })

  it("drops automated local parts", () => {
    for (const lp of ["noreply", "no-reply", "MAILER-DAEMON", "postmaster", "newsletter"]) {
      expect(prefilter(input({ envelopeFrom: `${lp}@corp.com` }))).toMatchObject({
        reason: "automated_sender",
      })
    }
  })

  it("drops blocked domains including subdomains", () => {
    const r = prefilter(input({ envelopeFrom: "a@mail.spammy.io", blockedDomains: ["spammy.io"] }))
    expect(r).toMatchObject({ reason: "blocked_domain" })
  })
})

describe("prefilter: header gates", () => {
  it("drops auto-replies and list traffic", () => {
    const cases: Record<string, string>[] = [
      { "auto-submitted": "auto-replied" },
      { "x-auto-response-suppress": "All" },
      { precedence: "bulk" },
      { "list-id": "<dev.lists.example.com>" },
      { "list-unsubscribe": "<mailto:u@x.com>" },
    ]
    for (const headers of cases) {
      expect(prefilter(input({ headers }))).toMatchObject({ reason: "auto_reply_or_list" })
    }
  })

  it("keeps Auto-Submitted: no", () => {
    expect(prefilter(input({ headers: { "auto-submitted": "no" } })).verdict).toBe("pass")
  })

  it("drops DMARC failures and SPF+DKIM double failures", () => {
    expect(
      prefilter(
        input({ headers: { "authentication-results": "mx.cloudflare.net; dmarc=fail header.from=x" } }),
      ),
    ).toMatchObject({ reason: "auth_fail" })
    expect(
      prefilter(
        input({
          headers: { "authentication-results": "mx; spf=fail smtp.mailfrom=x; dkim=fail" },
        }),
      ),
    ).toMatchObject({ reason: "auth_fail" })
  })

  it("keeps SPF fail when DKIM passes (forwarded mail)", () => {
    const r = prefilter(
      input({ headers: { "authentication-results": "mx; spf=fail; dkim=pass; dmarc=pass" } }),
    )
    expect(r.verdict).toBe("pass")
  })
})

describe("prefilter: size / emptiness / heuristics", () => {
  it("drops oversized messages", () => {
    expect(prefilter(input({ rawSize: MAX_RAW_SIZE + 1 }))).toMatchObject({ reason: "too_large" })
  })

  it("drops empty messages", () => {
    expect(prefilter(input({ subject: "", text: "   " }))).toMatchObject({ reason: "empty" })
  })

  it("drops obvious spam by score", () => {
    const r = prefilter(
      input({
        subject: "LIMITED TIME OFFER!!! Guest post + backlinks",
        text: "We offer SEO service and link building. Click here http://a.io http://b.io http://c.io http://d.io http://e.io. Unsubscribe below.",
      }),
    )
    expect(r).toMatchObject({ verdict: "drop", reason: "heuristic_spam" })
    expect(r.score).toBeGreaterThanOrEqual(SPAM_THRESHOLD)
  })

  it("does not flag a real question that mentions one link", () => {
    const r = prefilter(
      input({
        text: "I got the invite link https://bul.ma/i/ABCDEF but bulma onboard says invalid code. Help?",
      }),
    )
    expect(r.verdict).toBe("pass")
  })

  it("scores link-only bodies", () => {
    expect(spamScore("hi", "http://a.io http://b.io")).toBeGreaterThanOrEqual(2)
  })
})

describe("parseAuthResults", () => {
  it("extracts first result per method", () => {
    const r = parseAuthResults("mx.example; spf=pass smtp.mailfrom=a; dkim=pass header.d=x; dkim=fail; dmarc=pass")
    expect(r).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass" })
  })
  it("handles missing header", () => {
    expect(parseAuthResults(undefined)).toEqual({})
  })
})
