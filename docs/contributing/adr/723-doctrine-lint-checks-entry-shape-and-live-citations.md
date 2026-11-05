---
subjects:
  - engine/src/doctrine.js
  - engine/src/doctrine-lint-main.js
  - scripts/static-lints.sh
supersedes: []
---
# 723 — doctrine-lint checks entry shape and that every cited ADR resolves live

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

Doctrine entries become adopt authority and are written by agents. An invented or superseded ADR id in an entry's evidence would let an unbacked rule adopt choices.

## Options considered

1. **New `doctrine-lint` bin (heading form, bullets, ADR resolution, `DOCTRINE(D-n)` citations) wired in `static-lints.sh`** *(recommended)* — pros: mechanical, mirrors lesson-lint / cons: one more bin.
2. **Prose rule only** — cons: an invented id goes unnoticed.
3. **A check inside adr-lint** — cons: couples adr-lint to a second file and path knob.

## Decision

**adopted-as-recommended (no user judgment)** — ADR-353. A `doctrine-lint` bin fails (exit 2) on a malformed heading, missing or misordered bullets, an evidence or counter-case `ADR-NNN` that does not resolve or is superseded, empty evidence, or a `DOCTRINE(D-<digits>)` in an ADR naming no entry.

## Consequences

- Superseding an ADR cited as evidence requires re-pointing the entry in the same commit, or the gate goes red.
