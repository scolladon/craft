# 023 — P6 scenario coverage: S-lean + S-full + bin precedence + recorded manual check

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P6-execution-topology.md · **Supersedes/Refines:** none

## Context

S1 (`profile:solo`), SC1 (zero-config all-agent), and the per-descriptor
`contract-equivalence.test.js` guard (agent-vs-inline block differs by exactly the two carve-out
lines) are already green. P6 introduces two new engine behaviours — the `lean` profile (ADR-021) and
the `pipeline-resolve` CLI overlay (ADR-022) — plus a walk-level claim that is **not** a Node entry
point: that an inline-executed phase produces the same committed artifact as its agent execution.
What is the minimal honest gate?

## Options considered

1. **`profile:full` assertion only** — cheap, but leaves `lean` and the CLI overlay uncharacterised.
2. **S-lean + S-full + bin flag-precedence tests + a documented manual acceptance check** for the
   walk-level inline fidelity. *(user choice)*
3. **No new tests** — relies on S1 + equivalence guard + SC1; leaves named-value and overlay gaps.

## Decision

Add, as the P6 gate on top of the already-green suite:

1. **S-lean** — `profile: lean` yields specification + delivery inline, construction + refinement
   agent, harness agent. The TDD anchor for the new profile (drives ADR-021's map).
2. **S-full** — `profile: full` yields all-agent (closes the named-value gap SC1 covers only
   behaviourally — a `full` typo should be characterised, not silently thrown).
3. **Bin flag-precedence tests** — `--profile` beats the manifest profile; `--skip` union-extends
   `pipeline.skip`; flags compose with positional pipeline/manifest paths (ADR-022).
4. **A documented manual acceptance check** (NOT CI-gated): a craft dogfood run under `--profile lean`
   confirming an inline phase commits the same artifact shape as its agent run, **recorded in the run
   record**. The walk is a skill (no Node entry point to unit-test), so this surface gets an explicit,
   recorded check rather than a silent gap.

The walk-level inline-fidelity claim rests on ADR-020 (same craft inline) + the equivalence guard
(same block) + unchanged gate mechanics (`run/SKILL.md` step 5).

## Consequences

Every new *engine* behaviour (lean, CLI overlay) has a deterministic CI test; the one
un-unit-testable surface (the skill walk) has an explicit recorded manual check. S1/SC1/equivalence
stay unchanged. The manual check is a documented procedure in the P6 design doc, runnable on demand
and as a release smoke test.
