---
subjects:
  - adapters/copilot/test/git-guard.differential.test.js
supersedes: []
---
# 653 — The copilot arm judges in-process through decideGuard

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/copilot-guard-differential-fuzz-arm.md · **Supersedes/Refines:** none

## Context

Hook-process parity (exit code, stdout, worker deadline) is already owned by adapters/copilot/test/craft-guard-hook.test.js; a per-command hook spawn costs about 6 s per seed.

## Options considered

1. **In-process decideGuard only**, with a JSON-string toolArgs payload (recommended).
2. Also spawn the copilot hook per command / cons: +6 s per seed for transport coverage that exists.

## Decision

Adopted as recommended: the arm judges each command with `decideGuard` on a copilot-shaped payload, which reaches `copilotGuard`.

## Consequences

The arm stays under 5 s per shell at the default seed.
