# 289 — migration parts: one green part per moved tree, fence lands last

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** ../design/docs-audience-split.md · **Supersedes/Refines:** none

## Context

The migration spans ~400 file moves plus a literal sweep across scripts, tests, skills,
adapters, and examples. Craft's gating requires every commit green — never commit on red.
Guards reference the tree being moved, so moves and their guard updates cannot be split
across commits.

## Options considered

1. **One part per moved tree — `git mv` + that tree's load-bearing sweep + its guard
   update in one green commit; top-level allowlist fence activated in a final part**
   *(recommended)* — pros: reviewable diffs, independently green parts / cons: shared
   files edited incrementally across parts.
2. **Single atomic commit** — pros: one consistent state / cons: unreviewable mega-diff.
3. **Moves-first commit, then sweep commit** — pros: mechanical separation / cons: red
   between the commits (guards point at moved files) — violates never-commit-on-red.

## Decision

Adopted-as-recommended (no user judgment; restates craft's per-part gating invariant for
this migration). Each part moves one tree with everything that keeps the suite green;
the audience-split fence (ADR-286) activates only once the top level is clean.

## Consequences

Shared files (`living-corpus.sh`, `docs-structure-lint.sh`, `README.md`, `ci.sh` excuse
globs) are touched by several parts but consistent-with-disk at every boundary. Part
ordering must leave `manifest-lint` green: the `paths:` block lands with (or after) the
part that moves `DOD.md`, since `paths.dod` is file-checked.
