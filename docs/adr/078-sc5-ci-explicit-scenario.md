# 078 — SC5 CI assertion: one explicit resolver-neutrality scenario

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P15-second-instantiation.md · **Supersedes/Refines:** none (DC-3 as recommended); mirrors the SC1 golden pattern

## Context

SC5's runtime (skills + scripts + probes on a new toolchain) cannot be CI-gated cheaply, but the property
that *enables* it — the engine resolver never bakes in a language-specific gate command — can be. The
resolver already emits gate placeholders (`<gates.phase>`, `<validation gate>`) and defers command
resolution to the repo-probing skill layer; SC1 covers this implicitly via the zero-manifest golden walk.
The question is whether SC5 leans on SC1 or makes the neutrality claim its own named guarantee.

## Options considered

1. **Add one explicit `SC5` scenario** asserting "no manifest, no `gates` block → resolver emits gate
   placeholders unchanged, language-free" — pro: makes resolver toolchain-neutrality a named, diffable
   guarantee at one test's cost / con: one more fixture + `EXPECTED_TESTS` bump. *(designer's
   recommendation)*
2. **Re-use SC1 as the anchor**; SC5 is doc-only + smoke — con: under-documents the SC5-specific claim;
   leans on SC1's intent rather than stating it.
3. **A broad SC5 fixture set mirroring S1–S9** — con: over-builds for a property SC1 already largely
   covers.

## Decision

Add **one explicit SC5 scenario** under `engine/test/fixtures/scenarios/SC5/`, asserted through the real
engine entry points like the rest of the suite, proving: with no manifest and no `gates` block, the
resolved gate decisions carry the gate **placeholders unchanged and language-free** — the resolver never
substitutes a JS (or any language) command and always defers to the repo-probing skill layer. Reconcile
`EXPECTED_TESTS` in `scripts/ci.sh` for the added case.

## Consequences

- The toolchain-neutrality of resolution becomes a standing, diffable CI guarantee, not an inference from
  SC1.
- The full-pipeline runtime fidelity stays a documented on-demand smoke (ADR-077/080), not CI-gated.
- G9 regression guard is unaffected: SC1 stays byte-identical; the SC5 case is additive.
