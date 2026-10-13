---
subjects:
  - adapters/codex/hooks/craft-guard.js
  - adapters/codex/test/craft-guard-hook.test.js
supersedes: []
---
# 521 — Guard crash paths are pinned by throwaway-tree fixtures

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-hook-nonzero-exit-probe.md

## Context

The real stdin overflow needs over 512 MiB of input and about 20 s per run, too slow for the per-part gate. Without a test, deleting a crash handler stays green.

## Options considered

1. **mktemp copies of `hooks/` and `src/` with one piece removed or stubbed** *(recommended)* — runs in milliseconds, red against today's guard
2. **The real overflow** — cons: ~20 s per run
3. **No test for the outside-the-try class** — cons: handler deletion stays green

## Decision

Adopted-as-recommended (no user judgment): option 1. Each fixture copies the adapter's `hooks/` and `src/` into a throwaway root and breaks one piece (unresolvable engine import, a stdin-listener throw, no verdict, a floating rejection), then spawns the copied guard under `process.execPath` and asserts exit 2 with a `craft-guard:` stderr line. Follows the repo's mktemp test precedent (`adapters/codex/test/config.test.js`) and the TDD principle that every behaviour change has a red test.

## Consequences

The stdin-listener stub throws the same error type from the same kind of callback as the real overflow; it does not exercise V8's string limit itself.
