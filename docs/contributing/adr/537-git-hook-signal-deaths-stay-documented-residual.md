---
subjects:
  - hooks/git-no-ext-diff.sh
  - docs/contributing/specs/gate.md
supersedes: []
---
# 537 — Git hook signal deaths stay documented residual

- **Status:** superseded by ADR-541
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

> **Superseded by ADR-541** for signal deaths: TERM and HUP now exit from their own traps, so the EXIT trap denies them;
> SIGKILL and untrapped signals stay residual.

## Context

SIGKILL, SIGTERM and SIGHUP end the hook with 137, 143 and 129 before the EXIT trap runs, and the call runs. SIGKILL cannot be trapped. Nobody has observed which signal, if any, Claude Code sends a hook or what it does next.

## Options considered

1. **Leave signal deaths as documented residual** *(recommended)*
2. **Add `trap 'exit 143' TERM`** — cons: hardens an unobserved trigger; SIGKILL stays residual anyway

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with the user's harden-only-on-proof rule and with the codex guard's written residual (ADR-518 Consequences).

## Consequences

The residual — a signal death, `/bin/bash` missing, the hook file missing or not executable, the hook killed by Claude Code's timeout (unprobed) — is written in the hook header and the gate spec (ADR-538). A later probe of the timeout can adopt option 2 cheaply.
