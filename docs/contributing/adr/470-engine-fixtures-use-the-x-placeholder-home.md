---
subjects:
  - engine/test/usage-mine-main.test.js
  - engine/test/fixtures/aider/real-session.md
---
# 470 — Engine test fixtures use the `x` placeholder home

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/scrub-home-dir-from-docs.md · **Supersedes/Refines:** none

## Context

Two engine test files carry the maintainer's home (a `usage-mine-main` input and a real aider
capture). Leaving them needs a guard exemption; rewriting the segment was proven green
(125/125) in a throwaway copy.

## Options considered

1. **Rewrite the username segment to `x`** *(recommended)* — pros: no exemption, coverage unchanged
2. **Exempt the files in the guard** — cons: the username stays public

## Decision

Option 1, ratified by the user. Only the username segment changes, to the existing `x` placeholder.

## Consequences

- The aider fixture is no longer byte-identical to the original capture; only that segment differs.
