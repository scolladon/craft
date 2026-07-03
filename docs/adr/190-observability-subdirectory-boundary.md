# 190 — observability stack lives in engine/src/observability/ with a nested claude adapter dir

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** refines the P29 telemetry layout

## Context

The memory/metrics/telemetry stack (memory.js, usage-aggregate.js, usage-mine-main.js,
metrics-split.js, telemetry-claude.js, pricing-claude.js) has grown into a second product
inside engine/src, blurring the "small invariant core" claim. It needs its own boundary
without churning the build, CI, or mutation config.

## Options considered

1. **engine/src/observability/ subdirectory** (recommended) — pros: zero stryker/ci/package
   churn (the mutate glob recurses); vendor bindings get an explicit
   `observability/adapters/claude/` home / cons: boundary is lint-enforced, not
   package-enforced.
2. **Sibling package (engine-obs/)** — pros: hardest boundary / cons: new stryker config,
   ci.sh step, cross-package import plumbing.
3. **Flat rename (obs- prefix)** — pros: cheapest diff / cons: no directory boundary; the
   second product stays visually inside the core.

## Decision

**Ratified by the user.** The observability stack moves to `engine/src/observability/`,
with vendor-specific bindings under `engine/src/observability/adapters/claude/`. The
engine core (pipeline resolution, manifest handling, contracts) stays directly under
engine/src. The boundary is enforced by the source-hygiene lint (ADR-191), not by
packaging.

## Consequences

Import paths inside engine/src and engine/bin shims update; no consumer-facing module
path changes outside the engine. Forecloses the sibling-package option unless the stack
grows its own release cadence. Creates the adapter home ADR-198 places metrics-split.js in.
