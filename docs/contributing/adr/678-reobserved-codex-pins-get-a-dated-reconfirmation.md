---
subjects:
  - BACKLOG.md
  - docs/contributing/specs/gate.md
  - adapters/codex/README.md
supersedes: []
---
# 678 — Re-observed codex pins get a dated re-confirmation, unobserved halves keep their pin

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-reprobe.md · **Supersedes/Refines:** none

## Context

Some 0.162.1 pins sit outside the brief's list (the BACKLOG malformed-rules and hook-trust entries,
`docs/contributing/specs/gate.md`), and some single sentences pin two claims of which 0.163.0
re-observed only one (the README malformed-rules surface split: `codex exec` re-observed, app-server
and TUI not; the `write_stdin` line: template key re-observed, `-c` launch flag not).

## Options considered

1. **Leave them** — cons: silent about a confirmation that exists
2. **One dated clause per re-observed claim; the unobserved half keeps its 0.162.1 pin**
   *(recommended)*
3. **Re-pin whole sentences to 0.163.0** — cons: claims evidence that was not gathered

## Decision

Adopted-as-recommended (no user judgment): option 2. Aligns with ADR-320 (correct only re-observed
rows, the older pin stays).

## Consequences

Every 0.163.0 pin points at a row the record holds; nothing is re-pinned on inference.
