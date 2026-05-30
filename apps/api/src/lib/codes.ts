const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateUserCode(
  rng: () => Uint8Array = defaultRandom,
): string {
  const buf = rng()
  let out = ""
  for (let i = 0; i < 8; i++) {
    const idx = buf[i] ?? 0
    out += USER_CODE_ALPHABET[idx % USER_CODE_ALPHABET.length]
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

export function generateDeviceCode(
  rng: () => Uint8Array = defaultRandom32,
): string {
  const buf = rng()
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")
}

const USER_CODE_FORMAT =
  /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/

export function isValidUserCodeFormat(code: string): boolean {
  return USER_CODE_FORMAT.test(code)
}

function defaultRandom(): Uint8Array {
  const buf = new Uint8Array(8)
  crypto.getRandomValues(buf)
  return buf
}

function defaultRandom32(): Uint8Array {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return buf
}
