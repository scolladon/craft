# 307 — Path detection in a prose context block reads backticked spans

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

The overlap check needs to know which files a part's context block declares, but that block is
prose. The repo already extracts structure from prose in one place: the intention lint reads
backticked spans.

## Options considered

1. **Backticked spans that look like a repo path** *(recommended)* — pros: matches the house precedent and how plans actually cite paths / cons: a path written without backticks is invisible to the check.
2. **Any whitespace-delimited token matching a path regex** — pros: catches unbackticked paths / cons: noisy — prose names paths mid-sentence and inside quoted snippets.
3. **Require an explicit machine-readable list line and lint only that** — pros: most precise / cons: changes the plan template and makes every existing plan non-conforming, for a check that is advisory anyway.

## Decision

**Adopted-as-recommended (no user judgment).** A part "declares" a file when its context block
contains a backticked span that resolves to a repo path. Unbackticked paths are out of scope
for the check.

## Consequences

The check is deliberately incomplete: it under-reports rather than over-reports, which is the
right bias for an advisory warning. The plan template is unchanged and every existing plan
stays conforming.
