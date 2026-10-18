---
subjects:
  - adapters/codex/src/launch-args.js
supersedes: []
---
# 643 — The codex launch path forces tty off

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/codex-write-stdin-tty-close.md · **Supersedes/Refines:** refines ADR-642

## Context

ADR-642 closes the `write_stdin` channel with a template key, one hand-merged config line. Probed
offline on codex-cli 0.162.1: `codex exec -c features.unified_exec_tty=false` closes the channel
with no config key, and overrides a config `unified_exec_tty = true`.

## Options considered

1. **Unconditional flag** *(recommended)*: `buildLaunchArgs` always emits `-c` and
   `features.unified_exec_tty=false` as two argv elements / pros: the binding's own launch path stays
   closed whatever the operator's config says / cons: none measured.
2. **Opt-out parameter** / pros: an escape hatch / cons: a boolean parameter whose only use is to
   reopen the channel.
3. **Template only** / pros: no code change / cons: the closure rests on one config line.

## Decision

**Adopted-as-recommended (no user judgment).** Option 1.

## Consequences

Every `codex exec` the binding launches runs without tty, independent of `config.toml`. Codex run
by hand outside the binding still depends on the template key.
