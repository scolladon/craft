---
subjects:
  - engine/test-helpers/git-differential-harness.js
supersedes: []
---
# 685 — The reprinted-body tag is a text check at the substitution writers

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/bash53-heredoc-comsub-false-block.md · **Supersedes/Refines:** none

## Context

The generator must set `heredoc-list-in-substitution` on every command it builds with a heredoc
followed by a `;` inside a `$( )`/`<( )` body.

## Options considered

1. **A regex over the inner text at each composer that writes `$( `/`<( `** *(recommended)* — pros: mirrors `processSubstitutionTags` in the same file; a few lines
2. **A structural fragment flag propagated through `sequence`** — cons: a new field and a propagation rule on every composer

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with the `processSubstitutionTags`
precedent and ADR-661's tag-at-the-construct rule.

## Consequences

The census flags a refused command without the tag, and a pinned-seed shape test catches a tag
without the construct.
