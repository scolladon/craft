# 065 — NFR metrics are harness-sourced; no engine telemetry, no subagent self-report

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P13-nfr-hardening.md · **Supersedes/Refines:** refines the design's DC-1 (reshapes the hybrid), overrides DC-2 / DC-3 / DC-6

## Context

The design framed P13's speed/token measurement as an engine-owned telemetry schema (a typed
`Resolution.telemetry` object, DC-2), a committed engine-speed baseline (DC-6), and a chosen
storage location (DC-3). But the resolution core is a pure function over data — it has no tokens
or wall-clock to model; an engine schema is a container the engine can never populate, so CI could
only assert an empty shape. Meanwhile the harness already returns exact per-spawn
`subagent_tokens` + `duration_ms` to the orchestrator at no cost (observed verbatim on the design
spawn: `subagent_tokens: 110282  duration_ms: 404605`). And asking subagents to self-report usage
is negative-value: models cannot reliably count their own tokens, and the request adds output plus
makes the worker reason about an orthogonal concern — spending tokens, and degrading the work, to
measure token-efficiency.

## Options considered

1. **Typed engine telemetry schema** (design's DC-2a) — pro: CI-assertable shape / con: the engine
   can't fill it; asserts an empty container; ceremony.
2. **Subagent self-report** — pro: nominally per-phase / con: inaccurate, adds output, distracts the
   worker; self-defeating for a token-efficiency metric.
3. **Harness-sourced, orchestrator-recorded (chosen)** — pro: exact, zero-cost, zero worker overhead /
   con: ephemeral unless the orchestrator chooses to record it.

## Decision

craft does **not** model speed/token telemetry in the engine, and **no phase agent reports its own
usage**. Per-phase tokens and wall-clock are read by the orchestrator from the harness usage block
the spawn already returns. "Tracked over time" means: the orchestrator records those numbers into
the run record, and into the live model-class matrix artifact (ADR-068) when that procedure runs —
on demand, not on every run. There is **no** typed engine telemetry object, **no** deterministic
engine-speed baseline (resolution-layer wall-clock is microseconds and bears no relation to live
`/craft:run` speed), and **no** persisted per-run telemetry file.

## Consequences

- Drops the design's DC-2 (engine schema), DC-3 (telemetry location), DC-6 (speed baseline), and the
  telemetry leg of DC-1. P13's deterministic floor is now bin mutation coverage (ADR-066/067) + the
  R10 shape-stability guard (ADR-068); the live half is the on-demand model-class matrix.
- No change to any agent contract (`contracts/`) — workers never learn about usage. Preserves the
  token-efficiency NFR instead of taxing it.
- If a future phase wants *enforced* per-phase budgets (vs tracked), that is a new decision; it would
  require the orchestrator (not the engine) to act on harness usage, and is out of P13 scope.
- SC6 ("speed/tokens tracked and met on the scenario set") is satisfied by the orchestrator recording
  harness numbers during the live matrix run, not by an engine feature.
