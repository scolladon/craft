---
subjects:
  - engine/test/findings.test.js
  - test/p10-structure.test.js
---
# 449 — The claim-status pin lives in the engine findings suite

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/pin-claim-status-set-to-contract.md · **Supersedes/Refines:** none

## Context

The behavioural claim-status pin needs a home. The sibling pins (agent ↔ contract) live in the CommonJS process suite `test/p10-structure.test.js`, whose `contractSetFor` helper is file-local. The parser's behaviour tests live in the ESM engine suite `engine/test/findings.test.js`, inside Stryker's `testFiles`.

## Options considered

1. **`engine/test/findings.test.js`, status section, contract-set regex re-stated locally** *(recommended)* — pros: an engine test as asked, beside the parser's status tests, inside Stryker's test set; follows the suite's "declared independently so drift fails loudly" idiom / cons: three lines duplicate `contractSetFor`'s extraction
2. **`test/p10-structure.test.js` beside the sibling pins, reusing `contractSetFor`** — pros: no duplicated extraction / cons: the first ESM-from-CommonJS dynamic import in the process suite; outside Stryker's test set

## Decision

Adopted as recommended (option 1).

## Consequences

- A change to the contract's `status?:` line shape must be mirrored in two extractions; each fails loud on an empty set.
