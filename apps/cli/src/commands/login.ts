import { z } from "zod"
import { getApiUrl, loadCredentials, saveCredentials } from "../lib/credentials"
import { openBrowser } from "../lib/browser"

const StartResponse = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string(),
  verificationUriComplete: z.string(),
  expiresIn: z.number().int(),
  interval: z.number().int(),
})

const PollSuccess = z.object({
  sessionToken: z.string(),
  userId: z.string(),
  email: z.string().email(),
  expiresAt: z.number().int(),
})

const PollPending = z.object({
  error: z.enum([
    "authorization_pending",
    "slow_down",
    "expired_token",
    "access_denied",
  ]),
  interval: z.number().int().optional(),
})

type LoginOptions = {
  force?: boolean
  noBrowser?: boolean
  json?: boolean
}

// With --json, login streams newline-delimited JSON events on stdout so an
// agent can relay the verification URL to its user, then await the outcome:
//   {"event":"pending","verificationUriComplete":…,"userCode":…,"expiresIn":…}
//   {"event":"success","userId":…,"email":…,"expiresAt":…}
//   {"event":"error","error":…}            (also "already_logged_in")
// Human progress (dots, banners) is suppressed in json mode to keep stdout pure.
function emit(obj: Record<string, unknown>): void {
  console.log(JSON.stringify(obj))
}

export async function login(opts: LoginOptions = {}): Promise<number> {
  const json = opts.json ?? false

  if (!opts.force) {
    const existing = await loadCredentials()
    if (existing && existing.userId) {
      if (json) {
        emit({ event: "already_logged_in", email: existing.email })
      } else {
        console.log(`Already logged in as ${existing.email}`)
        console.log("Run `bulma login --force` to switch accounts.")
      }
      return 0
    }
  }

  const apiUrl = getApiUrl()
  const startRes = await fetch(`${apiUrl}/auth/device/start`, {
    method: "POST",
  })
  if (!startRes.ok) {
    if (json)
      emit({
        event: "error",
        error: "device_start_failed",
        status: startRes.status,
      })
    else console.error(`device/start failed: ${startRes.status}`)
    return 10
  }
  const start = StartResponse.parse(await startRes.json())

  if (json) {
    emit({
      event: "pending",
      verificationUri: start.verificationUri,
      verificationUriComplete: start.verificationUriComplete,
      userCode: start.userCode,
      expiresIn: start.expiresIn,
    })
  } else {
    console.log("")
    console.log(`Open: ${start.verificationUriComplete}`)
    console.log(`Code:  ${start.userCode}`)
    console.log("")
  }

  if (!opts.noBrowser) {
    await openBrowser(start.verificationUriComplete)
  }

  const deadline = Date.now() + start.expiresIn * 1000
  let interval = start.interval

  if (!json) process.stdout.write("Waiting for browser confirmation")
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000))
    if (!json) process.stdout.write(".")
    const pollRes = await fetch(`${apiUrl}/auth/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode: start.deviceCode }),
    })
    if (pollRes.status === 200) {
      const ok = PollSuccess.parse(await pollRes.json())
      await saveCredentials({
        apiUrl,
        sessionToken: ok.sessionToken,
        userId: ok.userId,
        email: ok.email,
        expiresAt: ok.expiresAt,
      })
      if (json) {
        emit({
          event: "success",
          userId: ok.userId,
          email: ok.email,
          expiresAt: ok.expiresAt,
        })
      } else {
        console.log("")
        console.log(`✓ Logged in as ${ok.email}`)
      }
      return 0
    }
    const pending = PollPending.safeParse(await pollRes.json())
    if (!pending.success) {
      if (json)
        emit({
          event: "error",
          error: "unexpected_poll_response",
          status: pollRes.status,
        })
      else console.error(`\nunexpected poll response (${pollRes.status})`)
      return 10
    }
    if (pending.data.error === "slow_down" && pending.data.interval) {
      interval = pending.data.interval
    }
    if (pending.data.error === "expired_token") {
      if (json) emit({ event: "error", error: "expired_token" })
      else console.error("\nDevice code expired. Run `bulma login` again.")
      return 3
    }
    if (pending.data.error === "access_denied") {
      if (json) emit({ event: "error", error: "access_denied" })
      else console.error("\nLogin denied.")
      return 3
    }
  }

  if (json) emit({ event: "error", error: "timeout" })
  else console.error("\nTimed out waiting for browser confirmation.")
  return 3
}
