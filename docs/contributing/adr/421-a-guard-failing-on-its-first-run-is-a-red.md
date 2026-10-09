---
subjects:
  - contracts/construction.md
---
# 421 — A `GUARD` failing on its first run is a RED

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/arriving-guard-contract-rule.md · **Supersedes/Refines:** refines ADR-412

## Context

ADR-412's contract sentence says a plan `GUARD` "owes no failure and no GREEN" and is silent on a `GUARD` that fails when first run. `implementer-runs-guards` measured the gap: every with-craft opus and sonnet run blocked at the failing `GUARD`, citing that it owes no GREEN; every haiku run greened it silently and kept the `GUARD` label. The intended outcome was already settled in the planner-red-label-audit design: a RED, its GREEN, a RED/GREEN line, a deferred observation, no blocker.

## Options considered

1. **Append one sentence and leave ADR-412's sentence byte-identical** — pros: smallest diff / cons: the absolute "owes no GREEN" stays and an exception follows it in the same line
2. **Scope ADR-412's exemption to a `GUARD` that passes on its first run, then add the failing case** *(recommended)* — pros: removes the contradiction at its source / cons: rewrites ADR-412's decision text; 34 more characters than option 1
3. **Option 2 plus "a planned RED that passes on its first run stays a blocker"** — pros: explicit / cons: restates sentence 1; more tokens per spawn; no measured failure behind it

## Decision

The maintainer chose option 2. Line 1 of `contracts/construction.md` reads: a plan GUARD entry is written, run, and confirmed passing for its stated reason, and no step breaks code to watch it fail. A GUARD that passes on its first run owes no failure and no GREEN. A GUARD that fails on its first run is a RED: write its GREEN, report a RED/GREEN cycle, and note the plan mismatch as a deferred observation, not a blocker. A planned RED that passes on its first run stays a blocker under the unchanged first sentence.

## Consequences

- ADR-412's "owes no failure and no GREEN" now holds only for a `GUARD` that passes on its first run; its other guarantees stand.
- A `GUARD` that fails and whose GREEN lies outside the part is left open: the Scope line and "not a blocker" pull apart, and no run has produced one.
- The paid `implementer-runs-guards` sweep per agent tier is the behavioural evidence.
