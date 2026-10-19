---
subjects:
  - skills/lessons/SKILL.md
  - templates/pr-body.md
supersedes: []
---
# 656 — PR review and merge ratify lessons

- **Status:** accepted
- **Date:** 2026-10-19
- **Design:** docs/contributing/design/lessons-corpus.md · **Supersedes/Refines:** none

## Context

A drafted lesson becomes advice for every later run on its subjects, so a human should accept it. Drafts exist only late in a run, after `decisions` has already run.

## Options considered

1. **The PR review and merge is the ratification** (designer's recommendation) — pros: no new checkpoint; unattended runs stay unblocked; the drafts are in the diff and listed on a `LESSONS:` line / cons: under headless auto-merge nobody reads them before merge.
2. **A per-draft user checkpoint inside the harvest** — pros: explicit approval / cons: a third checkpoint that blocks unattended runs.
3. **Defer drafts to the next run's `decisions` phase** — pros: reuses the decisions checkpoint / cons: a lesson stays unratified for a whole run and needs a `draft` status.

## Decision

The user chose option 1. Lesson drafts land in the PR diff and the PR body lists them on a `Lessons` line carrying the `LESSONS:` or `NO-OP(lessons):` record; merging the PR ratifies them. No new checkpoint is added.

## Consequences

Under `integrate: always` a lesson can merge unread. That risk is bounded: lessons are advisory, linted and evidence-bound, so a weak lesson costs slot-1 space, never a gate.
