---
subjects:
  - hooks/git-no-ext-diff.sh
  - test/hooks.test.js
supersedes: []
---
# 536 — The git hook matcher allows only on grep's no-match status

- **Status:** superseded by ADR-542
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

> **Superseded by ADR-542** for the here-string feed: grep is now fed by a pipe into `grep -c`, and only exit 1 with a printed
> zero count allows, because a failed here-string redirection also returns 1.

## Context

`if ! printf '%s' "$CMD" | grep -qE "$GIT_RE"` reads any grep failure as no-match. Two proven fail-opens exit 0, so no EXIT trap sees them: grep missing (127 → allow), and a matching multi-line command of about 64 KiB or more, where `grep -q` exits on the first line, `printf` dies of SIGPIPE, pipefail reports 141 and `!` allows (3/3 at 70 kB and 200 kB; 60 kB still denied).

## Options considered

1. **Split grep's status (only 1 allows) and feed it a here-string** *(recommended)* — regex text byte-identical
2. **Leave both as out-of-scope lines** — cons: two proven fail-opens stay open
3. **Builtin `[[ =~ ]]` with the regex rewritten** — cons: macOS bash `=~` has no `\s`; equivalence must be re-proven across every fixture

## Decision

Ratified by the user: option 1. `grep -qE "$GIT_RE" <<<"$CMD" || match_status=$?`; status 0 continues to the JSON deny, status 1 allows, any other status `exit`s and the EXIT trap (ADR-533) denies. With no writer process, SIGPIPE cannot fire.

## Consequences

A large matching command is denied with its corrected command like a short one. A grep failure is a crash, not an allow. The regex and every clean-path output stay byte-identical.
