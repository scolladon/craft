# 068 — Model-class matrix: deterministic R10 guard (CI-gated) + live cross-tier matrix (on-demand)

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P13-nfr-hardening.md · **Supersedes/Refines:** none (DC-7 as recommended); pairs with ADR-065

## Context

SP5 pinned the portability floor with 12 isolated contract-adherence probes (class = Haiku-4.5 and
up); PRD §12 asks P13 for the "full-pipeline + output-quality matrix" on top. Risk R10: structured
output **shape** varies by model (Haiku emitted review findings as JSON, not one-per-line). The
deterministic scenario set asserts resolution + gate decisions, never LLM prose (§13). A real
cross-tier quality run is non-deterministic and costs tokens, so it cannot be a CI gate.

## Options considered

1. **Resolution-layer only** — con: adds nothing over the existing scenario suite.
2. **Live full-pipeline only** — con: non-deterministic, can't CI-gate, no deterministic teeth.
3. **Deterministic contract-assembly guard + live matrix as documented procedure (chosen)** — pro:
   CI-gateable R10 discharge AND honest full-fidelity numbers / con: largest footprint.

## Decision

Two halves. **Deterministic (CI-gated):** assert that the assembled contract block and
`normalizeFindings` are **shape-stable across the documented model pins** — the R10 discharge —
asserting only format-independent signals (resolution/gate layer + the already-shape-robust
`normalizeFindings`, which canonicalizes both the one-per-line and JSON shapes). This is the green
gate for SC6's model-class clause; no live spend. **Live (on-demand, not CI-gated):** a documented
procedure that runs the full pipeline across the class — opus (`claude-opus-4-8`), sonnet
(`claude-sonnet-4-6`), haiku (`claude-haiku-4-5-20251001`) — recording a tier×dimension
PASS/PARTIAL/FAIL matrix **and** the harness-surfaced per-phase tokens + wall-clock (ADR-065) into a
committed artifact. It follows the existing `skills/run/SKILL.md` "inline-fidelity check — not
CI-gated" precedent: result lands in the run record, never blocks a push.

## Consequences

- The live matrix is the single place the dropped telemetry's "provide it if he cares" numbers
  (ADR-065) become durable — tokens/wall-clock land in its committed artifact.
- The deterministic guard is ordinary `node --test` coverage → `EXPECTED_TESTS` bumps with it.
- No always-on live spend; the matrix is refreshed by a maintainer on demand, and its artifact is
  diffable across runs (the "tracked over time" reading without a metrics service).
- The class is the Claude tiers only; cross-*provider* portability stays G13/P16.
