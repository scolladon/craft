---
subjects:
  - docs/contributing/specs/run-record.md
  - skills/documentation/SKILL.md
supersedes: []
---
# 613 — A finding with no file keys on the run's design doc

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/fold-in-scope-followups.md · **Supersedes/Refines:** refines ADR-611

## Context

ADR-611 keys `FOLDED` and `FILED` on the finding's repo-relative locus file. Some findings have no file of their own, such as an observation about how a run went, and the rule left their parameter undefined. This run's own fold step surfaced the gap.

## Options considered

1. **File it as a follow-up** — pros: ADR-611 untouched / cons: the gap stays open for every run.
2. **Key on the run's design doc path** — pros: a repo-relative, whitespace-free path that every run has and that is in the diff / cons: one doc collects unrelated findings.
3. **Key on a literal `-`** — cons: a sentinel no other token uses.

## Decision

Option 2, the user's choice. A finding with no locus file of its own keys on the run's design doc path.

## Consequences

Every `FOLDED`/`FILED` parameter stays a repo-relative path, so the grep-by-file rule from ADR-611 holds without a sentinel.
