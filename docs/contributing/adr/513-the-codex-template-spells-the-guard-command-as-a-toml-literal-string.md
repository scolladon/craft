---
subjects:
  - adapters/codex/config.template.toml
  - adapters/codex/test/hook-trust.test.js
---
# 513 — The codex template spells the guard command as a TOML literal string

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/codex-hooks-quote-plugin-root.md · **Supersedes/Refines:** none

## Context

The quoted command (ADR-512) carries double quotes, which a TOML basic string must escape. codex 0.161.0 `hooks/list` and Python `tomllib` decode the literal and the escaped spelling to the same command, with the same hash.

## Options considered

1. **Literal string** `command = 'node "${…}/adapters/codex/hooks/craft-guard.js"'` *(recommended)* — pros: reads exactly like the `hooks.json` value; nothing to drop when copied by hand; the test reads the value verbatim / cons: none observed
2. **Basic string with `\"` escapes** — pros: matches the other template lines' quote style / cons: a hand copy can lose a backslash; the test needs a hand-written TOML unescaper in a dependency-free adapter
3. **Multi-line literal `'''…'''`** — pros: also escape-free / cons: a form no other line uses

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** The template's `command` is a single-quoted TOML literal string holding the command verbatim, and the test pattern that extracts template commands reads that spelling.

## Consequences

A future command containing a single quote could not use this spelling; none is planned.
