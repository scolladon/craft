---
subjects:
  - adapters/codex/config.template.toml
  - adapters/codex/README.md
supersedes: []
---
# 642 — The codex binding disables tty sessions

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/codex-write-stdin-tty-close.md · **Supersedes/Refines:** —

## Context

On codex-cli 0.162.1 an `exec_command` with `tty: true` reaches the PreToolUse hook as
`{ command }` only, and the follow-up `write_stdin` fires no hook at all: a shell opened without
mentioning git runs whatever is typed into it (offline probe, benign marker). No string guard sees
that text. Probed offline on 0.162.1: `[features] unified_exec = false` is written but stays
effectively `true`; `shell_tool = false` removes the shell entirely; `unified_exec_tty = false`
drops `tty` from the `exec_command` schema, and codex refuses a forced `tty: true` with
`TTY execution is disabled by config`. A non-tty session has stdin closed, so `write_stdin` fails
with `stdin is closed for this session`. The hook payload does not change.

## Options considered

1. **Disable tty sessions** *(recommended)*: the template sets `[features] unified_exec_tty = false`
   / pros: closes the channel with codex's own refusal, no guard change / cons: the model gets no
   REPL, interactive shell or prompt.
2. **Keep tty, disclose**: the residual is rewritten with the new evidence and the key is
   documented as an opt-in / pros: interactive sessions keep working / cons: the bypass ships open
   by default.

## Decision

**Ratified by the user.** Option 1. `adapters/codex/config.template.toml` sets
`[features] unified_exec_tty = false`.

## Consequences

Interactive programs that need a tty fail under the binding. The closure depends on config: codex
run without the key, outside the binding's launch path, is exposed again. `write_stdin` stays in the
tool list but can reach no stdin. Codex versions after 0.162.1 are unprobed.
