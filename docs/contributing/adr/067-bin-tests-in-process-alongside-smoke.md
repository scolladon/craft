# 067 — Bin test strategy: in-process units alongside retained child-process smoke

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P13-nfr-hardening.md · **Supersedes/Refines:** none (DC-8 as recommended); builds on ADR-066

## Context

Converting bins to in-process-testable (ADR-066) raises what to do with the existing
`spawnSync`-based bin tests (`pipeline-resolve.bin.test.js`, `contract-assemble.test.js`,
`normalize-findings-bin.test.js`). Those child-process tests are the only thing asserting the bin
*end-to-end* through the real entrypoint: actual `process.exit` codes and argv wiring — the exact
guard line that ADR-066 deliberately excludes from the mutate surface. The new in-process units, by
contrast, give mutation-coverable assertions on the extracted `main(argv, io)` logic.

## Options considered

1. **Add in-process units alongside; retain child-process as smoke (chosen)** — pro: keeps the
   end-to-end exit-code/argv surface AND adds mutation-coverable units / con: test count grows.
2. **Replace child-process tests entirely** — con: loses end-to-end assertion of real exit codes and
   the entrypoint wiring.
3. **Convert in place** — con: no net-new smoke layer; loses the integration surface.

## Decision

For each converted bin, add in-process unit tests on `engine/src/<bin>-main.js` (assert the returned
exit code + the captured `io.stdout`/`io.stderr` writes, covering the previously `[NoCoverage]` argv
branches, closures, and usage/error exits), and **retain** the existing child-process test as
integration smoke (the sole assertion that the real entrypoint exits with the right code and wires
argv). `EXPECTED_TESTS` in `scripts/ci.sh` is bumped to the new total in the landing commit, in
lockstep with the added `node --test` tests, per the file's append-only convention.

## Consequences

- Two layers per bin: fast mutation-coverable units (src) + a thin end-to-end smoke (child process).
- `EXPECTED_TESTS` rises (currently 448); every landing commit that adds tests bumps it exactly.
- The child-process smoke stays minimal — it asserts exit code + argv wiring, not the logic branches
  (those are the in-process units' job), so it does not duplicate coverage.
