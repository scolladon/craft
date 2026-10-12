---
subjects:
  - engine/src/glob.js
  - engine/src/adr-lint-main.js
  - engine/src/manifest.js
---
# 486 — The adr.frozen guard rejects entry sets that together cover the tree or all markdown

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-six-entries.md · **Supersedes/Refines:** none

## Context

The whole-tree guard on `adr.frozen` checks each entry alone against a fixed probe set.
`**/*.md` passes (it misses `Makefile`) yet exempts every file that carries citations, and
`['*', '*/**']` passes entry by entry yet exempts the whole tree: adr-lint then reports OK
with no citation checked.

## Options considered

1. **Set-level widen** *(recommended)* — reject when the entries together cover every whole-tree probe, or every markdown probe, at both guard sites — pros: closes both holes; existing per-entry message unchanged / cons: two more messages to maintain
2. Per-entry markdown class only — cons: the union hole stays open
3. Document only — cons: keeps a guard that is visible and wrong

## Decision

Option 1 — ratified by the user. Both adr-lint and manifest validation reject an
`adr.frozen` list whose entries, taken as a union, match every whole-tree probe path or every
markdown probe path. The per-entry check and its message stay as they are.
`docs/guides/customizing.md` states the semantic rule; a root-only `*` stays accepted.

## Consequences

A frozen list must leave at least one probe path unexempted. The probe sets are
representative, not exhaustive: a union crafted to skip one probe still passes.
