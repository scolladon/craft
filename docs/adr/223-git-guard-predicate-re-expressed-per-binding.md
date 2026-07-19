# 223 — the git-guard predicate is re-expressed per binding (not shared)

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** none

## Context

`GIT_DIFF_SHOW_RE` already exists in the Claude bash hook (`hooks/git-no-ext-diff.sh`) and pi's `adapters/pi/src/gate.js`. The opencode plugin needs the same matching logic.

## Options considered

1. **Re-express the predicate in `adapters/opencode/src/git-guard-predicate.js` + a `node --test` matching the bash behaviour (pi precedent)** *(designer recommendation)* — pros: matches how pi handled it; the `.ts` plugin imports the `.js` predicate so it's single-sourced within the binding and node-testable. Cons: the regex lives in three bindings.
2. **Extract a shared predicate module all three bindings import** — cons: needs a new owning home (engine or a new package) → scope creep.
3. **Generate the plugin from the bash script** — cons: build-step complexity.

## Decision

*Adopted-as-recommended (no user judgment).* Re-express `GIT_DIFF_SHOW_RE` + `COMPLIANT_MARKERS` in a pure `adapters/opencode/src/git-guard-predicate.js`, unit-tested to match the bash behaviour, imported by the `.ts` plugin.

## Consequences

- Matches the pi precedent; the predicate is single-sourced *within* the opencode binding and covered by `node --test`.
- A shared cross-binding predicate module remains a possible future consolidation (not built now).
- The behaviour-match test pins the opencode predicate to the bash/pi matrix so the three bindings stay equivalent.
