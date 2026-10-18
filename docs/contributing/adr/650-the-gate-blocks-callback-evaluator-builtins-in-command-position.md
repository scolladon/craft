---
subjects:
  - engine/src/guards/git-plain-command-gate.js
supersedes: []
---
# 650 — The gate blocks callback evaluator builtins in command position

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/copilot-guard-differential-fuzz-arm.md · **Supersedes/Refines:** none

## Context

`mapfile -C`, `readarray -C` and `compgen -C` evaluate a callback string as shell. `compgen -C 'git push' x` ran git push on /bin/bash 3.2 (3/3) while `copilotGuard` allowed it; `mapfile`/`readarray -tc1 -C` do the same on bash 5. Builtins cannot run behind an external wrapper (`caffeinate mapfile` exits 127).

## Options considered

1. **Add the three words to WRAPPER_WORDS** (command position, like `trap`) (recommended) — three strings / cons: none found.
2. **Add them to SHELL_OR_EVALUATOR_WORDS** (any position) / cons: false blocks such as `git grep mapfile`.
3. **Flag-aware `-C` rule** / cons: needs option tokenising (clustered, attached, long forms), the work the gate exists to avoid.

## Decision

Adopted as recommended: `mapfile`, `readarray` and `compgen` join WRAPPER_WORDS, so they deny in command position when the command mentions git.

## Consequences

`git log | grep mapfile` and `git grep mapfile` still pass. Any use of those builtins in a git-mentioning command is an intended false block (`evaluator-word`).
