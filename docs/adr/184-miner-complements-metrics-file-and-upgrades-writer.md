# 184 — Miner complements craft-metrics.md; the writer upgrades cache=na to the split

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/usage-telemetry-miner.md

## Context

The orchestrator appends one line per spawned phase to `.claude/craft-metrics.md`
(ADR-119): `<run-id> <phase-id> tokens=… duration_ms=… cache=<hit|miss>`. The miner
proves this file is a lossy projection — its `cache` field collapses a read/creation
split that the transcript records in full. The question is whether the miner supersedes
the append file or complements it, and whether the lossy field is upgraded now.

## Options considered

1. **Complement + upgrade the writer this run** — keep the cheap per-run append file as
   a diffable live breadcrumb; the miner is the offline deep read. Upgrade the writer so
   the lossy `cache=na`/`cache=<hit|miss>` field carries the real read/creation split.
   **(recommended)**
2. **Complement, defer the writer fix** — same relationship, writer upgrade split to a
   follow-up. Cons: leaves a known-lossy field in place for no reason once the split is
   reachable.
3. **Supersede** — miner replaces the append file. Cons: couples every run to a full
   transcript scan; loses the cheap breadcrumb.

## Decision

The miner **complements** `.claude/craft-metrics.md` (cheap append = live breadcrumb;
miner = offline deep read), and the writer is **upgraded this run** to record the
read/creation split instead of `cache=na`. The split's data source is settled in
planning: the live `Agent` `<usage>` block returned to the orchestrator exposes only
`subagent_tokens`, so the writer recovers the split by parsing the run's own
spawn-rollup lines through the same `telemetry-claude` line parser the miner uses —
reusing the ADR-182 binding rather than instrumenting anew. If the split is genuinely
unavailable for a given spawn, the field degrades to `cache=na` (advisory, never a
crash).

## Consequences

The metrics-file line format gains explicit `cache_read=`/`cache_creation=` fields. The
ADR-119 "Metrics artifact" writer step is touched this run (a cross-phase scope addition
the planning phase must carry as its own part). The `telemetry-claude` parser earns a
second consumer, validating the port boundary. The miner remains the source of truth for
deep analysis; the append file stays cheap.
