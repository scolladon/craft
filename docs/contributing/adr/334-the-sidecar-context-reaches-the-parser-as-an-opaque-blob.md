# 334 — The sidecar context reaches the parser as an opaque blob

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

Under ADR-328 the label comes from a sidecar file, but `parseLines` receives a line stream and
has no way to reach a sibling file. Something must carry the sidecar-derived context from
discovery to parse. The port widens by one argument either way; the real question is who
authors that argument.

## Options considered

1. **Widen to `parseLines(lines, since, context)`, front door builds the context** — pros:
   adapter stays a pure line parser / cons: drags `agentType`, `spawnDepth`, and the sidecar
   filename convention into the shared front door.
2. **Same signature, the adapter's `discover` builds the context** (designer's recommendation) —
   pros: sidecar parsing, field names, and fallback policy stay inside the claude adapter; the
   front door's contract is source-agnostic ("carry this opaque value") / cons: none material.
3. **Prepend the sidecar as a synthetic first line** — pros: no signature change / cons: corrupts
   the stream's meaning and trips the malformed-line counter in every other reader.

## Decision

**Adopted as recommended (no user judgment)** — option 2 follows the same
binding-owns-its-specifics principle as ADR-333. The third argument is optional; the other five
adapters are unchanged.

## Consequences

- The front door never inspects the context value, so adding a future source needs no front-door
  change.
- `parseLines`' third parameter is optional, preserving every existing call site.
