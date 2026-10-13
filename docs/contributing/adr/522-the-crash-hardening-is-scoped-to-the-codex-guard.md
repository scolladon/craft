---
subjects:
  - adapters/codex/hooks/craft-guard.js
supersedes: []
---
# 522 — The crash hardening is scoped to the codex guard

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-hook-nonzero-exit-probe.md

## Context

The probe measured codex's exit-status handling only. The cursor guard and the root `hooks/git-no-ext-diff.sh` have no host exit-status matrix and no crash fixture; copilot's observer cannot deny by design (ADR-243).

## Options considered

1. **Codex guard only** *(recommended)*
2. **Also audit the sibling guards** — cons: no proof for either host

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with the no-unproven-scope principle; each sibling gets one Out-of-scope line in the design saying how to prove it.

## Consequences

Sibling guards keep today's behaviour until a host probe shows they fail open on a crash.
