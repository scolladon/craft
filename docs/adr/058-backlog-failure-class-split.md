# 058 — Backlog failures split by class: config → engine exit, runtime → session blocker

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P11-backlog-port.md · **Supersedes/Refines:** none

## Context

Backlog failures fall into two kinds: **config errors** (unknown source, missing `ref`, a
`file` ref that does not exist) — knowable from the manifest alone, with no I/O — and **runtime
errors** (a `custom` script missing/non-exec/non-zero, `resolve` on an absent id) — knowable
only by invoking a live tool. `engine/src/**` is pure/no-I/O (ADR-002), so it can detect the
first class but not the second.

## Options considered

1. **Always a session blocker** — route everything through the blocker protocol. cons: loses
   the config-time loud STOP the engine already does well at validation.
2. **Split by failure class** — config errors exit non-zero through `manifest-lint` /
   `pipeline-resolve` (existing loud-STOP path); runtime errors escalate as session blockers.
   pros: each failure handled where it can actually be detected / cons: two code paths.
   *(designer's recommendation)*
3. **Defer all to a future I/O bin** — cons: over-builds; contradicts the pure-engine constraint.

## Decision

Failures are **split by class**:

- **Config errors** (unknown `source`, non-object `backlog`, unknown sub-key, missing required
  `ref`, a `file` `ref` that does not exist) are caught by `validateBacklog` and surfaced as a
  non-zero exit from `manifest-lint` / `pipeline-resolve` — the run STOPs at `run/SKILL.md`
  step 1, the existing behaviour.
- **Runtime errors** (a `custom` resolver missing/non-exec/non-zero, an id absent from the
  source, a tool unauthed/down) escalate via the **session blocker protocol**
  `{ unit, reason, ≤3 options }`. The pure engine never probes a live tool.

## Consequences

- `validateBacklog` owns the config-error set; the run/documentation skills own the
  runtime-blocker escalation.
- `custom.ref` is therefore NOT existence-checked at validation (it is runtime-resolvable per
  [[055-backlog-two-source-model]]); a missing script is a runtime blocker, not a config error.
- Consistent with [[057-backlog-blocker-clause-core]] (the blocker invariant) and
  [[059-custom-complete-guard]] (the runtime guard on `complete`).
