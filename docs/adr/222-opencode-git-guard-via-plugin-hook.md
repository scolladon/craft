# 222 — opencode git-diff guard is a plugin `tool.execute.before` throw

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** none

## Context

The Claude binding denies a scripted `git diff`/`git show` lacking `--no-ext-diff` via a PreToolUse hook (difftastic mangles scripted output). opencode has no `hooks.json`; a `permission.bash` pattern map cannot express "flag ABSENT" (patterns are literal + `*`/`?` wildcards, last-match-wins, no negation — design §D9 row 20).

## Options considered

1. **Plugin `tool.execute.before` that throws on a matching `git diff/show` lacking a compliant marker** *(designer recommendation)* — pros: faithful port of the deny; the only mechanism that can express flag-absence. Cons: needs the live-pinned tool-input field.
2. **`permission.bash` pattern** — cons: technically incapable of flag-absence.
3. **Drop the guard on opencode** — cons: reintroduces silent diff mangling.

## Decision

*Adopted-as-recommended (no user judgment).* The guard is `adapters/opencode/plugins/git-guard.ts`; its `tool.execute.before(input, output)` inspects the bash command and **throws** when it matches `GIT_DIFF_SHOW_RE` and lacks a compliant marker (`--no-ext-diff`, `rtk proxy`).

## Consequences

- Faithful parity with the Claude PreToolUse deny.
- The exact tool-input field carrying the bash command string is a live-smoke item (design §D9 row 24), pinned as pi pinned `@0.79.8`.
- The predicate is single-sourced within the binding (ADR-223).
