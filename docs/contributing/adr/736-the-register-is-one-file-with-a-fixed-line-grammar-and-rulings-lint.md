---
subjects:
  - docs/contributing/RULINGS.md
  - engine/src/rulings.js
  - engine/src/rulings-lint-main.js
  - engine/bin/rulings-lint.js
  - scripts/static-lints.sh
  - .claude/workflow.md
---
# 736 — The register is one file with a fixed line grammar, gated by `rulings-lint`

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** none

## Context

The register needs a home, a grammar every consumer parses the same way, and a lint. 119 option titles in the corpus contain `; ` and none contains ` · `.

## Options considered

1. **One file at `paths.rulings` (craft: `docs/contributing/RULINGS.md`, default `docs/RULINGS.md`); `- R-NNN [paths] statement. Refused: a · b. Adopted: basis. Superseded by R-M: scope.`; `rulings-lint` RL1–RL5** *(recommended)* — pros: one home, read only through the hint / cons: one large file.
2. **Several files, by area or by hundred** — cons: a routing rule per new line; split id-order check.
3. **A data file plus a rendered markdown view** — cons: a render step and a drift check.

## Decision

**adopted-as-recommended (no user judgment)** — DOCTRINE(D-11), DOCTRINE(D-14). Option 1: one home for the rulings, one parser (`engine/src/rulings.js`) shared by the lint, the hint, the migration and `doctrine-lint`; the separator was picked by measurement.

## Consequences

- `rulings-lint` checks form, strictly ascending ids, path shape, supersession pointers and `R-NNN` references inside `Adopted:` bases; exit 0 clean, 2 on a finding.
