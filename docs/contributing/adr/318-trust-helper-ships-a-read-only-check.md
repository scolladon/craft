# 318 — The trust helper ships a read-only `--check`

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/codex-0145-limitation-reprobe.md · **Supersedes/Refines:** none

## Context

The codex binding's README has carried a standing honesty caveat: launch-time trust verification is
not implemented, so an operator has no way to ask whether the guard is actually armed. The
`hooks/list` read needed for the trust path answers exactly that question, and it is implemented
either way.

## Options considered

1. **Ship `--check`: report trust state, never write, exit non-zero when untrusted or modified** *(recommended)* — pros: one flag over a read that already exists; gives operators and CI a real verification capability; no launch-time cost / cons: a second mode to document and test.
2. **Trust only, no verify** — pros: smallest surface / cons: the honesty caveat stands, and checking state means running the writer.
3. **Wire verification into the launch path so an untrusted hook fails the run** — pros: strongest guarantee / cons: every launch pays an app-server spawn, and whether `hooks/list` needs an authenticated `CODEX_HOME` is **unpinned** — a launch-path dependency on an unpinned precondition is exactly the kind of assumption this binding has been burned by.

## Decision

**Ratified by the user, as recommended.** The helper ships `--check`, which never writes and exits
non-zero for `untrusted` and `modified`.

## Consequences

The README's "launch-time trust verification is not implemented" caveat is replaced by a documented
command rather than deleted — the capability is operator-invoked, not automatic, and the README must
say so. `--check` is asserted in tests to never call the config writer. Option 3 stays open for a
later change, but only after the `hooks/list` authentication requirement is pinned by a live probe.
