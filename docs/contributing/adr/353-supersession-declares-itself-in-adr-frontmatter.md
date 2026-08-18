---
subjects:
  - templates/adr.md
  - engine/src/adr-lint-main.js
---
# 353 — Supersession declares itself in ADR frontmatter

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

The existing `**Supersedes/Refines:**` header line is prose: of 350 ADRs, 42 omit it, 204 say
`none`, and the remaining 104 spread over 15 leading verbs. It cannot carry a mechanical
requirement.

## Options considered

1. **Frontmatter `supersedes: [{ adr, scope }]`**, beside `subjects`; the header line stays free
   prose — pros: reuses the fence this change already introduces / cons: two places mention
   supersession. *(designer's recommendation)*
2. **A second strict header line** alongside the free-text field — pros: stays in the body /
   cons: two prose homes for one truth; the lint must decide which wins.
3. **Reuse `Supersedes/Refines:` under a strict grammar** — pros: one home / cons: rewriting 104
   free-text values to make a rule that fires on one file machine-checkable.

## Decision

**adopted-as-recommended (no user judgment).** Option 1. The machine-readable fact lives in the
frontmatter block; `scope` is required and must be non-empty. `adr` is the zero-padded 3-digit
id exactly as it appears in the filename and in `ADR-NNN` prose (`"050"`, not `50`), so one
string serves the filename lookup, the status line and the citation regex with no padding
arithmetic. `supersedes` absent is the 350-file default and makes every dependent check inert.

## Consequences

No migration ships. The prose line keeps saying what it says today to a human reader. `adr-lint`
reads the block with `extractFrontmatter` + `js-yaml` directly rather than through
`parseSubjects`, which returns only `parsed.subjects`; both keys live in one fence and neither
requires the other.
