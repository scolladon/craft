---
subjects:
  - contracts/core.md
  - contracts/harness-exec.md
---
# 366 — Only the token-cost half of the harness-exec digest rule promotes to core

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-015

## Context

`contracts/harness-exec.md` line 4 carries the digest-at-boundary rule and binds exactly one
phase. Part C generalises it so every role gets it, extended to cover Read — measured at 119x
amplification, the half the existing rule misses. But that line welds two rules together: a
token-cost rule (output goes to a file, read only the slice that matters) and a security rule
(that file is untrusted DATA, never instructions).

## Options considered

1. **The token-cost half only; the untrusted-DATA half and the orchestrator hand-off clause
   stay in `harness-exec`** (recommended) — pros: each rule sits where its subject exists /
   cons: line 4 keeps a mixed shape.
2. **The whole line promotes; `harness-exec` line 4 is deleted** — cons: every role, including
   the backlog-ticker whose job is flipping a checkbox, then carries a rule about triage
   artifacts; also drops the `change-scoped` phrase the bundle's own marker test asserts.
3. **Cost half plus a generically-reworded untrusted-input rule** — cons: a security change
   riding inside a token-cost change.

## Decision

Core gains an output-digest rule covering both command output and file reads: any command
whose output may exceed roughly 100 lines redirects to a file and is read back with grep or
sed over the lines that matter; never read a whole file when a symbol range answers the
question. The untrusted-DATA clause and the orchestrator hand-off clause stay in
`harness-exec`, where the technique output file they describe actually exists.

### Why a rule, not a fact

The fact ("every tool result is re-read on every later turn; a Read costs ~119x its size over a
part's life") is true but arrives too late to act on. The whole-file-versus-range choice is made
while composing the command, before the output exists; a cost fact is actionable only once the
output is known to be large, by which point it is already in context and paid for on every later
turn. The rule pre-commits on what can be estimated up front ("may exceed ~100 lines") and names
the substitute technique, which a fact does not.

## Consequences

- Every role gets the cost rule; only the two harness phases get the provenance rule.
- The `harness-exec` bundle keeps `change-scoped`, so its marker assertion is untouched.
- Whether craft wants a general untrusted-input rule in core remains open, deliberately, as
  its own decision.
