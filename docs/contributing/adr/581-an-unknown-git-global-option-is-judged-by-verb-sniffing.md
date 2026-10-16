---
subjects:
  - engine/src/guards/shell-git-invocations.js
  - engine/src/guards/git-ext-diff-predicate.js
  - engine/src/guards/git-destructive-predicate.js
supersedes: []
---
# 581 — An unknown git global option is judged by verb sniffing

- **Status:** superseded by ADR-593
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

> **Superseded by ADR-593** for `indeterminate` invocations only: verb sniffing cannot see a verb
> carried by the variable (`P=push; git $P HEAD`), so every indeterminate invocation now blocks. The
> `refused` rule below stands.

## Context

The normaliser strips the global options git 2.54 accepts (value-taking and flag) with their
values. Git refuses an option outside that table (`--frobnicate`, `-C.`, `--`,
`--super-prefix=`) and runs nothing. A future git may accept an option the table lacks.

## Options considered

1. **Verb sniffing** *(recommended)* — the normaliser returns `refused`; the destructive predicate
   blocks when any remaining word is `push`, `reset`, `clean` or `branch`; the ext-diff predicate
   allows / pros: fail-closed against a future option, keeps the PASS `git --no-ext-diff show` /
   cons: two predicates treat the kind differently.
2. **Refuse outright** — block in both predicates / cons: false blocks on a new git option until the
   table is updated.
3. **Allow** — cons: a future git that accepts the option becomes a bypass.

## Decision

**Ratified by the user.** Option 1. Same rule for `indeterminate` (a dynamic word where git expects
an option or the subcommand): destructive blocks when the remaining words hold a destructive verb;
ext-diff blocks when they hold `diff`/`show` without `--no-ext-diff`.

## Consequences

The option table is a pinned fact of git 2.54 and is checked against real git by the differential
test's normaliser leg.
