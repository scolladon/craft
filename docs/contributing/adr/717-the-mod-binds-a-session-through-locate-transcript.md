---
subjects:
  - hooks/progress/bind.ts
---
# 717 — The mod binds a session to its run through locate --transcript

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

## Context

Only the session that opened a run may show it. The compaction hooks already bind a session to its ledger through `run-ledger.sh locate --transcript`, with pointer trust and symlink refusal.

## Options considered

1. **`run-ledger.sh locate --transcript`, retried on the next trigger, behind a pointer-list gate** *(recommended)* — pros: the trusted path the compaction hooks use / cons: binds one call after `open`
2. **Parse the run-key from `open`'s stdout** — cons: a new parser to bind one call earlier
3. **`locate --run` on a run-id from the command text** — cons: binds any session naming the run

## Decision

Option 1. Aligns with reusing the compaction hooks' binding.

## Consequences

The first bind lands on the call after `open`. A session with no pointer present spawns nothing.
