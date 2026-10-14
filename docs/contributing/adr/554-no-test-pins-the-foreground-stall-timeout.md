---
subjects:
  - test/hooks.test.js
---
# 554 — No test pins the foreground-stall timeout

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/claude-hook-foreground-stall-probe.md · **Supersedes/Refines:** none

## Context

This change is prose only. What matters, Claude Code ignoring the hook after the deadline, only a paid live run can show.

## Options considered

1. **No new test** *(recommended)* — same shape and reason as ADR-549.
2. **A hook test that TERMs the hook's process tree while `cat` blocks on stdin and asserts exit 2** — pins a real hook-side fact, but its outcome is the deny Claude Code ignores, and it adds a process-tree walk to the suite.
3. **A wording test on the header and `gate.md`** — cons: breaks on any rephrase, proves nothing about Claude Code.

## Decision

Adopted-as-recommended (no user judgment): option 1, aligned with ADR-549.

## Consequences

The live record in the design doc holds the behaviour. The existing TERM and HUP tests keep pinning the hook's own side.
