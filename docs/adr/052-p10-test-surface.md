# 052 — P10 test surface: live-bin inverse-RED + structural (bats)

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P10-default-phases.md · **Supersedes/Refines:** Refines ADR-046 (`node --test` count gate)

## Context

The S4/S5 resolver-direct goldens already pass (they call `resolvePipeline` without the
live `roleExists` probe). The real P10 acceptance is the **dispatch** gap: today a live
`pipeline-resolve` with either phase enabled exits 2 ("does not resolve to an installed
agent"); after P10 it must exit 0. That, plus the existence of the four authored files,
needs guarding.

## Options considered

1. **Full set, structural in bats** — live-bin "enabled → exit 0" inverse-RED tests in
   `engine/test/pipeline-resolve.bin.test.js`; agent/skill-dir existence + agent-thinness
   no-duplication as `test/*.bats`; contract-assemble exit-0 + bundle-marker pins — pros:
   bin tests sit with the other bin cases; file-existence reads naturally as shell / cons:
   coverage split across two runners. *(designer's recommendation, with the bats split)*
2. **Full set, all in JS** — same coverage, structural checks in `engine/test` too — pros:
   one runner / cons: file-existence/thinness as JS `fs` asserts read less naturally.
3. **Only S4/S5** — pros: nothing to add / cons: leaves the inverse-RED dispatch
   acceptance — the actual P10 deliverable — unguarded.

## Decision

Add the **full set**: (1) live-bin inverse-RED exit-0 tests for both phases enabled, in
`engine/test/pipeline-resolve.bin.test.js`, mirroring the existing good/bad-role bin cases;
(2) **structural** existence + procedure↔dir-name + agent-thinness (no duplicated core
invariants) checks as `test/*.bats`; (3) `contract-assemble` exit-0 + producer/harness-exec
marker pins. Bump `scripts/ci.sh` `EXPECTED_TESTS` by exactly the `node --test` cases added
(the count lives ONLY in `scripts/ci.sh`; `engine/package.json` is a bare glob). bats cases
are counted by the separate bats gate, not the node counter.

## Consequences

- Two runners touched: `engine/test/pipeline-resolve.bin.test.js` (+ count bump) and a new
  `test/*.bats`.
- ⚑ **Parked concern (user-requested):** *evaluate migrating the bats suite to `node --test`
  (JS) for portability* — bats requires bash; `node --test` runs anywhere Node does, and a
  single runner removes the two-counter split this ADR introduces. Recorded as a follow-up
  in `BACKLOG.md` (parked), not actioned in P10.
- The inverse-RED bin tests are red-on-revert: deleting either new agent flips the asserted
  exit 0 back to 2.
