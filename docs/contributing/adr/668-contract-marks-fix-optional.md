---
subjects:
  - contracts/harness-read.md
supersedes: []
---
# 668 — The reviewer contract marks fix optional

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/reviewer-findings-shape-mismatch.md · **Supersedes/Refines:** ADR-667

## Context

With the contract aligned to the canonical field names (ADR-667), the fix field can be written
`fix?` or `fix`.

## Options considered

1. **`fix?`** *(recommended)* — pros: matches the `Finding` typedef, the review skill's output
   description and the parser, which all treat fix as optional; mirrors `status?` / cons: none found
2. **`fix`** — pros: nudges reviewers to always state a fix / cons: asks for more than the parser
   needs; a finding about a missing test may have no fix to state

## Decision

Adopted-as-recommended (no user judgment): option 1, `fix?`.

## Consequences

The contract, typedef and parser agree that fix is optional.
