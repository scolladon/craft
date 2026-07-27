# 169 — reject the nested `pipeline.insert` form (fail loud at lint)

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/DESIGN-nested-insert-fail-loud.md · **Supersedes/Refines:** none

## Context

`applyInserts` consumes only the FLAT insert shape `{ after|before, id, procedure, … }`.
The nested shape `{ after, phase: { id, … } }` parses and resolves `ok: true`, but
`applyInserts` spreads `{ phase: { … } }` into a descriptor with no top-level `id` — a
`null`-id phantom phase is injected and the intended phase silently vanishes. No error is
raised at lint or resolve. The shipped `everything-claude-toolkit` example uses the nested
form, so it demonstrates a silently-broken insert a user would copy.

## Options considered

- (a) FAIL LOUD — reject the nested shape at `manifest-lint` (a new `validateInsert` in
  `engine/src/manifest.js`), the same way unknown keys are already refused.
- (b) NORMALIZE — accept the nested form by flattening it in `applyInserts` (or a pre-pass),
  so both shapes work.
- (c) Hybrid — normalize at resolve + warn at lint.

## Decision

(a). Matches craft's loud-misconfiguration ethos and the existing unknown-key /
`validateReorder` / `validateTechnique` precedent: an invalid manifest fails closed at lint
with exit 2, never silently. One shape per concept. (c) needs a soft-warning channel craft
does not have; (b) blesses two shapes for one concept.

The example (`examples/everything-claude-toolkit/workflow.md`) is corrected to the flat shape
in the same change, with the canonical anchor `after: implementation` (DC4 — both the alias
`implement` and the canonical id resolve, but an exemplary example should not lean on the
deprecated alias).

## Consequences

- A new `validateInsert(pipeline.insert, errors)` is wired into `validatePipelineKeys`.
- `scripts/manifest-lint.sh` / `engine/bin/manifest-lint.js` are untouched — the bin already
  exits 2 on any `errors[]`.
- `test/examples-lint.bats` lints every example, so the validator change and the example fix
  MUST land together (the suite goes red otherwise).
