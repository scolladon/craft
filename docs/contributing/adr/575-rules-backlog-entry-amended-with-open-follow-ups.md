---
subjects:
  - BACKLOG.md
---
# 575 — The .rules backlog entry is amended, and its open questions get a run-scoped section

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/codex-0162-reprobe.md · **Supersedes/Refines:** none

## Context

The malformed-`.rules` entry sits in a delivered section. The 0.162.1 re-probe changes its status
and leaves two questions open: whether the interactive TUI takes the app-server path that fails open,
and the fact that `assertRulesIntegrity` has no caller. Neither is a fix this run may make.

## Options considered

1. **Amend in place only** — pros: one edit / cons: the open questions hide in a delivered entry.
2. **New open follow-up only** — pros: visible / cons: the old entry keeps asserting a universal it
   no longer supports.
3. **Amend in place, plus a run-scoped `### Open (scoped 2026-10-15 — …)` section holding the two
   questions** — pros: follows the house convention for follow-ups a run surfaces / cons: one more
   section. *(designer's recommendation)*

## Decision

Option 3, ratified by the user. The existing entry gets a dated 0.162.1 paragraph; a new
`### Open (scoped 2026-10-15 — follow-ups surfaced by the codex-0162-reprobe run, not yet scheduled)`
section records the TUI-path question and the unwired integrity check, as questions only.

## Consequences

- No fix enters this run's scope; both follow-ups are electable later.
