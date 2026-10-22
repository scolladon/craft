---
subjects:
  - docs/contributing/specs/codex-poc-record.md adapters/codex/README.md BACKLOG.md
supersedes: []
---
# 680 — Codex TUI screen observations stay pinned per version and name their driver

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-rules-reprobe.md · **Supersedes/Refines:** none

## Context

On 0.163.0 the TUI status line shows `⚠ 1 warning · f2 to view` with a malformed `craft.rules`; on 0.162.1 an operator in a real terminal saw nothing on screen. The 0.163.0 runs used a scripted pty, so a codex change is not isolated.

## Options considered

1. **Side by side, each pinned to its version** — cons: implies a codex change the evidence did not isolate
2. **Side by side in current-state docs, plus a driver caveat in the record row** *(recommended)*
3. **Drop the 0.162.1 wording from current-state docs** — cons: discards a pinned observation

## Decision

Adopted-as-recommended (no user judgment): option 2. Aligns with ADR-320 (older pins stay) and ADR-678 (nothing re-pinned on inference).

## Consequences

The README and BACKLOG state both observations by version; the record row says whether 0.162.1 showed the badge is not established.
