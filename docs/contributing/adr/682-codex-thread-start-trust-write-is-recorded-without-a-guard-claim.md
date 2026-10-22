---
subjects:
  - docs/contributing/specs/codex-poc-record.md
supersedes: []
---
# 682 — The app-server thread/start trust write is recorded without a guard claim

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-rules-reprobe.md · **Supersedes/Refines:** none

## Context

Each app-server `thread/start` wrote `[projects."<cwd>"] trust_level = "trusted"` into the throwaway `config.toml`. A trusted project's `.codex/config.toml` can turn tty back on, but no probe chained the two.

## Options considered

1. **One clause in the app-server control row, no README or BACKLOG claim** *(recommended)*
2. **Option 1 plus a README Guard bullet** — cons: states an unprobed chain as a guard fact
3. **Omit it** — cons: discards an observed fact

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with ADR-678 (nothing re-pinned or claimed on inference).

## Consequences

The fact is on record for a later probe; the Guard section claims nothing new.
