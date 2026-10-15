---
subjects:
  - adapters/copilot/src/probe.js
  - adapters/copilot/src/deny-tool-args.js
supersedes: []
---
# 588 — Copilot hook enforcement carries no version gate

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

The hook deny is proven on 1.0.92; 1.0.63 showed no deny for exit 2. The versions between are
unpinned.

## Options considered

1. **No gate; `--deny-tool` stays as the floor** *(recommended)* — the docs state the proven
   version.
2. **The probe refuses a version below 1.0.92** — cons: invented precision.
3. **Drop `--deny-tool`** — cons: removes the only layer known to work on older binaries.

## Decision

Adopted-as-recommended (no user judgment): option 1.

## Consequences

On an older copilot the prefix layer remains the only command-policy enforcement.
