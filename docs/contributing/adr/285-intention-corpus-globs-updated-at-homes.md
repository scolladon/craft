# 285 — intention living-corpus globs updated at their homes

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** ../design/docs-audience-split.md · **Supersedes/Refines:** refines ADR-283's
  defaults-unchanged principle for the one surface a manifest key cannot express

## Context

The zero-config intention corpus is enumerated by `scripts/living-corpus.sh` and described
in `skills/run/SKILL.md` §1c-int as literal globs (`docs/adapters/*.md`, `docs/DESIGN-*.md`,
`docs/DOD.md`, `docs/GUIDE-customizing.md`). The split moves every one of those pages.
`intention.ref` (source `file`) is a single file-ref, so a manifest override cannot express
a multi-glob corpus.

## Options considered

1. **Update the default glob list at its homes (script + §1c-int prose + engine intention
   tests)** *(recommended)* — pros: CI and runtime stay aligned, no new manifest surface /
   cons: touches a shipped default (tension with ADR-283).
2. **Add an `intention:` manifest key to craft's manifest** — pros: symmetry with ADR-283 /
   cons: the key cannot express globs; would need new engine vocabulary for one repo.
3. **Drop legacy `DESIGN-*` docs from the corpus** — pros: smaller corpus / cons: silently
   narrows governance coverage.

## Decision

Adopted-as-recommended (no user judgment; mechanism-forced). The corpus globs move to
`docs/contributing/specs/*.md`, `docs/contributing/prd/DESIGN-*.md`,
`docs/contributing/DOD.md`, `docs/guides/customizing.md`, `docs/guides/concepts.md` in
`living-corpus.sh`, the §1c-int prose, and the engine tests that pin them — in one part.

## Consequences

The ADR-283 tension is accepted and documented here: the corpus globs are craft-shaped
already (no consumer repo carries these pages), so updating them churns no consumer. If a
multi-glob `intention:` manifest surface ever lands, craft's corpus becomes a candidate for
repo-local declaration.
