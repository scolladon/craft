---
subjects:
  - engine/src/guards/shell-git-invocations.js
  - engine/src/guards/git-ext-diff-predicate.js
  - engine/src/guards/git-destructive-predicate.js
supersedes:
  - adr: "581"
    scope: "an indeterminate invocation is judged by verb sniffing"
---
# 593 — A dynamic word at git's option or subcommand position is blocked

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md · **Supersedes/Refines:** supersedes ADR-581 (indeterminate only)

## Context

ADR-581 judged an `indeterminate` invocation (a dynamic word where git expects an option or the
subcommand) by sniffing the remaining words for a verb. The differential fuzz against bash showed
that a verb carried by the variable is invisible to that sniff: under `/bin/bash` with a stub git,
`P=push; git $P HEAD` runs `git push HEAD` and `D=diff; git $D HEAD` runs `git diff HEAD`, while
both predicates allowed them. A patch for the case with no literal word after the dynamic one
(`git $P`) left every `git $P <literal>` spelling open.

## Options considered

1. **Block every indeterminate invocation in both predicates** *(recommended)* — destructive
   always; ext-diff unless a `--no-ext-diff` word is present / pros: fail-closed, uniform / cons:
   `git $OPTS status` and `git $X log` false-block on every binding sharing the ext-diff predicate.
2. **Block in the destructive predicate only** — cons: `git $D HEAD` stays an ext-diff residual.
3. **Keep verb sniffing and document the residual** — cons: a proven bypass left open.

## Decision

**Ratified by the user.** Option 1. An `indeterminate` invocation blocks in the destructive
predicate unconditionally, and in the ext-diff predicate unless one of its remaining words is
`--no-ext-diff`. The `subcommandHidden` refinement is no longer needed and is removed.

Superseded from ADR-581: verb sniffing of `indeterminate` invocations.

Carried forward from ADR-581: a `refused` invocation (an option git itself rejects) is still judged
by verb sniffing — the destructive predicate blocks when a remaining word is `push`, `reset`,
`clean` or `branch`, and the ext-diff predicate allows.

## Consequences

The intended false blocks gain one class (a dynamic word at git's option or subcommand position),
pinned in tests and the differential fuzz census, and documented with the others.
