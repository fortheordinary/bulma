import { deleteCredentials, loadCredentials } from "../lib/credentials"

export async function logout(): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.log("Not logged in.")
    return 0
  }
  try {
    await fetch(`${creds.apiUrl}/api/auth/sign-out`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.sessionToken}` },
    })
  } catch {
    // swallow — still wipe local state
  }
  await deleteCredentials()
  console.log("Logged out.")
  return 0
}
