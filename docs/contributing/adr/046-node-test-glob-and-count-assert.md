# 046 — `node --test` explicit glob + count-assert gate

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-hardening.md · **Supersedes/Refines:** none

## Context

Both `scripts/ci.sh` and `engine/package.json` run a bare `node --test` (cwd `engine`). Two footguns,
pinned empirically under Node v22: (a) bare `node --test` auto-runs EVERY `.js` under `test/`, so a
non-test helper silently becomes a phantom 0-assertion passing test (the count drifted 409→410 in P9
until a helper was relocated); (b) `node --test test/` treats the dir as a single file and FAILS
(1 test, 1 fail) — the "405 vs 1" baseline-misread footgun. A green `node --test` gate cannot catch
either.

## Options considered

Discovery fix (DC-5a): **explicit glob `node --test 'test/**/*.test.js'`** *(chosen)* vs a count-assert
alone vs both. Drift detection (DC-5b): glob only *(designer's recommendation)* vs **glob + a
count-assert gate** *(user choice; deviates from the recommendation)*.

## Decision

Replace the bare `node --test` in `scripts/ci.sh` and `engine/package.json` with the explicit glob
`node --test 'test/**/*.test.js'` (quoted so Node globs it natively) — this structurally excludes any
non-`.test.js` file under `test/`, closing the phantom-file footgun. ADDITIONALLY add a count-assert
gate that asserts the discovered test count equals an expected pinned number, catching silent count
drift. The expected count is bumped in the SAME commit that adds or removes tests, so CI stays green
at every commit. The exact mechanism (where the expected number lives; parsing `# tests N` from the
runner output) is a construction detail for the plan.

## Consequences

The phantom-file footgun is closed by the glob alone; the count-assert adds drift detection at a
per-part maintenance cost (every test-count-changing part updates the expected number in-commit).
The glob string becomes the single source the Stryker `tap.testFiles` config (item 2) reuses, so it
is settled before that config references it.
