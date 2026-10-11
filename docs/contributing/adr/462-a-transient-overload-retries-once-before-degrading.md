---
subjects:
  - skills/run/SKILL.md
  - docs/contributing/specs/model.md
---
# 462 — A transient overload retries once before degrading

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/transient-model-retry.md · **Supersedes/Refines:** refines ADR-041

## Context

The model-resolution invariant degraded a tier for the whole run on any model-availability error,
so one transient 529 at the first spawn cost the run its `opus` designer and planner. A prior run
deviated and retried once on the pinned tier, leaving the written and practised rules in disagreement.

## Options considered

1. **Classified retry** *(recommended)* — overload retries once on the same tier; any other or
   unclassifiable availability error degrades at once — pros: never pays a permanent dead spawn twice
2. **Unclassified one retry** — cons: retries unknown-model / no-access errors that are certain to fail
3. **Manifest knob `models.retry`** — cons: a dial with no demand; engine + schema surface

## Decision

Option 1, ratified by the user. A spawn that dies on a transient overload (`529` /
`overloaded_error`) is respawned once on the same tier from the artifact. Any other availability
error, an unclassifiable one, or an overload on that retry degrades the tier for the run as before.
When one error text matches both classes, the permanent class wins.

## Consequences

- Prose-only change: SKILL.md invariant + walk step 9 and `specs/model.md` state one rule.
- Bindings with no pinned overload strings classify every error as permanent — today's behaviour.
