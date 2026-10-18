---
subjects:
  - adapters/codex/src/git-guard-adapter.js
  - adapters/codex/hooks/craft-guard.js
  - engine/src/guards/git-plain-command-gate.js
supersedes: []
---
# 641 — Codex takes the plain-command gate without a deadline

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/codex-git-destructive-predicate-hook.md · **Supersedes/Refines:** refines ADR-595, ADR-606

## Context

Without the plain-command gate, bypass classes the predicate allows stay open on codex: extglob
`@(git) push`, a dynamic shell flag (`C=-c; bash $C 'git push'`), a brace word holding an expansion,
`echo $[1<<2]` swallowing the next line, pipe-to-shell or xargs, and the heredoc commit idiom with a
`)` in its body. The last was proven live through codex-cli 0.162.1: the model chose `/bin/bash`
3.2 through the `exec_command` `shell` argument, which the hook payload does not carry; the hook
allowed; bash ran `git branch -D victim` and only the workspace-write sandbox's `.git` lock stopped
it. A codex hook that runs past its `timeout` fails open, but the default exceeds 90 s and craft sets
none; the slowest sampled verdict took 50 ms on a 57k-character command.

## Options considered

1. **Gate, no deadline** *(recommended)* — the gate runs in-process in the existing hook / pros:
   closes every class above / cons: a command near git holding `$`, `\"` or a wrapper is denied
   and must be re-issued plainly.
2. **Gate plus a worker-thread deadline** — pros: copilot parity / cons: a worker file and moved
   modules against a slow path not observed on codex.
3. **Neither** — pros: `$VAR`-near-git commands keep working / cons: every class above ships.

## Decision

**Ratified by the user.** Option 1. On codex, a Bash command that mentions git is judged by
`gitPlainCommandGate` first, then the destructive and ext-diff predicates, through
`plainGitCommandVerdict`. The hook computes the verdict in-process; no deadline is added.

## Consequences

Codex denies non-plain commands near git with the gate's fixed reason, the same cost copilot pays.
The no-deadline choice rests on the measured >90 s default timeout; if that default proves bounded
low, the deadline becomes worth adding. The gate's bash-3.2 rationale applies to codex because the
model can pick the tool shell.
