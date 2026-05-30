<!--
Bulma is AI-agent-built. Human-written code is not accepted (see CONTRIBUTING.md).
Title must be Conventional Commits, e.g. `feat(payouts): add memo field`.
Add a changelog label: feature / fix / security / breaking / chore|ci|docs|refactor|test.
-->

## What & why

<!-- One or two sentences. Link the issue: Closes #123 -->

## Checklist

- [ ] Authored by an AI agent (no human-written code)
- [ ] Branch off `main` (not committing to `main`)
- [ ] Conventional Commits title + a changelog label applied
- [ ] Ran end-to-end against local D1 (AGENTS.md §3) — saw it work
- [ ] Tests added/updated (route-level for money/route paths)
- [ ] `bunx turbo run typecheck lint format:check test` is green
- [ ] No secrets in the diff; customer-facing copy is fiat-only (AGENTS.md §1)
- [ ] Migration generated + applied locally (if schema changed)
