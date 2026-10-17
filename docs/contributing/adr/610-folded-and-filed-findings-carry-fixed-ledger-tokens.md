---
subjects:
  - docs/contributing/specs/run-record.md
  - skills/run/SKILL.md
supersedes: []
---
# 610 — Folded and filed findings carry fixed ledger tokens

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/fold-in-scope-followups.md · **Supersedes/Refines:** refines ADR-102

## Context

A fold leaves no backlog trace, so its only record is the run. The run record already reaches the PR trailer as run-id lines (ADR-102), and new tokens join the vocabulary (ADR-357, ADR-360, ADR-464).

## Options considered

1. **Ledger tokens `FOLDED(...)` / `FILED(...)`, documented in `run-record.md`'s Token vocabulary and the run skill's token table** *(recommended)* — pros: greppable across runs, follows the precedents / cons: two doc surfaces.
2. **The same tokens documented only in the documentation skill** — cons: an undocumented token family.
3. **No tokens; a `Folded:` trailer line in the PR template** — cons: contradicts ADR-102, not greppable.

## Decision

Option 1. The documentation phase appends one line per finding after its fold or entry commit: `FOLDED(<file>): <finding> -> <sha>` or `FILED(<file>): <finding> — not folded: <reason>`. Both are greppable-only: no parse rule, and `run-state` does not consume them.

## Consequences

The trailer carries folds as run-record lines; `templates/pr-body.md` is unchanged.
