---
subjects:
  - hooks/git-no-ext-diff.sh
  - docs/contributing/specs/gate.md
  - README.md
supersedes: []
---
# 538 — The git hook crash contract is written in its header, the gate spec and the README

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

## Context

`docs/contributing/specs/gate.md` describes this hook's JSON deny but not its crash half, and no operator doc names `jq`. ADR-535 makes `jq` on `PATH` a hard prerequisite for Bash under the plugin.

## Options considered

1. **Hook header plus a gate.md Claude-binding paragraph linking the design's matrix** — the design's recommendation
2. **Option 1 plus a `jq` requirement in the README Quickstart** — cons: touches README drift guards
3. **Hook header only** — cons: the gate spec keeps stating half the behaviour

## Decision

Ratified by the user: option 2. The hook header states why a crash must end in exit 2 and the residual (ADR-537); `gate.md`'s Claude binding records the 2.1.296 exit-status contract, the crash deny and the residual, linking the design's matrix; the README Quickstart requirement sentence adds `jq` on `PATH`, naming that the guard hook denies every Bash call without it.

## Consequences

Operators learn about `jq` before installing. README edits run the README drift tests.
