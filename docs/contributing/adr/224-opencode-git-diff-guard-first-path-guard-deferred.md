# 224 — port the git-diff guard first; evaluate the write-path guard against native permissions

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** none

## Context

pi built two guards: the git-diff guard and a symlink-aware write-path containment guard. opencode ships native `edit` and `external_directory` permissions that may already cover path containment.

## Options considered

1. **Port the git-diff guard now; evaluate the write-path guard against opencode's native `edit`/`external_directory` permissions** *(designer recommendation)* — pros: bounded scope (YAGNI); avoids rebuilding runtime-provided containment. Cons: the path-guard question stays open.
2. **Port both guards (git-diff + symlink-aware path containment)** — cons: may duplicate native permission coverage.
3. **Rely solely on opencode native permissions** — cons: drops the git-diff mechanical-parity item, which native permissions cannot express.

## Decision

*Adopted-as-recommended (no user judgment).* Port the git-diff guard (the mechanical parity item native permissions cannot express) now. Evaluate whether opencode's native `edit`/`external_directory` permissions cover write-path containment before building a second guard.

## Consequences

- Bounded scope; no rebuild of runtime-provided containment.
- The path-guard evaluation is a documented follow-up, resolved against opencode's permission coverage.
