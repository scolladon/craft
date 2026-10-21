---
subjects:
  - docs/contributing/specs/copilot-poc-record.md
supersedes: []
---
# 664 — The write_bash evidence is a numbered PoC row

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/copilot-write-bash-pty-probe.md · **Supersedes/Refines:** none

## Context

The copilot 1.0.98 probe pinned that `write_bash` is not a registered model tool in headless or
interactive pty sessions, and that the async shell's stdin is `/dev/null`. The PoC record keeps
its facts in one numbered CONFIRMED table. Row 11 already carries hook enforcement across three
versions plus a shell-surface sentence.

## Options considered

1. **A new CONFIRMED row 21** *(recommended)* — pros: tool registration is its own dimension; the
   record keeps one numbered table / cons: the shell-surface facts sit in two rows
2. **Extend row 11's shell-surface sentence** — pros: shell facts stay together / cons: row 11,
   about hook enforcement, grows further
3. **A new "Re-probe — copilot 1.0.98" section** — pros: mirrors the codex record / cons: a second
   table shape in a record that has one

## Decision

Ratified by the user: option 1. The evidence lands as CONFIRMED row 21, with one Verdict sentence
and a reproduction-notes bullet for the pty step.

## Consequences

Row 11 stays about hook enforcement. A later copilot re-probe of tool registration refreshes row 21.
