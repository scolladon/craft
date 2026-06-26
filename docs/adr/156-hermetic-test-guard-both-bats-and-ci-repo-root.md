# 156 — Hermetic-test guard: both a bats repo-root smoke and a CI repo-root run

- **Status:** accepted
- **Date:** 2026-06-26
- **Design:** docs/design/hermetic-test-suites.md · **Supersedes/Refines:** none

## Context

Test hermeticity (no test coupling to cwd or ambient repo/HOME state) is a property
that silently rots: a new default-resolution test is green from `cd engine` and only
goes red under a different cwd (Stryker's repo root) once an ambient file appears. A
durable guard must turn that latent divergence into a CI failure at the commit that
introduces it.

## Options considered

1. **bats repo-root smoke only** (designer recommendation) — pros: one file under the
   existing `bats test/`, cheap, runs in CI via `ci.sh`. cons: representative only —
   catches regressions solely in the files it names.
2. **second `node --test 'engine/test/**/*.test.js'` step in `scripts/ci.sh` only** —
   pros: comprehensive (any cwd-coupled test in any file goes red from repo root).
   cons: roughly doubles full-suite runtime each commit; no targeted signal.
3. **both** — the bats smoke as the cheap targeted signal AND the whole suite from repo
   root as the comprehensive net.

## Decision

Adopt **both** guards (user judgment, deviates from the designer's recommendation of
option 1):

- `test/hermetic-suite.bats` runs the representative default-resolution engine tests
  from repo-root cwd (and at least one under a deliberately hostile seeded ambient) and
  asserts green — the fast, named, intent-revealing signal.
- `scripts/ci.sh` gains a second invocation that runs the **whole** engine suite from
  the repo root (`node --test 'engine/test/**/*.test.js'`) in addition to the existing
  `cd engine` run — the comprehensive net so any future cwd-coupled test, in any file,
  fails CI.

## Consequences

- Full engine suite runs twice per CI (once from `engine/`, once from repo root);
  accepted for the comprehensive cwd-invariance guarantee.
- The repo-root run must use the empirically-pinned command `node --test
  'engine/test/**/*.test.js'` and stay consistent with the `EXPECTED_TESTS` count gate.
- The bats smoke is the regression tripwire developers see first; the ci.sh step is the
  backstop for files the smoke does not name.
