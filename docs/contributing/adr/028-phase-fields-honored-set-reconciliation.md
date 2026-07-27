# 028 — PHASE_FIELDS reconciliation: validate the whole honored field set

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P8-harness-config.md · **Supersedes/Refines:** refines ADR-012 (manifest shape-validation in the Node core)

## Context

P8 needs `validateManifest` to accept `phases.<id>.harness`. But `manifest.js`
`PHASE_FIELDS = {context, override, strategy, merge-flags, non-blocking-jobs}` also omits
`execution`, `enabled`, `role`, and `model` — all of which the **resolver already honors**
(`applyAllowedOverrides` copies role/model/harness; `applyEnableEdits` reads enabled;
`resolveExecution`/`validateExecutionValues` read execution). So `validateManifest` rejects
manifests the resolver consumes — a latent lint gap. Empirically verified rejections:
`phases.documentation.execution: inline` (PRD §7 #4's own catalog sample),
`phases.planning.role: my:domain-planner` (the S2 scenario fixture),
`phases.review.harness: {max_cycles: 2}` (P8's target), `phases.requirements.enabled: true`.
Scenario tests miss it because they call `resolvePipeline` directly, bypassing `validateManifest`.

## Options considered

1. **Add only `harness` now** — minimal diff; leaves execution/enabled/role/model rejected,
   so the documented catalog (§7 #4) still fails lint and P9 re-touches `manifest.js`.
2. **Reconcile the whole honored set in one part** — add `harness, execution, enabled, role,
   model` to `PHASE_FIELDS` together. Same fix-class, one coherent change, closes the real bug
   and smooths the P9 agent-swap. *(user choice)*

## Decision

`PHASE_FIELDS` is extended to the full honored set in one part. Acceptance + shape checks land
per field: `role`/`model` must be strings, `enabled` must be a boolean, `harness` is shape-checked
by a named `validateHarness` (ADR-030). **`execution` is accepted shape-only** — its VALUE is
already validated by `validateExecutionValues` in `resolve.js`, and the existing top-level
`execution` key is likewise accepted shape-only in `manifest.js`; duplicating the value check
would split ownership (DRY). The shape checks live in `validatePhaseBlock` beside the existing
`context`/`override` file-ref checks; `validateManifest` stays single-responsibility shape
validation, semantic validation stays in the resolver (DC-2).

## Consequences

The documented Tier-0 catalog (`execution`/`role`/`harness` per-phase) now lints clean, and the
S2 fixture validates through the lint path it previously failed. P9's agent-swap (`role:`) needs no
further `manifest.js` change — the field is already accepted and shape-checked. A
`phases.<id>.execution: <bad>` still passes lint and is caught at resolve time (consistent with the
top-level execution key), keeping the value check in one home.
