# Contributing to Bulma

## Who may contribute

**Bulma is built by AI agents only. Human-written code is not accepted.**

Every change — features, fixes, refactors, docs — must be authored by an AI coding
agent (Claude Code or equivalent) acting on a maintainer's behalf. Humans steer:
they open issues, set direction, review, and merge. They do **not** push code.

A PR whose diff was hand-written by a human will be closed. If a human wants a
change, they file an issue (or prompt an agent) and let an agent produce the diff.

## The one rule that governs everything

[**`AGENTS.md`**](../AGENTS.md) is the single source of truth for how code is
written in this repo — stack, terminology, schema, build/test loop, releases. Read
it before doing anything. This guide is only the *contribution mechanics*; AGENTS.md
is the law. Where they ever disagree, AGENTS.md wins.

## How an agent contributes (the loop)

1. **Pick up an issue** (or an explicit maintainer prompt). One PR = one focused
   change.
2. **Branch.** Never commit to `main`. Name it `<type>/<short-slug>`
   (e.g. `feat/payout-memo`, `fix/quote-expiry`).
3. **Write the code** following AGENTS.md §2 (stack), §1 (fiat-only customer copy),
   §2a (Zod-first), §2b (zod-openapi routes), §2c (id format).
4. **Run it end-to-end** against local D1 per AGENTS.md §3 — migrate → `wrangler dev`
   → exercise via CLI/curl → verify rows. Never declare done without seeing it run.
5. **Add tests.** Pure logic → unit tests; money/route paths → route-level tests
   (`apps/api/tests/helpers/d1.ts` harness). Cover the happy path + key edges.
6. **Pass the gate locally** (same as CI, AGENTS.md §3):
   ```bash
   bunx turbo run typecheck lint format:check test
   ```
   All green, or the PR does not open.
7. **Open the PR** (see requirements below).
8. **Address review**, keep the branch green, then a maintainer squash-merges.

## Pull-request requirements

A PR is mergeable only when **all** of these hold:

- **Title** is Conventional Commits: `feat: …`, `fix: …`, `chore: …`, `docs: …`,
  `refactor: …`, `test: …`, `ci: …` (optionally scoped, e.g. `feat(payouts): …`).
- **At least one changelog label** so release notes categorize correctly
  (AGENTS.md §7): `feature` · `fix` · `security` · `breaking` · `chore` / `ci` /
  `docs` / `refactor` / `test`. Unlabelled → lands under "Other Changes".
- **CI is green** — `ci.yml` runs `typecheck lint format:check test` on every PR
  (AGENTS.md §1/§5). Red CI blocks merge.
- **Scope is one concern**, small enough to review. Split unrelated changes.
- **No secrets** in the diff (keys, tokens, `.env`). Only `.env.example`
  placeholders.
- **Customer-facing copy is fiat-only** (AGENTS.md §1) — no crypto vocabulary in
  CLI output, API response strings, or UI.
- **Schema changes** include the generated migration
  (`bun run --filter=api db:generate`) and were applied + verified locally.

PRs are **squash-merged** (one PR = one changelog line). Tag a PR
`ignore-for-release` to keep it out of release notes.

## What to never do

- Commit to `main` directly, or push human-authored code.
- Skip the local gate, or silence errors/tests to make them pass (AGENTS.md §3).
- Introduce a dependency outside the locked stack (AGENTS.md §2) without a
  maintainer's OK in the issue.
- Hand-write a `CHANGELOG.md` — releases generate notes automatically (AGENTS.md §7).
- Edit `CLAUDE.md` (it is a symlink to `AGENTS.md`).

## Releases

Maintainers cut releases by pushing a semver tag `vX.Y.Z`; GitHub assembles the
categorized changelog from merged PRs (AGENTS.md §6–§7). Agents do not tag.
