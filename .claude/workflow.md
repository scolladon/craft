---
paths:
  design: docs/contributing/design
  adr: docs/contributing/adr
  plan: docs/contributing/plan
  dod: docs/contributing/DOD.md
phases:
  validation:
    harness:
      techniques:
        - id: mutation
          probe: "test -f engine/stryker.conf.json && npx --no-install --prefix engine stryker --version"
          run: "npm --prefix engine run mutation"
          mode: triage
          run-style: background
          commit-prefix: test
---

# craft consumer manifest

Declares craft's own validation technique so `/craft:validation` runs mutation
coverage rather than silently no-opping after de-specialization (requirement 11,
design §9 DECLARED tier).

The `mutation` technique runs Stryker via the `engine` package script, which
invokes `cd .. && stryker run engine/stryker.conf.json`. Surviving mutants are
triaged by the generic `harness-triager` agent using the repo's established
`// equivalent mutant (…)` convention documented in `engine/src` comments.

## Per-hunk mutation scope

Per-hunk scope: emit ONE combined `--mutate "fileA:r1,fileB:r2"` (not separate
`--mutate` flags per hunk — two separate flags silently drop all but the last,
faking a clean score). Verify the instrumented mutant count is >= the adjacent-hunk count
before trusting a green score.
