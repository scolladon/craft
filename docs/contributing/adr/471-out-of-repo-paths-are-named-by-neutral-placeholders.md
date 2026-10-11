---
subjects:
  - docs/contributing/plan
  - docs/contributing/design
---
# 471 — Out-of-repo paths are named by neutral placeholders

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/scrub-home-dir-from-docs.md · **Supersedes/Refines:** none

## Context

`~`- or `$HOME`-relative paths drop the username but keep the toolchain and workspace layout,
which the leak brief also names.

## Options considered

1. **Neutral placeholders** (`<worktree>`, `<main-repo-dir>`, `<dev-root>`, `<node-bin>`), repo-relative for in-repo paths *(recommended)*
2. **`~`-relative** — cons: keeps layout
3. **`$HOME`-relative** — cons: keeps layout

## Decision

Option 1 — adopted-as-recommended (no user judgment). `<worktree>` and `<main-repo-dir>` are
already house vocabulary in `skills/run/SKILL.md`.

## Consequences

- A global gitignore hit is written `~/.gitignore`: the fact recorded is "global", not a layout.
