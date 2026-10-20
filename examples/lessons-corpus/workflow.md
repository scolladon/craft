---
# Injection point (WHERE + HOW): paths.lessons — the repo-relative directory holding the lessons
# corpus; lessons.max_injected — how many matching lessons a phase receives.
paths: { lessons: docs/lessons }
lessons: { max_injected: 3 }
---

# Example — lessons corpus (`paths.lessons`, `lessons.max_injected`)

A lesson is a short, evidence-backed note about a trap, technique, gotcha or anti-pattern
that a past run learned. The corpus lives in one directory of the repo; each phase receives
the few lessons whose subjects and phases match its work.

| Key | Meaning | Default |
|---|---|---|
| `paths.lessons` | repo-relative directory holding the lessons | `docs/lessons` |
| `lessons.max_injected` | most lessons injected into one phase | `3` |

## Turning it off

- `pipeline.skip: [lessons]` turns the harvest off: no lessons are proposed at the end of a run.
- `lessons.max_injected: 0` turns injection off: existing lessons stay on disk but no phase receives them.

## Validation

`paths.lessons` must be a non-empty repo-relative path with no leading `/` or `~` and no `..`
segment; the directory need not exist yet. `lessons.max_injected` must be a non-negative integer.
Any other `lessons` field is a manifest-lint error.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
