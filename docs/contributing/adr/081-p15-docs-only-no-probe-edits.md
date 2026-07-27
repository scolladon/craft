# 081 — P15 is docs-only: no skill-probe behaviour edits

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P15-second-instantiation.md · **Supersedes/Refines:** none (DC-6 as recommended); scoped against ADR-082

## Context

The design's leak audit pinned that every per-phase capability probe is already language-neutral or
degrades to a recorded no-op (workspace lockfile probe is multi-ecosystem; implementation/review gate
probe discovers the repo's test command; validation/architecture probes no-op without their tools;
propose no-ops without a remote). The question is whether P15 edits any probe wording or stays a
validation+docs phase. P15 is the ship gate, where an unintended default-path change is highest-risk.

## Options considered

1. **Docs-only** — skills already implement the probes correctly (audited); P15 changes no skill
   behaviour, only documents it — pro: zero risk of regressing the default tsgit path at the ship gate;
   keeps P15 a validation+docs phase / con: the probe prose stays as-is (already correct). *(designer's
   recommendation, with the ADR-082 propose-gate clause as the sole exception)*
2. **Clarify implementation/validation probe prose** (non-JS discovery order + degradation explicit) —
   con: must keep SC1 byte-identical and must not change agent behaviour; risk for marginal clarity.
3. **Clarify + add a shellcheck-clean helper** that prints the discovered gate command — con: adds a
   binary and an `EXPECTED_TESTS`/bats touch for marginal value.

## Decision

P15 is a **validation + docs** phase and edits **no skill-probe behaviour**. The probes are already
language-neutral (audited and pinned in the design). The **sole** orchestrator-prose edit P15 makes is the
propose-gate-on-runtime-no-op release clause (ADR-082) — and that is a deadlock fix, not a probe-behaviour
change. No new helper binary is added.

## Consequences

- No risk of regressing the default zero-config tsgit behaviour at the ship gate; SC1 stays byte-identical
  (G9 "unchanged from today" preserved).
- The non-JS discovery order + degradation behaviour is captured in the docs (ADR-079) and the SC5 record
  (ADR-080), not in edited probe prose.
- The one allowed behaviour touch (ADR-082) is bounded and SC1-neutral (fires only on a runtime no-op,
  which the tsgit default path never hits).
