import { createInterface } from "node:readline/promises"
import { z } from "zod"
import { loadCredentials } from "../lib/credentials"
import { openBrowser } from "../lib/browser"

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

const StartResponse = z.object({
  state: z.enum(["none", "pending", "approved", "rejected", "ready"]),
  verificationUri: z.string().url().optional(),
})

type OnboardOptions = {
  noBrowser?: boolean
  json?: boolean
  referralCode?: string
}

export async function onboard(opts: OnboardOptions = {}): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }

  // A referral code is required to onboard. Prompt for it when not passed via
  // --referral and we're in an interactive (non-JSON) session.
  let referralCode = opts.referralCode
  if (!referralCode && !opts.json) {
    referralCode = (await promptLine("Referral code: ")) || undefined
  }

  const startRes = await fetch(`${creds.apiUrl}/onboard/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(referralCode ? { referralCode } : {}),
  })

  if (startRes.status === 401) {
    console.error("Session expired. Run `bulma login`.")
    return 3
  }
  if (startRes.status === 400 || startRes.status === 409) {
    const body = (await startRes.json().catch(() => ({}))) as { error?: string }
    const msg =
      body.error === "referral_required"
        ? "A referral code is required to onboard. Run `bulma onboard --referral <code>`."
        : body.error === "self_referral"
          ? "You can't use your own referral code."
          : body.error === "code_taken"
            ? "That referral code was already used."
            : "Invalid referral code."
    console.error(msg)
    return 4
  }
  if (!startRes.ok) {
    const body = await startRes.text()
    console.error(`onboard/start failed: ${startRes.status} ${body}`)
    return 10
  }
  const start = StartResponse.parse(await startRes.json())

  if (start.state === "ready") {
    console.log("Already onboarded.")
    if (opts.json) console.log(JSON.stringify({ state: "ready" }))
    return 0
  }

  if (!start.verificationUri) {
    console.error("No verification URI returned.")
    return 10
  }

  console.log("")
  console.log(`Onboarding link: ${start.verificationUri}`)
  console.log("")
  console.log(
    "Please complete identity verification in your browser. You'll receive",
  )
  console.log(
    "an email within 24 hours with your onboarding status. Run `bulma whoami`",
  )
  console.log("after that to check your account.")

  if (!opts.noBrowser) {
    await openBrowser(start.verificationUri)
  }

  if (opts.json) {
    console.log(
      JSON.stringify({
        state: start.state,
        verificationUri: start.verificationUri,
      }),
    )
  }

  return 0
}
