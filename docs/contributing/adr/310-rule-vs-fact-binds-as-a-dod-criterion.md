# 310 — The rule-vs-fact question binds as an asserted DoD criterion

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

The frame behind this change says: before adding a standing rule, ask whether a competent
orchestrator would decide correctly given one missing fact — and if so, state the fact instead.
That question is worth asking at authoring time, not only at prune time. The requirement is
that a proposed contract line must answer it first, which only an asserted criterion achieves.

## Options considered

1. **A new judgment-kind criterion plus a checklist line, N/A when inapplicable** *(recommended)* — pros: actually binds; the precedent for an honestly-N/A criterion already exists in the file / cons: every future run records an outcome for a question most changes answer N/A.
2. **A non-asserted paragraph below the checklist** — pros: cheaper, no per-run outcome / cons: non-binding; nothing makes a proposal answer it.
3. **Only in the prune skill, not in the DoD** — pros: leaves the DoD untouched / cons: the lens then fires only at prune review, never at authoring time.

## Decision

**Ratified by the user, as recommended.** The DoD gains a judgment-kind criterion asking
whether a proposed standing rule could be replaced by stating a missing fact, with an explicit
N/A convention for changes that add no rule.

## Consequences

Every craft run now records an outcome for this criterion; on most changes that outcome is
N/A, and an N/A must be recorded honestly rather than skipped. A change that does add a
contract line has to answer it before the validation phase can assert the DoD.
