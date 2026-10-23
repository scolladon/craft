---
subjects:
  - engine/src/guards/shell-tokeniser.js
  - engine/test-helpers/git-differential-harness.js
  - engine/test/guards/shell-git-invocations.differential.test.js
supersedes: []
---
# 684 — A `;` after a heredoc in a substitution body fails closed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/bash53-heredoc-comsub-false-block.md · **Supersedes/Refines:** refines ADR-661

## Context

bash 5.3.20 drops the first `;` after a heredoc inside a `$( )`/`<( )` body, and inside its new
function substitution `${ …; }`/`${| …; }`, joining the two commands around it. At scale this gives a safe-direction false block (seed 101) and, off the
generator's grammar, a fail-open: `echo $( cat <<'E'⏎hi⏎E⏎git; push origin )` runs `git push origin`
on bash 5.3 while both guard predicates allow it. bash 3.2.57 keeps the `;`.

## Options considered

1. **Tag only** (`heredoc-list-in-substitution`, no guard change) — cons: leaves the proven fail-open
2. **Tag, plus the tokeniser fails closed on that `;`; the tag joins `PARSE_FAILURE_TAGS`** *(recommended)* — pros: closes the fail-open; follows the `ARITHMETIC_HEREDOC` refusal; the `"$(cat <<'EOF' … EOF⏎)"` commit idiom is untouched
3. **Tag, plus a second parse modelling bash 5.3's merged reading** — cons: must copy an irregular rewrite; any drift fails open

## Decision

Ratified by the user: option 2. Unlike ADR-661's entries, this one changes the guard, because the
construct's mirror does not block.

## Consequences

A command the tokeniser refuses is blocked on every shell, so on bash 3.2 or a 5.x without the
rewrite the tagged commands are blocked although they would be safe. The census exempts the tag
from the syntax and false-block checks like the other parse-failure tags.
