---
subjects:
  - engine/package.json
  - engine/package-lock.json
supersedes:
  - adr: "047"
    scope: "DC-2a/DC-2b: Stryker core and tap-runner pinned at 8.7.1 for a Node >=18 floor"
---
# 570 — Stryker core and tap-runner move to 10.0.0

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/stryker-9-upgrade.md · **Supersedes/Refines:** supersedes ADR-047 (DC-2a, DC-2b)

## Context

ADR-047 DC-2a/2b pinned `@stryker-mutator/core` and `@stryker-mutator/tap-runner` at 8.7.1
because 9.x requires Node `>=20` and the engine declared `>=18`. ADR-564 raised the floor to
`^22.18.0 || >=24.2.0`, so both 9.6.1 (`>=20`) and 10.0.0 (`>=22`) are admissible. The design
also pinned a defect in 8.7.1: on Node 24.11.0 and 25.1.0 its default `nodeArgs` make test files
print the spec reporter, which its TAP parser reads as "no tests found", so 8.7.1 cannot score on
the engine's supported 24 line. 9.x/10.x default `nodeArgs` to `--test-reporter=tap`. Both moves
cut the Stryker-tree `npm audit` advisories from 15 to 2. 9.6.1 keeps the 8.7.1 mutant set
byte-identical (10141); 10.0.0 adds 171 `CallExpression` mutants from its new
empty-expression mutator, enabled by default.

## Options considered

1. **9.6.1** — pros: byte-identical mutant set, clean A/B against the 8.7.1 baseline / cons:
   one major behind the `latest` dist-tag, so the 10.0.0 move is deferred, not avoided.
   *(designer's recommendation)*
2. **10.0.0** — pros: current major, same tap-runner code and audit result as 9.6.1, no
   follow-up major pending / cons: 171 new mutants whose survivors must be triaged in this
   change.
3. **Stay on 8.7.1 with `tap.nodeArgs` set to `--test-reporter=tap`** — pros: no lockfile
   churn / cons: keeps 15 advisories and a runner two majors behind.

## Decision

Option 2, ratified by the user: both packages move to **10.0.0**.

Superseded from ADR-047: DC-2a (core@8.7.1, "Node `>=18`-safe; 9.x would force `>=20`") and
DC-2b's version (tap-runner@8.7.1).

Carried forward from ADR-047: DC-2b's runner choice (the tap-runner, native `node --test`/TAP
integration), DC-2c (mutation runs on demand from the `engine/package.json` script, never in
`ci.sh`), and DC-1a, DC-1b, DC-1c, DC-4, DC-5a, DC-6, DC-7 and DC-9 unchanged.

The 171 mutants that 10.0.0 adds are part of this change's mutation acceptance: each survivor is
killed by a test or proven equivalent, the same triage any survivor gets.
`engine/stryker.conf.json` keeps its keys; the schema check forced no change, and
`tap.nodeArgs` stays unset so the upstream default applies.

## Consequences

- The engine's supported 24 line can run mutation testing.
- Recorded mutation scores from 10.0.0 on are not directly comparable with earlier 8.7.1 scores:
  the denominator grows by the empty-expression mutants.
- A future major is a new ADR, not a silent bump (see ADR-571 on the pin form).
- ADR-047's status becomes `superseded by ADR-570` for DC-2a/2b; its other decisions stand.
