---
subjects:
  - scripts/ci.sh
---
# 475 — ci.sh names the hygiene lints instead of describing them

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/stub-lint-ci-self-reference.md · **Supersedes/Refines:** none

## Context

`scripts/ci.sh:82` is a comment, `touched-diff stub + prose lints`. The prose word `stub`
is a marker under ADR-210, and no name rule covers it (ADR-474).

## Options considered

1. **Reword** to `touched-diff stub-lint + prose-lint` *(recommended)* — pros: one comment edit, covered by the name rule / cons: none
2. **Leave it** — cons: one advisory finding on every change touching `ci.sh`
3. **Widen the rule** to prose phrasings — cons: indistinguishable from `# stub: fill in`

## Decision

Option 1 — ratified by the user. Prose that refers to the stub lint names it `stub-lint`;
a bare `stub` stays a marker.

## Consequences

`node engine/bin/stub-lint.js -- scripts/ci.sh` reports nothing on the shipped tree.
