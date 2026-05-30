# Auth (`bulma login`)

## Decisions locked

| Q                       | Answer                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| OAuth providers         | **Google only** for MVP.                                                  |
| Auth library            | **better-auth** (server-side, Drizzle adapter, Google social plugin).     |
| Web surface             | **`apps/www`** (Vue 3.6 + Vapor + Tailwind v4 + shadcn-vue).               |
| Session TTL             | 30 days rolling, force re-auth after 7 days idle.                          |

## Components

```
┌──────────────────┐                    ┌──────────────────────┐
│   bulma CLI      │                    │   apps/www (SPA)     │
│   (Bun)          │                    │   /cli page          │
└────────┬─────────┘                    └──────────┬───────────┘
         │                                          │
         │ device code                              │ user enters code,
         │                                          │ better-auth → Google
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  apps/api (Hono on CF Workers)                                  │
│  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │ /auth/device │   │  better-auth     │   │ Hono middleware │  │
│  │   /start     │   │  /api/auth/[..]  │   │ session check   │  │
│  │   /verify    │   │  google plugin   │   │                 │  │
│  │   /poll      │   │  drizzleAdapter  │   │                 │  │
│  └──────────────┘   └──────────────────┘   └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                         D1 (users/sessions/accounts)
```

## better-auth integration

### Why better-auth

- Owns: Google OAuth flow, callback handling, session cookies, user table conventions, account-link table for OAuth provider records.
- Has a [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle) — uses our existing D1 + drizzle setup.
- Has a [Hono integration](https://www.better-auth.com/docs/integrations/hono) — mount as `app.on(['GET', 'POST'], '/api/auth/*', toHandler(auth))`.
- The web flow is standard cookie-session; we layer **CLI device flow** on top of it as a thin custom plugin/route.

### Schema (better-auth managed)

better-auth's Drizzle adapter generates these tables (we let it own them; do not hand-edit migrations for these):

- `user` (id, email, name, emailVerified, image, createdAt, updatedAt) — replaces our earlier `users` table.
- `session` (id, expiresAt, token, ipAddress, userAgent, userId) — replaces our earlier `sessions` table.
- `account` (id, accountId, providerId, userId, accessToken, refreshToken, idToken, …) — Google OAuth records.
- `verification` (id, identifier, value, expiresAt) — OTP / device codes (we co-opt this for device flow, see below).

Domain tables (`receivers`, `wallets`, …) reference `user.id`. We add a 1:1 child table `user_profile` for our app-specific columns (`onboarding_state`, etc.) so we never modify better-auth's `user` table.

### Server config

`apps/api/src/lib/auth.ts`:

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,       // 30d absolute
    updateAge: 60 * 60 * 24,            // bump session on use
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  trustedOrigins: [
    'https://bul.ma',
    'https://api.bul.ma',
    'http://localhost:5173', // apps/www dev
    'http://localhost:8787', // wrangler dev
  ],
});
```

Mount on Hono:

```ts
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
```

### Session validation middleware

```ts
export const requireUser = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', session.user);
  c.set('session', session.session);
  await next();
});
```

The middleware accepts either:
- Cookie auth (web sessions from `apps/www`).
- `Authorization: Bearer <session-token>` (CLI sessions).

better-auth supports bearer-token auth via its [Bearer plugin](https://www.better-auth.com/docs/plugins/bearer) — enable it.

## Device flow on top of better-auth

better-auth doesn't ship an RFC 8628 device-flow plugin. We add a thin route set that bridges a CLI-side device code to a regular better-auth web session:

### Tables (Bulma-owned)

`device_codes`:

| Column          | Type    | Notes                                                                |
| --------------- | ------- | -------------------------------------------------------------------- |
| `device_code`   | text PK | 32 random bytes hex                                                  |
| `user_code`     | text UQ | 8-char human code (e.g., `WDJB-MJHT`)                                |
| `expires_at`    | integer | unixepoch + 600                                                       |
| `approved_session_id` | text | nullable; filled when web user finishes OAuth and confirms the code |
| `created_at`    | integer |                                                                       |
| `last_polled_at`| integer | rate-limit polling                                                    |

### Routes (on `apps/api`)

| Route                       | Method | Purpose                                                                            |
| --------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `/auth/device/start`        | POST   | Generate device + user code, return `{ deviceCode, userCode, verificationUriComplete, expiresIn, interval }`. |
| `/auth/device/verify`       | POST   | Called from `apps/www` after the user enters the user code. Requires an authenticated better-auth session. Marks `device_codes.approved_session_id` = current session.id. |
| `/auth/device/poll`         | POST   | CLI polls with `{ deviceCode }`. If `approved_session_id` set, return that session's bearer token; else `425` + `interval`. |

### Web page (`apps/www/src/pages/CliLogin.vue`)

1. Page reads `?code=` query param into the form (or user types code).
2. User clicks "Continue".
3. If not logged in: front-end calls better-auth's `signIn.social({ provider: 'google', callbackURL: '/cli?code=…' })`.
4. After Google callback, user is logged in via better-auth session cookie.
5. Front-end calls `POST /auth/device/verify` with the user code; this pairs the device code with the authenticated session.
6. Show "✓ CLI connected, return to your terminal".

### CLI side

```ts
// apps/cli/src/commands/login.ts
const { deviceCode, userCode, verificationUriComplete, interval } =
  await api.post('/auth/device/start');
console.log(`Open: ${verificationUriComplete}`);
console.log(`Code:  ${userCode}`);
openBrowser(verificationUriComplete);
const sessionToken = await pollUntilApproved(deviceCode, interval);
writeCredentialsFile({ sessionToken, /* … */ });
```

### Why this bridges cleanly

- better-auth owns Google OAuth, session creation, session validation — we don't reinvent it.
- The device-flow routes are dumb pairing — they just mint a bearer token bound to the better-auth session created during the web login.
- Revocation works: `bulma logout` → calls better-auth's session-revoke API → the bearer token stops validating.

## Credential file (CLI)

Same as before:

```
~/.config/bulma/credentials.json   (mode 0600)
~/.config/bulma/                   (mode 0700)
```

```json
{
  "apiUrl": "https://api.bul.ma",
  "sessionToken": "blm_…",
  "userId": "…",
  "email": "…",
  "expiresAt": 1735689600
}
```

`BULMA_TOKEN` env var overrides the file (for CI / agent automation).

## Subcommands

| Command                | Behavior                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| `bulma login`          | Run device flow. Short-circuit if already logged in (`bulma whoami` works).       |
| `bulma login --force`  | Skip short-circuit.                                                                |
| `bulma login --no-browser` | Print URL + code, don't try to open.                                           |
| `bulma logout`         | Better-auth session revoke + delete credentials file.                              |
| `bulma whoami`         | Print `email + userId + onboardingState`.                                          |

## Edge cases

- **Headless / SSH host.** Device flow shines here — the user opens the URL on a separate device (laptop browser).
- **CLI re-login from a different machine.** Bearer tokens are device-bound; each machine runs `bulma login` once.
- **Concurrent `bulma login`.** Each gets its own device code; whichever completes first writes the credentials file (file lock during write).
- **Clock skew.** Server-side expiry only; CLI never gates on local time.
