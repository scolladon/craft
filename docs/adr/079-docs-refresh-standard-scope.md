# 079 — Docs refresh: standard scope

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P15-second-instantiation.md · **Supersedes/Refines:** none (DC-4 as recommended)

## Context

P15 is the ship gate for the customizable-engine re-architecture, so the docs must read as a complete,
shipped engine and the zero-config promise must state its true precondition (ADR-076). The scope trades
truth-in-every-newcomer-doc against scope-creep at the ship gate.

## Options considered

1. **Standard** — README precondition fix + the SC5 record + BACKLOG flip + a GUIDE §1 "zero-config on a
   non-JS repo" note + a DESIGN-customizable-engine "second-instantiation done" flip — pro: tells the
   truth in every doc a newcomer reads without inventing a new doc this late / con: touches four docs +
   the record. *(designer's recommendation)*
2. **Minimal** — README + SC5 record + BACKLOG only — con: leaves the GUIDE and the living architecture
   doc silent on the non-JS story.
3. **Broad** — standard + a dedicated "running craft on your repo" onboarding page — con: P12-territory
   scope-creep at the ship gate; risks an unproven onboarding surface.

## Decision

The documentation phase refreshes the **standard** set:

- **README** — correct the zero-config-defaults line to add the test-command precondition (ADR-076) and
  the degradation behaviour (validation/architecture no-op without their JS tools; propose no-ops without
  a remote); state the SC5 result as shipped.
- **`docs/GUIDE-customizing.md` §1** — a short "zero-config on a non-JS repo" note pinning the degradation
  behaviour and the test-command precondition.
- **`docs/DESIGN-customizable-engine.md`** — flip the "second-instantiation" reference from pending to
  done, pointing at the SC5 record.
- **The SC5 validation-record doc** (ADR-080) — the proof artifact.
- **`BACKLOG.md`** — flip the P15 row to done-and-green with reference links, under the documentation-phase
  backlog guard.

## Consequences

- Every newcomer-facing doc (README, GUIDE, living DESIGN) states the non-JS zero-config story truthfully.
- No new onboarding/install page is created; craft stays headless/file-based (PRD N2).
- Docs are written only after SC5 is proven (the smoke + record exist) — the same gating discipline P12
  applied to Tier-2 docs (never advertise an unproven surface).
