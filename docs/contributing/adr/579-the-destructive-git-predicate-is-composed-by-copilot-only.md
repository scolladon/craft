---
subjects:
  - engine/src/guards/git-destructive-predicate.js
  - adapters/copilot/src/git-guard-adapter.js
supersedes: []
---
# 579 — The destructive-git predicate is composed by copilot only

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

The new `gitDestructivePredicate` lives in the shared guard family. Pi, cursor and antigravity have
no destructive-git rule today; codex forbids `push`/`clean`/`reset` through a bypassable
`.rules` prefix layer. Craft's `push` policy action is user-configurable.

## Options considered

1. **A separate export composed only by the copilot adapter** *(recommended)* — pros: in the
   brief's scope, no behaviour change for other bindings / cons: codex keeps its disclosed bypass.
2. **Copilot and codex** — pros: closes codex's `git -C . push` bypass / cons: a separate change.
3. **Inside `toolCallGuard` for every binding** — cons: changes four bindings' behaviour unasked.

## Decision

**Ratified by the user.** Option 1. `gitDestructivePredicate` is a separate export in
`engine/src/guards/`; `toolCallGuard` does not call it. The copilot adapter composes it ahead of
`toolCallGuard` and returns the first block.

## Consequences

Composing it into the codex hook is an out-of-scope follow-up.
