---
subjects:
  - contracts/core.md
  - engine/test-helpers/contract-markers.js
supersedes: []
---
# 605 — The core contract teaches a commit form bash 3.2 parses

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/bash32-heredoc-commit-idiom.md · **Supersedes/Refines:** refines ADR-468

## Context

Harness defaults (Claude Code's system prompt, copilot's model) commit with `git commit -m "$(cat <<'EOF' … EOF)"`. Craft never teaches that form, but its roles follow the harness default. macOS `/bin/bash` 3.2.57 finds the end of `$(…)` with a scanner that does not know heredoc bodies: an odd `'`, `"` or backtick, or an extra `(`, in the body is a syntax error (exit 2, no commit); an extra `)` ends the substitution early and commits a wrong message with exit 0. zsh parses every case correctly. Copilot runs `/bin/bash`.

## Options considered

1. **Teach the form in `contracts/core.md`** *(recommended)* — pros: one line reaches every phase in agent and inline mode (the core is always assembled first); ADR-468 is the precedent / cons: about 240 bytes per spawn, read-only review spawns included.
2. **Document the workaround only** (copilot README, gate spec) — pros: no contract change / cons: roles keep the harness default, which fails or silently corrupts on bash 3.2.
3. **Teach it in each committing bundle** — pros: review spawns skip it / cons: one rule repeated five times; the decisions phase commits ADRs but has no bundle.

## Decision

Ratified by the user: option 1. `contracts/core.md` carries one `Commit form:` line: commit with `git commit -m "<message>"`, one double-quoted `-m` per paragraph; a message holding `` " $ ` \ `` or `!` goes in a file outside the working tree, committed with `git commit -F <file>` (ADR-607); never `-m "$(cat <<'EOF' … EOF)"`. `CORE_MARKERS` pins the line in every assembled block, agent and inline.

## Consequences

Every role spawn is told a commit form that bash 3.2, `sh` and zsh parse the same way. Orchestrator commits made outside a phase get no contract block (ADR-468) and keep the harness default; their fixed-template messages hold none of the trigger characters.
