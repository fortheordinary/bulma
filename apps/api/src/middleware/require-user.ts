import { createMiddleware } from "hono/factory"
import { createAuth } from "../lib/auth"
import type { Bindings } from "../lib/env"

export type SessionUser = {
  id: string
  email: string
  name: string
}

export type SessionInfo = {
  id: string
  token: string
  userId: string
  expiresAt: Date
}

export type AuthContext = {
  user: SessionUser
  session: SessionInfo
}

export const requireUser = createMiddleware<{
  Bindings: Bindings
  Variables: AuthContext
}>(async (c, next) => {
  const auth = createAuth(c.env)
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!sessionData) {
    return c.json({ error: "unauthorized" }, 401)
  }
  c.set("user", sessionData.user)
  c.set("session", sessionData.session)
  await next()
})
