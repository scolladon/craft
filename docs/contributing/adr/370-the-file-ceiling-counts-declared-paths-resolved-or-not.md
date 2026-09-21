---
subjects:
  - engine/src/plan-lint-main.js
---
# 370 — The file ceiling counts declared paths, resolved or not

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-306

## Context

The ceiling counts the files a part declares in its Context block. The existing
`declaredFiles` resolves each backticked span with a stat call and keeps only existing
regular files — correct for the overlap check, which compares parts against the tree as it
stands. For a ceiling it is wrong in the one case that matters most.

## Options considered

1. **Reuse `declaredFiles` unchanged** — cons: a part that creates eight new modules counts
   zero, which is the exact oversized part the ceiling exists to split; the check would be
   dead on greenfield work.
2. **Any path-shaped span, resolved or not** — cons: misses an existing file declared as a bare
   basename, and counts prose that happens to contain a slash.
3. **The union of the two** (recommended) — pros: catches the greenfield case without losing
   the bare-basename case / cons: one more predicate to maintain.

## Decision

The ceiling counts the union of spans that resolve to an existing regular file and spans that
are path-shaped but unresolved. `overlapWarnings` keeps using the resolved set only, so the
advisory overlap posture is untouched.

## Consequences

- The ceiling fires on new-file parts, which is where oversized parts most often come from.
- A part may be split on the strength of paths that do not exist yet; that is intended, since
  the plan is written before the files are.
- The path-shape predicate is a heuristic and will occasionally miscount; it fails toward
  counting, which errs toward splitting.
