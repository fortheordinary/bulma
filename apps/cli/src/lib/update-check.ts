import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import { VERSION } from "./version"

const DL_BASE = "https://dl.bul.ma"
const CHECK_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 1500

function cachePath(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  const dir = xdg ? join(xdg, "bulma") : join(homedir(), ".config", "bulma")
  return join(dir, "update-check.json")
}

type Cache = {
  checkedAt: number
  latestVersion: string
}

async function readCache(): Promise<Cache | null> {
  try {
    const file = Bun.file(cachePath())
    if (!(await file.exists())) return null
    const parsed = (await file.json()) as Cache
    if (
      typeof parsed.checkedAt !== "number" ||
      typeof parsed.latestVersion !== "string"
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function writeCache(latestVersion: string): Promise<void> {
  try {
    const xdg = process.env.XDG_CONFIG_HOME
    const dir = xdg ? join(xdg, "bulma") : join(homedir(), ".config", "bulma")
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await Bun.write(
      cachePath(),
      JSON.stringify({ checkedAt: Date.now(), latestVersion }),
    )
  } catch {
    // Cache failures are silent — update check is best-effort.
  }
}

async function fetchLatest(): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${DL_BASE}/latest/VERSION`, {
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return text.length > 0 ? text : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// "v0.2.0" / "0.2.0" → [0, 2, 0]. Non-numeric suffixes ignored.
function parse(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split(/[.+-]/)
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n))
}

function isNewer(latest: string, current: string): boolean {
  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

/**
 * Best-effort upstream-version probe. Returns the newer-version banner string
 * if one is available, else null. Cached for 24h. Never throws; network/file
 * failures degrade to "no banner".
 *
 * Skipped when:
 * - BULMA_NO_UPDATE_CHECK=1
 * - BULMA_VERSION compiled as "dev" (local source build — noise)
 * - stdout is not a TTY (script/CI noise)
 */
export async function maybeUpdateBanner(): Promise<string | null> {
  if (process.env.BULMA_NO_UPDATE_CHECK === "1") return null
  if (VERSION === "dev") return null
  if (!process.stdout.isTTY) return null

  const cached = await readCache()
  const now = Date.now()
  let latest: string | null = null

  if (cached && now - cached.checkedAt < CHECK_TTL_MS) {
    latest = cached.latestVersion
  } else {
    latest = await fetchLatest()
    if (latest) await writeCache(latest)
  }

  if (!latest) return null
  if (!isNewer(latest, VERSION)) return null

  return (
    `A new version of bulma is available: ${latest} (you have ${VERSION}).\n` +
    `Run: curl -fsSL https://bul.ma/install.sh | bash`
  )
}
