---
subjects:
  - test/source-hygiene.test.js
---
# 485 — Shipped code carries no provenance refs, pinned by a whole-tree test

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-six-entries.md · **Supersedes/Refines:** none

## Context

The no-provenance-refs contract had no mechanical check: three `DC-` refs in the pi adapter
and a `P11` in a teardown script were found by a manual sweep. Over shipped code the house
provenance pattern plus `DC-\d+` hits only those four lines; over tests it hits 165 lines,
mostly fixture data.

## Options considered

1. **Whole-tree test over shipped code** *(recommended)* — pros: exact today (0 false positives), red on ci.sh / cons: tests stay unguarded; single-letter ids such as `R10` are not caught
2. No rule — cons: the next leak waits for a manual sweep
3. Dedicated stub-lint-style lint — cons: the hygiene posture is advisory, so it would print and pass; new engine source in mutation scope

## Decision

Option 1 — ratified by the user. A source-hygiene test greps shipped code (`engine/src`,
`engine/bin`, `hooks`, `scripts`, adapter source/bin/extension/hook/plugin trees) for
phase, decision-record, part, backlog and design-candidate numbering, and fails listing each
`file:line`. Tests, skills and templates are out of its scope.

## Consequences

A provenance ref in shipped code turns ci.sh red. Widening the scope to tests needs a fixture
allowlist first.
