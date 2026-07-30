# 305 — The filter's scope spec is one comma-joined file:range string

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

The filter needs the change's line ranges. The repo already has a per-hunk scope convention,
documented in its own manifest, including the foot-gun that repeated flags silently drop all
but the last.

## Options considered

1. **One comma-joined `<file>:<start>-<end>` string argument** *(recommended)* — pros: symmetric with the documented per-hunk form; one argument, so the repeated-flag foot-gun cannot recur / cons: very large scopes make a long argument.
2. **A JSON ranges file passed by path** — pros: scales / cons: a temp-file protocol for no current need.
3. **The bin runs `git diff -U0` itself** — pros: no caller work / cons: an impure bin needs a repo to test, and it duplicates scoping the skill already does.

## Decision

**Adopted-as-recommended (no user judgment).** The scope spec is a single comma-joined
`<file>:<start>-<end>` argument, mirroring the per-hunk convention already documented in the
manifest.

## Consequences

The bin stays pure and unit-testable. Callers assemble the spec once; the one-argument shape
means the drop-all-but-the-last hazard recorded for the mutation runner cannot repeat here.
