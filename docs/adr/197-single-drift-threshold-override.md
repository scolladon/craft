# 197 — drift flags on a single default relative threshold with a --threshold override

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** none

## Context

The drift mode compares per-phase cost/duration against the ADR-196 baseline. Sensitivity
tuning must not balloon into per-dimension configuration for an advisory signal, and the
outcome dimension (pass/fail shape of a phase) has no numeric distance yet.

## Options considered

1. **Single default relative threshold + --threshold override; outcome deferred**
   (recommended) — pros: one knob, honest about what's measurable today / cons: cost and
   duration share a sensitivity.
2. **Per-dimension thresholds** — cons: config surface disproportionate to an advisory
   alarm.
3. **Include outcome as a dimension now** — cons: no principled distance metric; noise.

## Decision

**Adopted-as-recommended (no user judgment).** One default relative threshold, overridable
per invocation via --threshold; outcome drift is deferred until a meaningful metric
exists.

## Consequences

The advisory output stays one-line-per-phase simple. Adding per-dimension tuning later is
backward-compatible (the single flag becomes the default for each).
