---
subjects:
  - engine/bin/metrics-emit.js
  - engine/src/observability/adapters/claude/discovery.js
---
# 371 — The metrics emitter identifies transcripts by stamped phase and a since-window

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-119

## Context

The emitter has to decide which sub-agent transcripts belong to which phase. The prose
procedure it replaces did this by having the session match a spawn's tool-use id against a
sidecar by hand — the same "the session reads a field correctly" assumption that produced the
11 false zeros.

## Options considered

1. **The orchestrator passes the spawn's tool-use id; the bin matches it against sidecars** —
   pros: most precise / cons: reintroduces the hand-read assumption that is being removed.
2. **The bin groups parsed events by the `phase` the parser already stamps, narrowed by an
   optional since-window** (recommended) — pros: uses a mapping the adapter already owns and
   aggregates a fan-out phase's parallel spawns correctly / cons: needs the window to stay
   honest across re-runs.
3. **A window alone, every transcript in it** — cons: drops the role mapping and mis-attributes
   any spawn overlapping the window.

## Decision

The emitter groups by the stamped `phase` and narrows by an optional `--since` passed at phase
entry. The window is not decoration: one session directory can hold two spawns of the same
phase — the ledger already carries a revision row for one — and the agent type alone cannot
tell them apart, so without a window the second row would re-count the first. An absent
`--since` means "every transcript for this phase", which is the correct reading for a phase
that ran once.

Recorded as **adopted-as-recommended (no user judgment)**: option 1 reinstates the defect under
repair and option 3 is strictly worse than option 2.

## Consequences

- A review round that fans out several reviewers aggregates into one row per phase.
- A re-run phase needs the orchestrator to pass `--since`, or its row double-counts; that
  obligation belongs in the run skill's Done section.
- Phase attribution now depends entirely on the parser stamping `phase` correctly, which
  becomes a load-bearing property worth its own test.
