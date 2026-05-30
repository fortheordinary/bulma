/**
 * Svix HMAC-SHA256 webhook signature verification.
 * Matches the BlindPay-documented vector:
 *   secret  = whsec_plJ3nmyCDGBKInavdOK15jsl
 *   msg_id  = msg_loFOjxBNrRLzqYUf
 *   ts      = 1731705121
 *   payload = {"event_type":"ping","data":{"success":true}}
 *   ->      v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=
 */

const MAX_TIMESTAMP_DRIFT_SECONDS = 300

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++)
    bin += String.fromCharCode(bytes[i] ?? 0)
  return btoa(bin)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export type SvixVerifyInput = {
  svixId: string
  svixTimestamp: string
  svixSignature: string
  payload: string
  secret: string
}

export async function computeSvixSignature(input: {
  msgId: string
  timestamp: string
  payload: string
  secret: string
}): Promise<string> {
  const secretBytes = base64ToBytes(input.secret.split("_")[1] ?? "")
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const data = new TextEncoder().encode(
    `${input.msgId}.${input.timestamp}.${input.payload}`,
  )
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data))
  return bytesToBase64(sig)
}

export type VerifyResult = { ok: true } | {
  ok: false
  error: "invalid_signature" | "stale" | "malformed"
}

export async function verifySvix(
  input: SvixVerifyInput,
  now: number = Date.now(),
): Promise<VerifyResult> {
  if (!input.svixId || !input.svixTimestamp || !input.svixSignature) {
    return { ok: false, error: "malformed" }
  }
  const ts = Number(input.svixTimestamp)
  if (!Number.isFinite(ts)) return { ok: false, error: "malformed" }
  if (Math.abs(Math.floor(now / 1000) - ts) > MAX_TIMESTAMP_DRIFT_SECONDS) {
    return { ok: false, error: "stale" }
  }

  const expected = await computeSvixSignature({
    msgId: input.svixId,
    timestamp: input.svixTimestamp,
    payload: input.payload,
    secret: input.secret,
  })

  const candidates = input.svixSignature.split(" ")
  for (const cand of candidates) {
    const [, sig] = cand.split(",", 2)
    if (sig && timingSafeEqual(sig, expected)) {
      return { ok: true }
    }
  }
  return { ok: false, error: "invalid_signature" }
}
