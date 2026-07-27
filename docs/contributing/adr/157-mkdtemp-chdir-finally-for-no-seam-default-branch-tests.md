# 157 — mkdtemp+chdir+finally for no-seam default-branch tests

- **Status:** accepted
- **Date:** 2026-06-26
- **Design:** docs/design/hermetic-test-suites.md · **Supersedes/Refines:** none

## Context

A test that drives a bin/main's no-argument default-resolution branch (`?? DEFAULT`)
has no path-argument seam: the branch under test is *the default*, chosen by
`process.cwd()`. Offenders A2 (`manifest-lint-main.test.js:164`) and A3
(`contracts-lint-main.test.js:143`) exercise exactly that branch, so their green is
contingent on ambient repo files at the default location.

## Options considered

1. **mkdtemp+chdir+finally** (designer recommendation; pre-stated in the brief for
   default-path tests) — pros: deterministically controls the cwd the default resolves
   against; preserves the no-arg branch coverage and its mutant kills. cons: mutates
   process cwd for the test's duration (must restore in `finally`).
2. **explicit-path injection** — pros: no cwd mutation. cons: not applicable —
   passing a path skips the very `?? DEFAULT` branch under test, deleting the
   mutant-killing coverage.

## Decision

Adopt **mkdtemp+chdir+finally** for the no-seam default-branch offenders A2 and A3
(adopted-as-recommended — aligns with the brief's stated default and the design;
no user judgment required). A2 runs against an **empty** scratch cwd (absent branch);
A3 runs against a **seeded full contracts dir** as cwd (present branch). Both restore
the prior cwd and `rmSync` the scratch in `finally`. Assertions are unchanged.

**Explicit-path injection remains the default** for any *future* offender whose
bin/main accepts a path argument — this audit found none such; A2/A3 are the no-seam
exceptions.

## Consequences

- The cwd mutation is encapsulated in the shared helper (see ADR-158); tests call it
  rather than open-coding `chdir`/restore.
- The pattern matches the already-landed reference fix at
  `manifest-lint-main.test.js:39`, keeping the remediation uniform.
- No production bin behaviour changes; cwd-relative default resolution stays a
  consumer feature.
