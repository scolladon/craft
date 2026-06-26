---
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
