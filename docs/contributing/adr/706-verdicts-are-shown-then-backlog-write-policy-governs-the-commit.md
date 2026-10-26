---
subjects:
  - skills/impact-triage/SKILL.md
supersedes: []
---
# 706 — Verdicts are shown, then backlog-write policy governs the commit

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** none

## Context

The user sees the triage verdicts before the BACKLOG commit. An unconditional ask blocks every driven run that deferred anything; a new policy action defaulting to ask breaks ADR-127.

## Options considered

1. **Print the verdict table, then consult the existing `backlog-write` action** *(recommended)* — pros: no new knob, the commit is local and `propose` shows the trailer before anything leaves / cons: with the default `always`, the commit proceeds without waiting
2. **Always ask, verdicts flippable** — cons: blocks headless runs
3. **A new `backlog-file` policy action** — cons: an `ask` default breaks ADR-127

## Decision

Ratified by the user: option 1. The session prints the table (id, verdict, title, rationale) before the `backlog-write` consult. A user who wants a hard stop sets `policy: { backlog-write: ask }`. The verdicts are listed in the PR body trailer `- **Discovered impacts:**`.

## Consequences

No policy vocabulary change.
