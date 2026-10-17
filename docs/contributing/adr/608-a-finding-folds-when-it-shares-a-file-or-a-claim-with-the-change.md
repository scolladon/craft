---
subjects:
  - skills/documentation/SKILL.md
supersedes: []
---
# 608 — A finding folds when it shares a file or a claim with the change

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/fold-in-scope-followups.md · **Supersedes/Refines:** none

## Context

The documentation phase's synthesis authors a backlog entry for every finding a run surfaces, without first asking whether the finding belongs to the change being shipped. The backlog gains a run-scoped section per run. Two cases bound the rule: a finding in a file the change edited (the copilot false-block list, PR #71), and a stale statement in a file the change did not touch that contradicts what it corrected (ADR-253, PR #68).

## Options considered

1. **Same files** — the finding's locus is in the PR's diff — pros: mechanical / cons: misses a contradicting statement in an untouched file.
2. **Same claim or behaviour, capped at one file outside the diff** — pros: catches the ADR-253 class / cons: "claim" left undefined decides the PR #71 case either way.
3. **Same files, or same claim capped at one file outside the diff, with "claim" defined** *(recommended)* — pros: folds both motivating cases, keeps the cap / cons: one definition to apply.

## Decision

Option 3. A finding is in scope when its locus file is in `git diff --name-only <base>...HEAD`, or when it concerns a claim or behaviour the diff edits, or a statement that contradicts what the diff now makes true, in at most one file outside the diff. The run's own artifacts (design, plan, ADR docs, `BACKLOG.md`) are in the diff. A finding the brief or design lists as out of scope is never folded. An in-scope finding whose fix needs a new decision goes to the user through the blocker protocol, never folded or filed silently.

## Consequences

The PR #71 copilot README finding folds by the files arm. The ADR-253 finding is in scope but superseding an ADR is a decision, so it routes to the user. Every filed entry carries a `Not folded: ` reason.
