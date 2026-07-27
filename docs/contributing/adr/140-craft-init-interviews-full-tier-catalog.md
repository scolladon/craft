# 140 — `craft:init` interviews the full Tier-0/1 customization catalog

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P25-interactive-manifest-generator.md · **Supersedes/Refines:** none

## Context

`docs/GUIDE-customizing.md` §3 lists ~13 customization points (skip, model, gate, execution,
profile, harness, backlog, memory, policy, context, role, override, insert). The design
recommended a curated common set plus an "advanced" opt-in to avoid interview fatigue (DC-8).

## Options considered

1. **Curated common set + advanced opt-in** *(designer recommendation)* — pros: short default path. Cons: advanced points sit behind a second gate.
2. **Full Tier-0/1 catalog** *(user choice)* — pros: one pass surfaces every customization the repo can use; the probe rules several out anyway. Cons: a longer interview.
3. **Tier-0 only** — cons: advanced points left to hand-editing afterward.

## Decision

The interview covers the full Tier-0/1 catalog: every point the probe deems usable, each
defaulted from the `CapabilityReport`. Points the probe rules out (e.g. `validation` harness
when no mutation tool, `propose` when no remote) are skipped or asked with a "no-ops in your
repo" note rather than silently dropped. The user chose completeness over a curated set,
deviating from the recommendation.

## Consequences

- The interview is longer but yields a complete manifest in one pass.
- Probe-driven defaulting and ruling-out keep the question count bounded to what the repo can
  actually use.
