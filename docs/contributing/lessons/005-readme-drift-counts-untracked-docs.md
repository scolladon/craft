---
subjects:
  - docs/contributing/adr/*.md
  - docs/contributing/design/*.md
  - docs/contributing/plan/*.md
  - docs/contributing/lessons/*.md
  - README.md
phases: [decisions, design, planning, lessons]
kind: trap
trigger: committing one of several new corpus docs while the others sit untracked in the tree
evidence:
  - engine/src/readme-drift-main.js:121
source: { run: guard-fuzz-scale-ext-diff-widen, phase: decisions, date: 2026-10-20 }
status: active
supersedes: []
last-verified: 2026-10-21
---
# 005 — The README corpus count reads the files on disk, not the index

## Context

Two ADRs were written before either was committed. The first commit bumped the README ADR count by one, and ci.sh failed in `readme-drift-main.test.js`: the drift guard counted the second, untracked ADR too.

## Lesson

The corpus-count guard lists the directory with `readdirSync`, so it sees every file in the working tree, tracked or not. A commit that bumps the count by one while another new doc sits untracked fails the gate.

## How to apply

- Write and commit corpus docs one at a time, each with its own README bump.
- Or bump the count for every doc on disk and commit them together.
- When a gate reads the tree, keep drafts that are not in the commit outside the tree.

## Evidence

`engine/src/readme-drift-main.js:121` counts with `readdirSync(join(root, dir))`, so an untracked `docs/contributing/adr/*.md` changes the expected count.
