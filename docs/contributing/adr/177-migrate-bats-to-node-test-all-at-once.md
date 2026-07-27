# 177 — migrate the bats suite to node:test, all-at-once

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/clear-backlog-candidates-gated.md

## Context

The `bats` suite (12 files, 96 `@test` cases) tests bash scripts (detect-ecosystem,
worktree-setup, manifest-lint, hooks) and grep gates as real subprocesses. Migrating to
`node --test` for portability was parked as evaluate-first; the designer's evidenced
recommendation was to defer (bats gives native real-process fidelity, the portability trigger
had not bitten).

## Decision

**Migrate now, all-at-once** — operator override of the designer recommendation, accepting the
"largest, highest-risk" framing. Shell-behaviour fidelity is preserved because each ported test
runs the **real bash script** via `execFileSync('bash', [script, …])` and asserts
stdout/stderr/exit — node:test orchestrates, bash still executes. The whole existing suite is
ported in one workstream (not dribbled across batches); functional workstreams in this same
batch therefore add **node:test** tests from the start, never new bats.

## Consequences

- Each `test/<name>.bats` → `test/<name>.test.js` using `node:test` + `execFileSync`.
- `scripts/ci.sh` line 44 `bats test/` → `node --test 'test/**/*.test.js'` run from repo root,
  guarded by its own `EXPECTED_PROC_TESTS` count (asserted once; distinct from the
  engine-suite `EXPECTED_TESTS` asserted twice). `shellcheck` and the lint steps stay.
- The `bats` dev-dependency is removed from setup; the bats binary is no longer a CI
  prerequisite.
- **Sequencing:** this is the LAST workstream. It rebases over every other workstream's test
  additions and the `EXPECTED_TESTS` bumps; landing it last de-risks the batch — the other 13
  items are green before the migration starts, and a migration stall cannot strand them.
- **Risk containment:** the ported suite must reproduce the same pass/fail behaviour
  case-for-case; the migration commit asserts the new `EXPECTED_PROC_TESTS` equals the
  pre-migration `@test` total (96 + any process-level tests the batch added).
