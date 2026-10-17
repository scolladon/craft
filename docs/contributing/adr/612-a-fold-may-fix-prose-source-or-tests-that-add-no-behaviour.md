---
subjects:
  - skills/documentation/SKILL.md
supersedes: []
---
# 612 — A fold may fix prose, source or tests that add no behaviour

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/fold-in-scope-followups.md · **Supersedes/Refines:** none

## Context

The documentation phase runs after review, beside a background executing-harness that has already taken its hunk list, and it has no gate of its own. The scope-expansion invariant re-enters review only from the construction and refinement archetypes.

## Options considered

1. **Prose and docs only** — cons: files even a one-line test retitle, which was the whole of PR #68.
2. **Prose plus source and test fixes that add no feature behaviour** *(recommended)* — pros: follows gate cadence / cons: a source fold sits outside the harness run.
3. **Option 2 plus behaviour-adding folds that re-enter review and the harness** — cons: a new cross-phase rule, too large for a fold.

## Decision

Option 2. The session makes each fold itself, one commit per fold with the conventional type of what it changes. A fold beyond prose commits only on a green `gates.part`. A fold that adds feature behaviour is filed. A fold that turns red is reverted and filed with `Not folded: the fix did not pass <gate>`. The PR trailer names any source fold as outside the executing-harness run.

## Consequences

The pre-propose gate still covers every fold. Extending the scope-expansion invariant to the delivery archetype stays out of scope.
