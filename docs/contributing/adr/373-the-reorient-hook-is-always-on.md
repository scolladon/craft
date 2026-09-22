---
subjects:
  - hooks/hooks.json
  - hooks/reorient-after-compact.sh
---
# 373 — The reorient-after-compaction hook is always on

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

## Context

A `SessionStart` hook with matcher `compact` is the only compaction hook whose stdout reaches the
model. craft ships it as a plugin hook, so it fires in every session of every repo the plugin is
installed in, whether or not a craft run is active.

## Options considered

1. **Always on, registered in `hooks/hooks.json`** *(recommended)* — pros: the protection is the
   default; no active run costs one `jq` parse and one `git rev-parse`, then a silent exit /
   cons: runs in unrelated sessions.
2. **Opt-in manifest key** — pros: zero logic outside opted-in repos / cons: unprotected exactly
   where the user forgot to opt in.
3. **Opt-in settings snippet the user copies** — cons: the plugin no longer ships the protection.

## Decision

Ratified by the user as recommended. The reorient hook is registered unconditionally in
`hooks/hooks.json`. It no-ops silently (exit 0, empty stdout, no file written) whenever no craft run
is bound to the session.

## Consequences

- The silent-no-op path is a tested contract: non-git cwd, no run directory, no bound pointer, and
  a torn-down ledger all print nothing.
- A missing `jq` prints one stderr line and exits 0, so it never blocks an unrelated session.
