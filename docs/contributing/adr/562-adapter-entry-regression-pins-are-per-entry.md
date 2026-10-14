---
subjects:
  - adapters/codex/test
  - adapters/pi/test/cli.test.js
---
# 562 — Adapter entry points get per-entry behavioural link tests, not a sweep

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/adapter-entry-symlink-guard.md · **Supersedes/Refines:** none

## Context

Two adapter entry points exist. Each needs its own loud input and a sealed environment (ADR-345): codex refuses `--bogus`; pi needs a `git init`-ed cwd, pinned git config and no `pi` on PATH. `adapters/pi/test/cli.test.js` checks the literal guard string.

## Options considered

1. **Per-entry behavioural tests** *(recommended)* — a test per entry spawns it through a test-made link with bad input and asserts a non-zero exit; the pi literal-string test becomes an import-must-not-run check / pros: proves the property, no fixture overrides / cons: a new adapter entry needs its own test.
2. **ADR-560-style sweep over `adapters/*/bin/*.js` and pi's `bin`** — cons: every member needs an override, so enrolment gains nothing.
3. **Repo-wide text pin forbidding `process.argv[1] ===`** — cons: the text-pin shape ADR-560 rejected.

## Decision

Adopted-as-recommended (no user judgment): option 1, following ADR-560's behaviour-over-text rule. Each adapter entry point carries a test that reaches it through a link and asserts it is loud on bad input; no test pins the guard's source text.

## Consequences

A future adapter entry point needs a hand-written link test. The pi literal-string assertion is removed.
