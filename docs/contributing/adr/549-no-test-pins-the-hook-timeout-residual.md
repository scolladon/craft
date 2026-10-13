---
subjects:
  - test/hooks.test.js
---
# 549 — No test pins the hook-timeout residual

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-timeout-probe.md · **Supersedes/Refines:** none

## Context

This change is prose only. What matters, Claude Code ignoring the hook after the deadline, only a paid live run can show.

## Options considered

1. **No new test** *(recommended)* — a wording test proves nothing about Claude Code, and only a paid live run shows the behaviour. Same shape as ADR-544, though its reason (no fail-open proven) does not carry over.
2. **A test asserting the header and `gate.md` name the timeout** — cons: pins wording, proves nothing about Claude Code.
3. **A hook test that sends TERM while the hook waits on a background child** — cons: repeats the existing TERM test and cannot reach Claude Code's behaviour.

## Decision

Adopted-as-recommended (no user judgment): option 1.

## Consequences

The residual is held by the live record in the design doc. The existing TERM and HUP tests keep pinning the hook's own side.
