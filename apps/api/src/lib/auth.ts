import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer } from "better-auth/plugins"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "../db/schema"
import type { Bindings } from "./env"

export function createAuth(env: Bindings) {
  const db = drizzle(env.DB, { schema })
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: { sameSite: "lax", secure: true },
    },
    trustedOrigins: [env.WWW_URL, env.BETTER_AUTH_URL],
    plugins: [bearer()],
  })
}

export type Auth = ReturnType<typeof createAuth>
