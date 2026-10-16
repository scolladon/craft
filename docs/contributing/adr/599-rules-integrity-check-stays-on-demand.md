---
subjects:
  - adapters/codex/src/execpolicy-rules.js
  - adapters/codex/bin/trust-hook.js
  - adapters/codex/src/trust-hook-main.js
---
# 599 — The rules integrity check stays on demand

- **Status:** accepted
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/rules-integrity-launch-wiring.md · **Supersedes/Refines:** refines ADR-576

## Context

`assertRulesIntegrity` byte-compares a deployed `craft.rules` to `buildExecpolicyRules()`, but nothing
in the binding calls it. The design that introduced it asked for a launch precondition "at the launch
boundary" (`docs/contributing/design/harden-prove-codex-binding.md` L421–436). The binding has no such
boundary: `buildLaunchArgs` only builds argv, its sole caller is the conformance probe, and operators
start codex themselves. The only operator-run step is `bin/trust-hook.js`. No install step deploys
`craft.rules` to `$CODEX_HOME/rules/`, so a wired check finds the file absent on every documented
install. On codex 0.162.1, `codex exec` refuses to start on an unparseable rules file, but an empty or
comments-only file parses cleanly and forbids nothing.

## Options considered

1. **Keep it on demand and record why** — pros: no behaviour change; puts the remaining gap (a void
   but parseable copy) on the deploy step that creates it / cons: a hand-copied file stays unverified
   until someone runs the check. *(designer's recommendation)*
2. **Wire it into `trust-hook.js`, write mode and `--check`** — pros: verifies hand-copied files now /
   cons: warns on every documented install; refuses an older copy whose rule body is identical.
3. **A dedicated `check-rules` bin** — pros: runnable from a shell / cons: still on demand, plus a new
   bin to maintain.

## Decision

Option 1, ratified by the user. The binding calls `assertRulesIntegrity` from no launch or install
path. The B9 instruction "wire it at the launch boundary" is not carried out, because the binding has
no launch boundary. Verifying a deployed copy belongs to whichever deploy step lands for the open
"No install step deploys `craft.rules`" entry.

## Consequences

- ADR-576's "a later wiring change updates it" now reads "kept on demand" on every surface it lists.
- A deploy step, when it lands, owns verifying what it writes: a post-copy `assertRulesIntegrity`, or a
  symlink to the committed file that the existing drift test already pins.
- Revisit if the binding gains a launcher of its own.
- Revisit if the rule body or `FORBIDDEN_GIT_SUBCOMMANDS` changes: a stale deployed copy then still
  parses and forbids less, codex warns about nothing, and only the byte check catches it.
