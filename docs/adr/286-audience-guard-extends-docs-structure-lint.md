# 286 — audience-split guard extends docs-structure-lint

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** ../design/docs-audience-split.md · **Supersedes/Refines:** none

## Context

Requirement 11 needs a loud regression fence: no new stray file directly under `docs/`, no
new top-level `docs/` subdir beyond `guides/` and `contributing/`. The repo already has a
docs-tree lint (`scripts/docs-structure-lint.sh` + fixtures + test) enforcing the dated-doc
archive rule.

## Options considered

1. **Extend `docs-structure-lint.sh` + its test with a top-level allowlist rule**
   *(recommended)* — pros: one docs lint, one fixture pattern, one CI wiring / cons: the
   script now enforces two rules.
2. **New dedicated `docs-audience-lint.sh` + test** — pros: single-purpose scripts / cons:
   doubles the lint surface for one concern (docs tree shape).
3. **A `test/*.test.js` assertion only** — pros: least code / cons: skips the repo's
   established shell-lint + fixture pattern; no standalone runnable check.

## Decision

Adopted-as-recommended (no user judgment). `docs-structure-lint.sh` gains the tracked-only
(`git ls-files`) top-level allowlist `{README.md, guides, contributing}`; positive-pinned
in the test so it cannot pass vacuously. Activated only in the final migration part, once
the top level is clean.

## Consequences

The dated-doc rule's `ARCHIVE_DIR` retargets to `docs/contributing/archive` with the
archive part; the allowlist rule lands last. A future `paths.requirements` tree must be
added to the allowlist when enabled.
