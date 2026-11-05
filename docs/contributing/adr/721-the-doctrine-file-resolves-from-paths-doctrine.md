---
subjects:
  - skills/decisions/SKILL.md
  - .claude/workflow.md
supersedes: []
---
# 721 — The doctrine file resolves from paths.doctrine, default docs/DOCTRINE.md

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

The decisions phase is generic across consumer repos, so the doctrine file cannot sit at a craft-only path.

## Options considered

1. **`paths.doctrine` knob, default `docs/DOCTRINE.md`, unvalidated like `paths.adr`** *(recommended)* — pros: same shape as `paths.dod` / cons: a typo'd path reads as "no entries".
2. **Same knob plus a repo-relative shape check** — pros: catches a bad path / cons: validator and tests with no failure case shown.
3. **No knob, `<adr-dir>/../DOCTRINE.md`** — cons: breaks a consumer whose ADR dir is not under `docs/`.

## Decision

**adopted-as-recommended (no user judgment)** — ADR-106. The doctrine path is `paths.doctrine`, else `docs/DOCTRINE.md`; an absent file means no entries. craft's own manifest sets `docs/contributing/DOCTRINE.md`.

## Consequences

- manifest-lint gains no check for the key.
