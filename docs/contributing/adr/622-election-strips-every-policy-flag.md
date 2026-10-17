---
subjects:
  - engine/src/driver-state.js
---
# 622 — An elected prompt carries no --policy flag, whatever its verdict

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** Refines ADR-130

## Context

Spike evidence `entry-1.next-elected.md`: the elected prompt copied `--policy push=always --policy propose=always --policy integrate=always --policy teardown=always`, which pre-approves outward actions for an entry nobody approved. ADR-130 makes `--policy` the per-invocation approval channel.

## Options considered

1. **Strip every `--policy` token, any verdict; keep `--skip`, `--profile`, `--harness`, `--config`** *(recommended)* — pros: approval never travels; quality knobs a person can see stay
2. **Strip only `=always`** — cons: an `ask`/`never` from the last entry is no more the next entry's decision
3. **Strip all craft flags** — cons: silently changes a deliberate profile

## Decision

**adopted-as-recommended (no user judgment)** — option 1. The written `next.prompt` contains no `--policy` flag token. Approval is the driver's, per entry; an election never carries it. ADR-130 stands: `--policy` remains the per-invocation overlay.

## Consequences

- Stated in the driver spec and the policy spec's Claude binding.
