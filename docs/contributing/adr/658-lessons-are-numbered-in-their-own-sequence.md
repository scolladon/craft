---
subjects:
  - engine/src/lesson-lint-main.js
  - skills/lessons/SKILL.md
supersedes: []
---
# 658 — Lessons are numbered in their own sequence

- **Status:** accepted
- **Date:** 2026-10-19
- **Design:** docs/contributing/design/lessons-corpus.md · **Supersedes/Refines:** none

## Context

Lessons are numbered files like ADRs. The numbers can share the ADR sequence or start their own.

## Options considered

1. **A separate sequence from 001 in the lessons directory** (designer's recommendation) — pros: each corpus allocates "highest in its own directory + 1"; lessons are cited by path, so `adr-lint`'s `ADR-NNN` sweep is untouched / cons: lesson 001 and ADR-001 coexist.
2. **One sequence shared with ADRs** — pros: globally unique numbers / cons: ADR allocation scans two directories, the ADR series gains gaps, and `lesson-lint` must read the ADR directory.

## Decision

The user chose option 1. Lessons are numbered `001`, `002`, … within the lessons directory, the next number being the highest existing lesson number + 1, and are cited by path, never as `ADR-NNN`.

## Consequences

`lesson-lint` checks number uniqueness within the lessons directory only. The ADR allocation rule is unchanged.
