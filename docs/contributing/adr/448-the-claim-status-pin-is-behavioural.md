---
subjects:
  - engine/src/findings.js
  - engine/test/findings.test.js
  - contracts/harness-read.md
---
# 448 — The claim-status pin is behavioural

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/pin-claim-status-set-to-contract.md · **Supersedes/Refines:** none

## Context

`engine/src/findings.js` holds the claim-status set `VERIFIED|SUSPECT|RULED-OUT|PROBE` in the module-private `STATUS_PREFIX_PATTERN`, a third copy beside `contracts/harness-read.md` and `agents/reviewer.md`. A structure test pins the agent to the contract; nothing pins the parser. A status added to both prose copies passes CI, then `normalizeFindings` throws on every per-line record carrying it at run time. The test must reach the parser's set without a production change if it can.

## Options considered

1. **Behavioural: drive each contract status through `normalizeFindings` and assert it round-trips** *(recommended)* — pros: no production change, catches a contract-only addition, Stryker-neutral, red only on observable behaviour / cons: blind to a status the parser accepts and the contract does not name
2. **Source-read: extract the regex alternatives from `findings.js` text, assert set equality** — pros: exact set equality, no production change / cons: false RED on a behaviour-preserving rebuild of the pattern; in `engine/test/` it aborts every full Stryker run, because the sandbox `findings.js` holds the mutant schema
3. **Export `STATUS_PREFIX_PATTERN` and compare its alternatives** — pros: exact set equality, robust to refactors / cons: a production change the test does not need

## Decision

Option 1, ratified by the user. The pattern stays module-private: the public `normalizeFindings` already exposes the set's behaviour, so the export precondition is not met.

## Consequences

- A status named in the contract but unknown to the parser fails the engine suite, with the offending line in the error.
- A parser-only extra status goes undetected. It is unused acceptance: the reviewer is pinned to the contract, and JSON-layout statuses already pass unvalidated.
- The existing mutants on the pattern are unchanged.
