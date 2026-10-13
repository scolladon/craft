---
subjects:
  - hooks/git-no-ext-diff.sh
  - test/hooks.test.js
supersedes:
  - adr: "536"
    scope: "grep is fed by a here-string"
---
# 542 — The git hook matcher allows only on a printed zero count

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md · **Supersedes/Refines:** supersedes ADR-536

## Context

ADR-536 fed grep through a here-string. Bash 3.2 backs every here-string with a temp file (bash 5 does for one past the pipe buffer). When no candidate directory is writable, the redirection fails with status 1 before grep runs, the same status as grep's no-match, so a plain `git diff` was allowed (reproduced under `sandbox-exec`; the pipe on main still denied there).

## Options considered

1. **A pipe into `grep -c`; allow only when grep exits 1 AND printed a count of `0`** *(recommended)* — `grep -c` reads to EOF, so the writer never takes SIGPIPE; a feed that failed before grep ran prints no count
2. **Process substitution `< <(printf …)`** — cons: a failed redirection still yields status 1 with no positive no-match signal

## Decision

Adopted-as-recommended (no user judgment): option 1. It keeps ADR-536's ratified intent, only a real no-match allows, and replaces only the feed mechanism the review disproved.

Superseded from ADR-536: feeding grep through a here-string.

Carried forward from ADR-536: only grep's no-match allows; any other matcher status is a crash the EXIT trap denies; a matching command past the pipe buffer is denied like a short one; the regex text is byte-identical.

## Consequences

The matcher needs no temp file. A darwin-gated `sandbox-exec` test pins the no-writable-temp case; Linux CI skips it with a reason.
