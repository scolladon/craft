# Lessons

A **lesson** is a short, evidence-bound note about a trap, technique, gotcha or anti-pattern that a past run learned. Lessons are advisory: they steer later phases, and they **never gate** one.

## File format

One markdown file per lesson, numbered `001`, `002`, … in its own sequence inside the lessons directory and cited by path. Start from [`templates/lesson.md`](../../templates/lesson.md); a worked example is [`001-stryker-repeated-mutate-flag-keeps-last.md`](../contributing/lessons/001-stryker-repeated-mutate-flag-keeps-last.md).

```
---
subjects: [<glob the lesson applies to>]
phases: [<phase id>]
kind: trap | technique | gotcha | anti-pattern
trigger: <one line - the situation in which the lesson applies>
evidence: [<repo-path>[:<line>[-<line>]]]
source: { run, phase, date }
status: active
supersedes: []
last-verified: <YYYY-MM-DD>
---
```

The body has four sections: Context, Lesson, How to apply, Evidence. **How to apply is at most 6 non-empty lines**: it is the part that gets injected. `lesson-lint` checks the format and fails a draft that breaks it.

## Where it lives

`paths.lessons`, default `docs/lessons/`. The directory need not exist yet.

## How lessons are harvested

The default-on `lessons` phase runs after `documentation` and before `propose`. It reads the run ledger for lesson-shaped events: a reset-on-red, a review finding that took more than one round, a harness finding triaged as a real defect, a decision deviation, a gate that failed for an environmental reason, or a lesson due for re-verification.

- **Evidence is mandatory.** A draft must name at least one repo path that exists at `HEAD` and reproduces the event (a red test, a `file:line`, a script). The ledger lives outside the repo and is never evidence; no path means no draft.
- **Dedupe.** A new event that matches an active lesson refreshes that lesson (new evidence, bumped `last-verified`) instead of adding a near-duplicate.
- **Lint.** Drafts go through `lesson-lint`; a draft that fails is fixed or dropped, never committed red.
- **Record.** The phase appends `LESSONS: <path> (new|refreshed|reverified|superseded|retired)` or `NO-OP(lessons): <reason>`, and copies it into the PR body.

Lessons are never deleted: they are re-verified, superseded or retired.

## Ratification

Drafts land in the PR diff and the PR body carries a `Lessons` line. Reviewing and merging the PR ratifies them; there is no extra checkpoint.

## How lessons reach later phases

Injection reads only the default branch, so a lesson takes effect for runs after its PR merges; drafts committed on the current branch are not injected into the current run.

At each phase entry, `consult` selects active lessons by **frontmatter filters only** (`subjects` against the touched paths, `phases` against the phase). It prepends them to the phase's slot-1 contract block, after memory and intention hints. Each lesson contributes an index line plus its How to apply section.

`lessons.max_injected` caps how many lessons one phase receives. It defaults to `3`, counted per phase.

## Turning it off

| Goal | Setting |
|---|---|
| stop harvesting | `pipeline.skip: [lessons]` (or `--skip lessons`) |
| stop injecting | `lessons.max_injected: 0` |
| move the corpus | `paths.lessons: <repo-relative dir>` |

`paths.lessons` must be a non-empty repo-relative path with no leading `/` or `~` and no `..` segment, and only `A-Z a-z 0-9 . _ / -` characters; `lessons.max_injected` must be a non-negative integer.

A runnable manifest is in [`examples/lessons-corpus/`](../../examples/lessons-corpus/). The port is listed in [customizing.md](customizing.md).
