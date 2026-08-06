# 335 — The transcript walk is a pinned two-level shape

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

The root cause of the under-report is a non-recursive `readdirSync`. The obvious fix — recurse —
overshoots: a `memory/` directory already sits in the projects root, and upstream may add more.
A generic walk would descend it and hand the parser files whose shape it has never seen,
producing counted skips indistinguishable from corruption.

## Options considered

1. **Pinned two-level shape** (designer's recommendation) — `<root>/*.jsonl` and
   `<root>/<dir>/subagents/agent-*.jsonl`, nothing else — pros: fail-closed; cannot wander /
   cons: an upstream layout change breaks discovery loudly.
2. **Generic bounded-depth recursive walk** — pros: survives layout changes / cons: descends
   `memory/` and anything future.
3. **Glob pattern from config** — pros: flexible / cons: makes the containment surface
   user-controlled.

## Decision

**Adopted as recommended (no user judgment)** — option 1, aligning with craft's standing
fail-closed principle. Pinned empirically: no nested directories exist inside any of the 19
`subagents/` dirs, and depth-2 sub-agents are flat siblings — so recursion buys nothing the
pinned shape does not already cover.

## Consequences

- An upstream layout change breaks discovery loudly rather than degrading silently, which is the
  preferred direction for an advisory signal that must never quietly under-report again.
- Files outside the two pinned shapes are never opened.
