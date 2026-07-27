# 208 — Single-source the living-corpus enumeration behind `scripts/living-corpus.sh`

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/harness-hygiene-prune-gates.md
- **Scope:** workstream A2

## Context

The living-corpus file set is enumerated twice — `scripts/ci.sh` `run_intention_lint`
(bash `find`) and `test/intention-lint-ci.test.js` `enumerateCorpus` (JS `readdirSync`).
The two must stay in lockstep; today they agree on a 17-entry set but differ in sort
collation (locale order vs UTF-16 code units), a latent drift.

## Options considered

1. **A shared `scripts/living-corpus.sh` emitting the sorted path list** (recommended) —
   pros: one executable SoT both consumers call; deletes the duplicated globs / cons: the
   JS test must shell out.
2. **A test asserting the two sets match** — pros: no new script / cons: keeps two
   enumerators, only detects drift after the fact.

## Decision

`scripts/living-corpus.sh` emits the corpus as newline-separated repo-relative paths,
sorted under `LC_ALL=C` for a deterministic, locale-independent order. `ci.sh` consumes it
in place of the inline `find`; the test execs it and splits. The zero-file hard-error
discipline moves into the shared script. **Ratified sub-choices: single-source shape =
shared script (A2-src); output order = `LC_ALL=C` repo-relative sort (A2-ord). Adopted as
recommended.**

## Consequences

Corpus membership changes in exactly one place. Both consumers inherit the same order,
closing the collation drift. A new living page is added by editing the script's globs once.
