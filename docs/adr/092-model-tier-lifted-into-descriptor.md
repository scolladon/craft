# 092 — Per-role model tier lifted into the pipeline descriptor (re-baselined)

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
The per-role model tier (`opus|sonnet|haiku`, SP5 model-class data) lives only in `agents/*.md`
frontmatter — a Claude-adapter artifact a non-Claude adapter does not reuse. `pipeline/default.yml`
carries `role:` but no `model:`; `engine/src/**` reads only the manifest's `models.fallback`,
never a per-agent pin. So a second adapter inherits the pipeline + contracts but **not** the
per-role tier. This is the one place Execution/Model extraction has content beyond re-framing.

## Options
1. **Lift the tier into the descriptor** — add an adapter-neutral `model:` field to `pipeline/default.yml`, surfaced by the resolver. pros: one canonical source every adapter inherits, no drift / cons: an observable change to the Claude spawn path — NOT a no-op; requires re-baseline. *(designer's recommendation, chosen)*
2. **Leave the tier in `agents/*.md`; each adapter ships its own role→tier table** — pros: zero Claude-path change / cons: duplicates the canonical tier per adapter (drift risk).
3. **Standalone `pipeline/model-pins.yml` both adapters read** — pros: single source / cons: a new file for one field.

## Decision
Add an adapter-neutral `model:` field to each phase descriptor in `pipeline/default.yml`,
seeded with today's per-role tiers, and have the resolver surface it on the emitted descriptor.
The Claude orchestrator resolves the spawn model from that field (manifest `models.<role>` →
descriptor `model:` → `models.fallback`); the Pi adapter maps the same tier to a Pi
provider/model. **The agent-frontmatter pins remain the Claude binding** but the canonical tier
is the descriptor field.

## Consequences
- **This is NOT engine/src-clean.** It touches `pipeline/default.yml` (data) and the resolver's
  descriptor projection (`engine/src`), so the design's R-core-clean "engine/src unchanged" claim
  is read **with this carve-out**, exactly as R-sc1 anticipated.
- **Re-baseline obligation (load-bearing):** the change must be proven equivalent on the Claude
  side — SC1 golden walk + R8 agent-output baseline + the `node --test` count guard must be
  re-baselined so the resolved spawn model per phase is provably identical to today. A silent
  tier drift is a breach. The planner MUST carry a dedicated part for this with the re-baseline
  in its gate.
- Every present and future adapter reads one tier source; resolution order stays core policy.
