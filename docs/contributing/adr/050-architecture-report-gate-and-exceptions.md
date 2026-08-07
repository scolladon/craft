# 050 — `architecture` report/exception home + `<arch gate>` resolution

- **Status:** superseded by ADR-348
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P10-default-phases.md · **Supersedes/Refines:** none

> **Superseded by ADR-348.** The report and exception decisions below stand, restated
> tool-independently there; every mention of dependency-cruiser as the gate, the exception
> home, or the report producer is superseded. `<arch gate>` now resolves to the declared
> `architecture` technique's own `run` exiting 0, per ADR-149's de-specialization.

## Context

The `architecture` descriptor produces `architecture-report` and carries `gate: <arch gate>`
(a placeholder, like validation's `<validation gate>`). P10 must pin: the report's form,
where the triager records a deliberate accepted exception, and what `<arch gate>` resolves
to.

## Options considered

1. **Report = depcruise violation output in the run record (no committed file);
   exceptions in dependency-cruiser's own rule config; `<arch gate>` = depcruise exits 0
   on scope** — pros: matches validation (no committed report; outcomes in the run record);
   the tool's native exception home keeps "one home per concern"; the gate is the tool's
   own exit status / cons: no standalone audit file. *(designer's recommendation)*
2. **Committed `docs/architecture/<slug>.md` report + inline `dependency-cruiser-disable`
   comments** — pros: an audit trail in-repo / cons: a second report convention to
   maintain; inline disables scatter exceptions across source.
3. **Run-record report; exceptions in a sidecar `architecture-exceptions.md`** — pros:
   one exceptions file / cons: duplicates what the tool config already expresses; drifts.

## Decision

`architecture` records its violation report **in the run record** (no committed report
file), exactly as `validation` records survivor outcomes. A deliberate, justified
exception is encoded in **dependency-cruiser's own rule config** (a scoped `from`/`to`
allow/override), with one line of why — never by weakening a rule wholesale. `<arch gate>`
resolves to **"dependency-cruiser exits 0 over the scope"** (the tool's own pass status),
consistent with the harness-exec "gate-green before commit" invariant.

## Consequences

- `architecture-triager`'s contract: per violation → FIXED (edge removed under gate) /
  EXCEPTION (config override + one-line proof) / FALSE (tool mis-report) / blocker.
- The harness-exec bundle's existing "survivors or violations … never weaken a test to
  kill a mutant or clear a violation" language already covers violation-triage — no new
  contract fragment.
- No `docs/architecture/` directory is introduced.
