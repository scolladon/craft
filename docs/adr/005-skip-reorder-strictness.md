# 005 — Skip/reorder strictness: graph-only, harnesses waivable

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

PRD G1 ("skip any phase") is in tension with design tenet #3 ("best practices mechanically
enforced, not merely suggested", §1). The crux: can the PR-gating executing harness
(validation/mutation) be skipped via the manifest? Today it is statically protected.

## Options considered

1. **Graph-only; all harnesses waivable** — review/refactoring/validation skippable-but-flagged;
   a skipped validation waiver-releases its PR-gate; only a stranding skip is refused. Max G1;
   accountability via the run-record flag. *(user choice)*
2. **Protect validation only** — softer harnesses waivable, validation non-waivable.
   *(designer recommended)*
3. **Hard floor: protect all gates** — closest to today, least customizable.

## Decision

The **dependency graph fully replaces the static protected list**. A skip is refused **only**
when it strands a non-self-supplying consumer; otherwise it is allowed and **loudly flagged in
the run record**. Harness phases (review, refactoring, validation) are skippable-but-flagged; a
skipped or disabled executing-harness **waiver-releases its `propose`-gate** (you cannot gate on
a phase you chose not to run). The single non-waivable floor is "**a gate must exist for
code-producing phases**" — never any individual harness. Arbitrary reorder stays deferred
(insert+skip first, OQ1).

## Consequences

"Skip any phase" (G1) is literally true. "Validation gates the PR" becomes a **strong default
with visible accountability** (the run-record waiver), not a mechanical block — consistent with
the run record being forge's accountability ledger. The resolver/walk must record every waiver
and gate-release. Reorder validation (consumer-before-producer rejection) is specified but
dormant until reorder lands. Revisit if field experience shows waived validation eroding quality.
