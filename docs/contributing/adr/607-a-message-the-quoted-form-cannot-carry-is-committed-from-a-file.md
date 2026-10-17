---
subjects:
  - contracts/core.md
supersedes: []
---
# 607 — A message the quoted form cannot carry is committed from a file

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/bash32-heredoc-commit-idiom.md · **Supersedes/Refines:** refines ADR-605

## Context

A double-quoted `-m "…"` expands `$` and backtick in every shell, needs a `\` before `"`, and copilot's gate denies `$`, backtick, `\` and `!` inside double quotes and `$` and backtick inside single quotes. Roles receive their commit message as an exact message (`contracts/construction.md`).

## Options considered

1. **`git commit -F <file>`**, the file written outside the working tree by a command that does not mention git *(recommended)* — pros: commits the exact text under bash 3.2, `sh` and zsh; the gate allows it / cons: two tool calls.
2. **Rephrase the message** — cons: breaks the exact-message rule.
3. **Single-quoted `-m '…'`** — cons: the gate denies `$` and backtick inside single quotes too, and an apostrophe cannot appear.

## Decision

Adopted-as-recommended (no user judgment): option 1. It keeps the exact-message rule and passes every shell and the copilot gate. Writing the file and committing in one command is denied on copilot (`<` near git), so the write is a separate call.

## Consequences

The core `Commit form:` line (ADR-605) names this fallback and its trigger characters.
