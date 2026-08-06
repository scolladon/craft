# 333 — Transcript discovery lives in the claude adapter

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

The token truth lives in files the front door must discover, but the telemetry spec states
plainly that *"the adapter never receives an absolute path; the `readTranscripts` provider owns
the runtime path"*. File discovery and layout knowledge therefore pull in opposite directions:
the `<sessionId>/subagents/agent-*.jsonl` shape is pure claude knowledge, while paths,
containment, and I/O are front-door responsibilities.

## Options considered

1. **`SOURCE_DISCOVERY` lookup holding the walk inline in the front door** — pros: no new file /
   cons: puts claude-only layout knowledge next to five other sources that must not know it.
2. **The claude adapter exports `discover({ listDir, readText })`** (designer's recommendation) —
   pros: layout knowledge stays with the binding that owns every other claude runtime specific;
   front door stays sole path-holder and sole realpath-checker; unit-testable against fake ports
   with no filesystem / cons: costs one new file.
3. **Pass the adapter an absolute path** — pros: simplest / cons: violates the spec contract.

## Decision

**Adopted as recommended (no user judgment)** — option 2 aligns with the standing port contract
in `docs/contributing/specs/telemetry.md`. The adapter exports `discover({ listDir, readText })`
taking injected, front-door-owned ports; the front door retains every path, every
`containByRealpath` check, and all I/O.

## Consequences

- Containment reach extends to three levels deep; `containByRealpath` already permits this and
  already rejects traversal — verified live against the real root. No containment *change*, only
  extended reach.
- The walk is testable with fake `listDir`/`readText` ports, no filesystem fixtures.
