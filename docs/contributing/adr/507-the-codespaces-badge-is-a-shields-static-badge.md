---
subjects:
  - README.md
  - test/source-hygiene.test.js
---
# 507 — The Codespaces badge is a shields static badge

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

GitHub's official Codespaces `badge.svg` and any `logo=github` badge contain lowercase `github`, which `test/source-hygiene.test.js` Class B bans in README.md.

## Options considered

1. **shields static badge "Open in Codespaces"** *(recommended)* — pros: passes source-hygiene unchanged
2. **GitHub's `badge.svg` + a wider source-hygiene allowlist** — pros: official look / cons: weakens a gate to fit a picture
3. **Plain text link** — pros: simplest / cons: no badge row parity

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** The README Codespaces badge is a shields static badge linking `https://codespaces.new/scolladon/craft`; source-hygiene is not widened. Aligns with the rule that gates are not weakened to fit content.

## Consequences

The badge does not carry GitHub's own artwork.
