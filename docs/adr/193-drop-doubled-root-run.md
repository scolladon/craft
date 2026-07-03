# 193 — ci.sh drops the doubled repo-root engine run; hermetic-suite is the cwd guard

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** refines the P28 hermeticity work

## Context

ci.sh runs the engine suite twice — from engine/ and again from the repo root — to catch
cwd-sensitive tests. P28 added dedicated hermeticity coverage (hermetic-suite tests plus
the with-cwd/empty-home isolators), which pins cwd/$HOME independence directly and more
sharply than a duplicate full run.

## Options considered

1. **Drop the second run, credit hermetic-suite** (recommended) — pros: ~1/3 CI runtime
   saved; the guard that remains is the sharper one / cons: a cwd bug in a test outside
   hermetic-suite's pinned set could slip — accepted, as the isolators are the intended
   pattern for new tests.
2. **Drop it and broaden hermetic-suite first** — cons: broadening approaches the cost of
   the doubled run it removes.
3. **Keep the doubled run** — cons: pays the full duplicate cost for marginal coverage.

## Decision

**Adopted-as-recommended (no user judgment).** The repo-root duplicate engine run is
removed from ci.sh; cwd-independence is owned by the hermetic-suite tests. The rationale
is recorded here and in the design doc, per the brief's DoD.

## Consequences

CI runtime drops materially and the run-count assertions simplify (one per suite). New
cwd-sensitive behaviour must be pinned via the P28 isolators rather than relying on the
duplicate run.
