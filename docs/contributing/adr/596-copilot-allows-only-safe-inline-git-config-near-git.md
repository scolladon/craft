---
subjects:
  - engine/src/guards/git-plain-command-gate.js
supersedes: []
---
# 596 — Copilot allows only safe inline git config near git

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md · **Supersedes/Refines:** refines ADR-595

## Context

Git runs the value of several config keys as a command. Proven with real git and a benign marker:
`git -c core.fsmonitor='<cmd>' status` executes `<cmd>`. The copilot guard allowed
`git -c core.fsmonitor='git push origin main' status`, `-c core.sshCommand=…`,
`-c credential.helper='!…'` and `-c core.pager=…`: plain text that the plain-command gate accepts
and the normaliser does not judge (only `alias.*` and `include*` keys block). The same holds for
environment channels such as `GIT_SSH_COMMAND`, `GIT_PAGER`, `GIT_EXTERNAL_DIFF` and `GIT_EDITOR`.

## Options considered

1. **Allowlist inline config keys near git; deny any `GIT_*=` assignment near git** *(recommended)*
   — pros: closes the class and future command-running keys by construction, in line with the
   plain-command allowlist / cons: an unusual `-c` key needs a re-issue without it.
2. **Deny-list the command-running keys** — cons: git has dozens (filters, textconv, merge drivers,
   hooks paths, helpers) and adds more; the next one is a bypass.

## Decision

Adopted-as-recommended (no user judgment): option 1, as an application of the ratified ADR-595
allowlist posture. On copilot, when a command mentions git, every `-c`/`--config-env` key must be in
a fixed safe set (`user.name`, `user.email`, `commit.gpgsign`, `tag.gpgsign`, `core.quotepath`,
`color.ui`, `color.*`, `advice.*`, `init.defaultbranch`, `log.*`, `format.pretty`, `diff.noprefix`,
`pager.*` set to `false`), and no word may be a `GIT_<NAME>=` assignment; otherwise the gate denies
with its fixed reason.

## Consequences

Command-running config is closed on copilot without enumerating it. Keys outside the safe set cost a
re-issue. Config files (`~/.gitconfig`, repo config) stay a documented residual.
