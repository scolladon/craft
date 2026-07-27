# 173 — extract extends-validation module; harness-knob single-source stays a no-op

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/clear-backlog-candidates-gated.md

## Context

Two behavior-preserving refactors were parked pending their trigger:
- **B1** extract the shared `checkFileRef` leaf + `validateExtends*` cluster out of
  `engine/src/manifest.js` into its own module. Deferred until `manifest.js` grows further.
- **B2** single-source the harness-knob type schema duplicated between `coerceHarnessValue`
  (CLI coercion) and `validateHarness` (typing). Deferred until a knob is added or renamed.

## Decision

- **B1 — extract now.** `manifest.js` is 895 lines, over the 800-line ceiling; the size
  trigger has fired. Pulling `checkFileRef` into a shared `manifest-file-ref.js` leaf and the
  `validateExtends*` cluster into `extends-validation.js` is behavior-preserving and drops
  `manifest.js` back under the ceiling.
- **B2 — honest no-op.** B2's trigger (a knob added or renamed) has not fired. The coercion
  and validation knob sets are structurally asymmetric — coercion parses richer shapes
  (`convergence` as number-or-enum, `dimensions` as comma-split array) than validation types —
  so a faithful single-source map must carry coerce-fn + predicate + message per knob, costing
  more abstraction than the duplication removes. Recorded as an evidenced no-op; revisit when a
  knob changes.

## Consequences

- New `engine/src/manifest-file-ref.js` and `engine/src/extends-validation.js`; `manifest.js`
  imports both. Character-identical validation output (the existing manifest-lint suite is the
  behavior-preserving proof).
- B1 sequences first among the engine-src workstreams — it restructures the file other
  workstreams (C export, E validator) also touch.
