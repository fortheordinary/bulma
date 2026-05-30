import { z } from "zod"
import { loadCredentials } from "../lib/credentials"

const MeResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  onboardingState: z.enum(["none", "pending", "approved", "rejected", "ready"]),
})

export async function whoami(json: boolean): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }
  const res = await fetch(`${creds.apiUrl}/me`, {
    headers: { Authorization: `Bearer ${creds.sessionToken}` },
  })
  if (res.status === 401) {
    console.error("Session expired. Run `bulma login`.")
    return 3
  }
  if (!res.ok) {
    console.error(`whoami failed: ${res.status}`)
    return 10
  }
  const me = MeResponse.parse(await res.json())
  if (json) {
    console.log(JSON.stringify(me, null, 2))
    return 0
  }
  console.log(`Email:            ${me.email}`)
  console.log(`Name:             ${me.name}`)
  console.log(`User id:          ${me.id}`)
  console.log(`Onboarding state: ${me.onboardingState}`)
  return 0
}
