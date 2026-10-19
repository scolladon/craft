---
subjects:
  - adapters/copilot/README.md
  - docs/contributing/specs/gate.md
  - BACKLOG.md
supersedes: []
---
# 654 — The gate docs state the real rules and residuals

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/copilot-guard-differential-fuzz-arm.md · **Supersedes/Refines:** none

## Context

The census tags must map to rules the living docs state. The README residual list omits entries gate.md has, gate.md lacks the zsh `=` bullet, and both false-block lists understate the quoted-word rule.

## Options considered

1. **Fold all four doc fixes** and mark both BACKLOG entries delivered (recommended).
2. Fold three, leave the quoted-word entry open / cons: docs and census tags disagree.

## Decision

Adopted as recommended, with the BACKLOG step following the repo convention the user asked for: both entries (the copilot fuzz arm and the quoted-word understatement) are rewritten in place as delivered, not deleted. The README residual list matches gate.md, both command-position lists name mapfile/readarray/compgen, gate.md gains the zsh `=` bullet, and both intended-false-block lists state the real rule: any `$` or backtick in a quoted word, and any `\` or `!` in a double-quoted one.

## Consequences

No new BACKLOG entry is filed by this change.
