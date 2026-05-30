import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir, chmod } from "node:fs/promises"
import { z } from "zod"

const DEFAULT_API_URL = "https://api.bul.ma"

const CredentialsSchema = z.object({
  apiUrl: z.string().url(),
  sessionToken: z.string(),
  userId: z.string(),
  email: z.string().email(),
  expiresAt: z.number().int(),
})

export type Credentials = z.infer<typeof CredentialsSchema>

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg ? join(xdg, "bulma") : join(homedir(), ".config", "bulma")
}

function credentialsPath(): string {
  return join(configDir(), "credentials.json")
}

export async function loadCredentials(): Promise<Credentials | null> {
  const token = process.env.BULMA_TOKEN
  if (token) {
    return {
      apiUrl: process.env.BULMA_API_URL ?? DEFAULT_API_URL,
      sessionToken: token,
      userId: "",
      email: "",
      expiresAt: 0,
    }
  }
  const file = Bun.file(credentialsPath())
  if (!(await file.exists())) return null
  try {
    const parsed = CredentialsSchema.parse(await file.json())
    if (process.env.BULMA_API_URL) {
      return { ...parsed, apiUrl: process.env.BULMA_API_URL }
    }
    return parsed
  } catch {
    return null
  }
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  const dir = configDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const path = credentialsPath()
  await Bun.write(path, JSON.stringify(creds, null, 2))
  await chmod(path, 0o600)
}

export async function deleteCredentials(): Promise<void> {
  const path = credentialsPath()
  const file = Bun.file(path)
  if (await file.exists()) {
    await Bun.write(path, "")
    await Bun.$`rm -f ${path}`.quiet()
  }
}

export function getApiUrl(): string {
  return process.env.BULMA_API_URL ?? DEFAULT_API_URL
}
