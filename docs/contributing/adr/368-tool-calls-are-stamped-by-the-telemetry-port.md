---
subjects:
  - engine/src/observability/adapters/claude/telemetry.js
  - engine/src/observability/usage-aggregate.js
  - docs/contributing/specs/telemetry.md
---
# 368 — Tool calls are stamped by the telemetry port, not recounted by the bin

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-119

## Context

Part D's ledger row carries `tool_calls`, and Part B denominates its budget in tool calls
because an agent can observe those and cannot observe a billed turn. The count has to be
produced somewhere, and craft's observability layer is a ports-and-adapters boundary: the
adapter parses transcripts, the pure core aggregates and recommends.

## Options considered

1. **`parseLines` stamps `toolCalls` on every usage event; the spec's field whitelist and the
   per-phase turn tally grow with it** (recommended) — pros: the core can see it, so the
   recommendation has an input / cons: the port's event shape grows, obliging every binding
   to populate or omit the field.
2. **The emitter counts tool-use blocks itself, leaving the port untouched** — cons:
   duplicates transcript parsing in a second place and puts the count somewhere the aggregate
   cannot see, so the turn-budget recommendation has no input.

## Decision

`parseLines` stamps `toolCalls` on every emitted event, summed across the lines of a message
rather than folded — tool-use blocks are **partitioned** across a message's lines, unlike the
usage block, which folds last-wins by message id. Other bindings either populate the field or
omit it, the same treatment `spawnId` already receives.

## Consequences

- The aggregate can emit a `turn-budget` recommendation without a second parser.
- The telemetry spec's field whitelist grows by one, and each non-Claude binding must state
  whether it can supply the field.
- Summing and folding now coexist in one parser over one message; getting them backwards
  over-reads cache figures by roughly 2x, so the distinction needs a test that pins it.
