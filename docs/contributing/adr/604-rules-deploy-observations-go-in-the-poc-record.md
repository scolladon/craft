---
subjects:
  - docs/contributing/specs/codex-poc-record.md
---
# 604 — The 0.162.1 rules deploy observations are recorded in the POC record

- **Status:** accepted
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/codex-rules-deploy-step.md · **Supersedes/Refines:** none

## Context

The deploy-step design measured, on codex 0.162.1: a copied rules file is loaded, a symlinked file is
not, a symlinked rules directory is followed, only `*.rules` files are parsed, and `cmp` and
`codex execpolicy check` both follow a symlink and pass on it. The README's "copy, do not symlink"
sentence rests on these. ADR-573 keeps version-pinned observations in the POC record, out of the
generated file. The brief scoped the change to the README and one test file.

## Options considered

1. **Add rows to the 0.162.1 re-probe table of `docs/contributing/specs/codex-poc-record.md`** — pros:
   the README claim cites the canonical record / cons: one more docs file than the brief named.
   *(designer's recommendation)*
2. **Keep them in the design doc and ADRs only** — pros: stays within the brief / cons: the evidence
   lives outside the record the other 0.162.1 observations live in.

## Decision

Option 1, ratified by the user. The observations land as rows in the POC record's 0.162.1 re-probe
table, dated 2026-10-16, with their run counts.

## Consequences

- The POC record is the place a later re-probe updates if codex changes how it loads symlinked rules.
