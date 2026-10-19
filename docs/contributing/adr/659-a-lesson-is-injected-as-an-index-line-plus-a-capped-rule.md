---
subjects:
  - engine/src/lesson.js
  - engine/src/intention.js
  - skills/run/SKILL.md
supersedes: []
---
# 659 — A lesson is injected as an index line plus a capped rule

- **Status:** accepted
- **Date:** 2026-10-19
- **Design:** docs/contributing/design/lessons-corpus.md · **Supersedes/Refines:** refines ADR-657

## Context

Every matched lesson costs slot-1 tokens at every phase whose `phases` list names it. The design rendered title, path and the How-to-apply section up to 20 lines, about 900 tokens per phase at the default budget of 3.

## Options considered

1. **Index line plus How to apply capped at 6 non-empty lines** — pros: about 250 tokens per phase; the actionable rule stays inline, so an agent that never opens the file still gets it / cons: a lesson must state its rule in 6 lines.
2. **Keep the 20-line cap** — pros: room for longer examples / cons: about 900 tokens per phase.
3. **Index line only** — pros: about 75 tokens per phase / cons: relies on agents opening the file, which spawned agents do not reliably do.

## Decision

The user chose option 1. Disclosure is layered: the frontmatter is read by the engine to filter and rank and is never injected; each injected lesson renders one index line, `- <title> — when <trigger> → <path>`, followed by its How-to-apply section verbatim; the Context, Lesson and Evidence sections are read from the file on demand. `lesson-lint` fails a How-to-apply section longer than 6 non-empty lines.

## Consequences

A lesson whose rule needs more than 6 lines splits its rule from its worked example: the rule stays in How to apply, the example moves to Lesson or Evidence.
