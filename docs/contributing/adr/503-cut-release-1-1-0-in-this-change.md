---
subjects:
  - CHANGELOG.md
  - .claude-plugin/plugin.json
  - README.md
---
# 503 — Cut release 1.1.0 in this change

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

`plugin.json` has stayed at 1.0.0 through 85 commits since the v1.0.0 tag; per the Claude Code docs, marketplace installs only receive a new copy when `version` changes. No commit subject since the tag carries `!` or `BREAKING`.

## Options considered

1. **Final part cuts `[1.1.0]` and sets `plugin.json` to 1.1.0; the maintainer tags and publishes after integrate** *(recommended)* — pros: ships the post-tag work to marketplace users / cons: until tagged, `plugin.json` says 1.1.0 while the newest tag is v1.0.0
2. **CHANGELOG `[Unreleased]` only** — pros: no version change in a scaffolding PR / cons: marketplace users stay on 1.0.0
3. **2.0.0** — pros: none evidenced / cons: no breaking change to justify a major

## Decision

Option 1 — ratified by the user. The last part of this change cuts `[1.1.0]` in `CHANGELOG.md`, sets `.claude-plugin/plugin.json` `version` to `1.1.0` and updates README's version literal, committed as `chore(release): 1.1.0`. Tagging `v1.1.0` and publishing the GitHub release are maintainer actions after merge, never an implementation part.

## Consequences

Merging ships 1.1.0 to marketplace users. Tagging is the immediate next step after integrate, per `docs/contributing/releasing.md`.
