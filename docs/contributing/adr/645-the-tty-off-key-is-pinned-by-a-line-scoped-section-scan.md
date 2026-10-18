---
subjects:
  - adapters/codex/test/config.test.js
supersedes: []
---
# 645 — The tty-off key is pinned by a line-scoped section scan

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/codex-write-stdin-tty-close.md · **Supersedes/Refines:** refines ADR-644

## Context

The suite is node-only and has no TOML parser. The failure modes to catch are a commented-out key
and a key that lands in the wrong table.

## Options considered

1. **Line-scoped section scan** *(recommended)*: find the `[features]` header line, collect lines up
   to the next header, require one `unified_exec_tty = false` line / pros: catches both failure modes,
   no dependency, same line-shaped approach as the hook-entry test / cons: not a full TOML parse.
2. **Whole-file regex** / pros: one line / cons: passes on a commented-out key or a wrong table.
3. **External TOML parser subprocess** / pros: exact parse / cons: a python dependency in a node
   suite.

## Decision

**Adopted-as-recommended (no user judgment).** Option 1.

## Consequences

A quoted or inline-table spelling of the key would fail the pin; the template keeps the plain form.
