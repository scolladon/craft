# 182 — Telemetry is a new port, not an extension of Execution

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/usage-telemetry-miner.md

## Context

The usage-telemetry miner parses Claude Code transcript JSONL into an abstract
`UsageEvent[]` stream that a pure core aggregates into a report. The JSONL format and
the `~/.claude/projects` location are runtime specifics that must live behind an adapter
binding (post-P27 source hygiene), never in the engine core. The question is whether the
parse binding gets its own port or folds into the existing Execution port.

## Options considered

1. **New Telemetry port** — pure core (`engine/src/usage-aggregate.js`) consuming
   `UsageEvent[]`, a `claude` binding (`engine/src/telemetry-claude.js`) parsing JSONL,
   a reserved `pi` seam, and a `docs/adapters/telemetry.md` spec. Mirrors the
   Execution/Memory `{claude, pi}` pattern. Cons: one new doc/lint surface.
   **(recommended)**
2. **Extend the Execution port** — add a parse binding to Execution. Cons: Execution
   *runs* workers (spawn/runInline); telemetry *reads recorded exhaust* — opposite
   direction and lifecycle. Overloads a port whose concern is orthogonal.
3. **Plain modules, no port** — skip the abstraction. Cons: breaks the hexagonal
   convention the codebase follows; loses the `pi` seam.

## Decision

Telemetry is a **new port**. The pure core consumes a vendor-neutral `UsageEvent[]`
stream; the `claude` binding owns every runtime specific (JSONL field names, the
`~/.claude/projects` path, the cwd→dashes mapping, the spawn-rollup shape); the `pi`
seam is reserved (documented, not built). The port spec and the stable `report.json`
schema are documented in `docs/adapters/telemetry.md`. This keeps `test/source-hygiene`
green and the core toolchain-neutral and deterministic.

## Consequences

A new adapter doc surface (`docs/adapters/telemetry.md`) joins the source-hygiene and
live-doc lint targets. The core never imports a runtime name; swapping the runtime
later means only a new binding, never a core edit. The `pi` binding is a follow-up.
