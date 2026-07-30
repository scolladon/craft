# 312 — The fan-out advisory fires at pipeline resolution, not manifest lint

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

A repo can tune the review phase's reviewers-per-dimension without any ceiling, and the cost
is real: measured against this repo's own spawn history, each reviewer spawn has a pooled
median around 92,500 tokens. An advisory should fire on the resolved product of dimensions and
passes — but that product only exists after resolution. The manifest linter sees a passes
value with no dimensions and never reads the pipeline defaults, so it cannot compute it.

## Options considered

1. **Manifest lint** — pros: where an operator editing the manifest actually looks / cons: needs a warnings channel threaded through every sub-validator, plus the defaults it does not read; and it still cannot see the product without them.
2. **Pipeline resolution — one advisory pushed into the existing records** *(recommended)* — pros: the resolved product exists there; lands in the run record where every other advisory lands; one line / cons: not visible at the moment an operator edits the manifest.
3. **Both** — pros: covers both moments / cons: the full cost of the manifest-lint option plus the resolve one.

## Decision

**Ratified by the user, as recommended.** The advisory is pushed into the resolution's
existing advisory records, which the orchestrator already seeds the run record with. The
manifest linter's return shape is unchanged.

## Consequences

The warning appears in the run record of any run whose resolved fan-out exceeds the threshold,
not at manifest-edit time. If operators turn out to need it while editing, adding the manifest
surface later is additive and does not undo this.
