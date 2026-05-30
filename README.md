# Bulma

Agentic global account for remote workers.

Create your USD account, receive your salary, and send money to your local bank.

> **Invite only** — please send an email to agent@bul.ma and you might receive an invite.

## Stack

- **Runtime/Tooling:** [Bun](https://bun.sh)
- **Monorepo:** [Turborepo](https://turbo.build)
- **Language:** TypeScript + [Zod](https://zod.dev)
- **API:** [Hono](https://hono.dev) on [Cloudflare Workers](https://workers.cloudflare.com)
- **Database:** SQLite via [Cloudflare D1](https://developers.cloudflare.com/d1/)
- **Lint/Format:** [oxlint](https://oxc.rs/docs/guide/usage/linter) + [oxfmt](https://oxc.rs)

## Layout

```
apps/
  api/        Hono API on Cloudflare Workers + D1 + better-auth
  cli/        Bulma CLI
  www/        Vue 3.6 + Vapor + Tailwind v4 + shadcn-vue (web sign-in, CLI pair page)
packages/
  typescript/ Shared tsconfig bases (base, worker, cli, vue)
  oxc/        Shared oxlint + oxfmt configs
```

## Install

Install the `bulma` CLI:

```sh
curl -fsSL https://bul.ma/install.sh | bash
```

Then authenticate and open your account:

```sh
bulma login        # sign in with Google (device flow)
bulma onboard      # complete KYC (status arrives by email in ~24h)
bulma account      # show your US account details
bulma balance      # check your USD balance
bulma payout       # send money to a local bank
```

Run `bulma help` for the full command list. Every command accepts `--json` for machine-readable output.

## Use with your agent

`bulma` is a CLI with `--json` on every command, so an agent can drive it directly. Install the CLI first (above) — the skill shells out to it — then register it with your runtime.

### OpenClaw

Install the bulma skill from [ClawHub](https://docs.openclaw.ai/):

```sh
openclaw skills search bulma
openclaw skills install bulma
```

Your agent can now call `bulma <command> --json`.

### Hermes

Install the bulma skill ([skills live in `~/.hermes/skills/`](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)):

```sh
hermes skills install bulma
```

Your agent can now call `bulma <command> --json`.
