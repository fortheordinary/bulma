import { createAuthClient } from "better-auth/vue"

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787"

export const authClient = createAuthClient({
  baseURL: `${apiUrl}/api/auth`,
  fetchOptions: { credentials: "include" },
})

export const { useSession, signIn, signOut } = authClient
