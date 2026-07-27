# 295 — Slack poll timeout falls back to the in-session conversation

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/decisions-remote-slack-example.md · **Supersedes/Refines:** none

## Context

The decisions-remote recipe routes fork conversations to Slack with a bounded poll wait.
Something must define what the session does when that wait elapses with no human reply —
the recipe cannot leave the run hanging on an unanswered channel.

## Options considered

1. **Fall back to the normal in-session conversation, loudly** *(recommended)* — pros: mirrors
   the missing-env-var degradation rule, honors never-spin, a present human can still finish
   in-terminal / cons: assumes a terminal user may exist.
2. **Record a blocker and stop** — pros: explicit halt / cons: stalls a run a present human
   could finish; under a headless binding option 1 degrades to exactly this anyway.
3. **Keep polling indefinitely** — pros: none material / cons: violates never-spin outright.

## Decision

**Adopted-as-recommended (no user judgment).** On poll timeout the session announces the
fallback loudly in the run record and conducts the fork conversation the normal in-session
way. Under a headless binding, where no in-session conversation is possible, this degrades
to the recorded-blocker path — option 2 is subsumed, never separately configured.

## Consequences

The recipe degrades instead of hanging; the run record always shows which channel actually
produced the decision. The escalation context file must state the bounded wait and the
fallback in the same breath.
