---
subjects:
  - hooks/git-no-ext-diff.sh
  - docs/contributing/specs/gate.md
---
# 547 — The hook-timeout residual gets its own sentence

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-timeout-probe.md · **Supersedes/Refines:** none

## Context

The hook header and `gate.md` list the residual under "no code here runs to catch it" (ADR-538 fixes where it is written). The timeout is the opposite case: the TERM trap runs and denies, and Claude Code ignores the deny.

## Options considered

1. **Its own sentence in the header and its own `On a timeout:` paragraph in `gate.md`** *(recommended)* — pros: states the real mechanism / cons: a few more lines.
2. **One more item in the existing residual list** — cons: puts it under a sentence that misstates the mechanism and invites a TERM-trap "fix", the route the probe ruled out.
3. **Delete the "unprobed" parenthetical only** — cons: operator docs silent on a proven fail-open.

## Decision

Adopted-as-recommended (no user judgment): option 1. The "unprobed" parenthetical is removed from the existing list, and the timeout gets its own sentence in the header and its own paragraph in `gate.md`: SIGTERM at the deadline, then the call runs whatever the hook exits with or prints.

## Consequences

The residual list keeps meaning "no code here runs". A reader looking for the timeout finds it stated apart from it.
